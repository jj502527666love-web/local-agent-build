// ClawBot 主编排（模块级单例）：
//   启动/停止 → 每连接一个 getupdates 长轮询循环 → 入站消息按微信用户 FIFO 排队 →
//   注入主进程对话引擎（sendMessage window=null 纯后台跑）→ 完成后取回复 → sendmessage 回发。
// 关键纪律（对照开发计划）：
//   - 游标 get_updates_buf 每轮先持久化再处理消息（崩溃最多重放一轮，配合 message_id 去重）
//   - 同会话连发会触发引擎 replaced 打断 → 同一微信用户的消息严格串行
//   - window=null 时工具审批由注入的 approvalDecider 按桥内白名单自动裁决
//   - errcode=-14：暂停 60 分钟自动重试一次，仍失效则置 expired 等用户重扫
//   - 循环体经 runInEpoch 包裹：账号热切换后旧循环读库即抛 AccountSwitchedError 自然死亡

import { BrowserWindow, Notification } from 'electron'
import { isAbsolute, join, relative, resolve } from 'path'
import { v4 as uuid } from 'uuid'
import * as api from './ilink-api'
import { ILinkAbortedError } from './ilink-api'
import * as store from './clawbot-store'
import * as login from './clawbot-login'
import type { ClawbotConnection, ClawbotConnectionSummary } from './clawbot-store'
import { processInboundMessage } from './clawbot-inbound'
import { sendOutboundReply, sendPlainText } from './clawbot-outbound'
import { ERRCODE_SESSION_TIMEOUT, MESSAGE_TYPE, TYPING_STATUS } from './ilink-types'
import type { WeixinMessage } from './ilink-types'
import { sendMessage as engineSendMessage, cancelChat as engineCancelChat } from '../chat-engine'
import { createConversation, getConversation, getMessages, updateConversationImageModel } from '../conversation'
import { createBot, getBot, listBots } from '../bot'
import { getCloudModels, getAllowClawbot } from '../cloud-token'
import { getSetting, setSetting } from '../settings'
import { getDataDir } from '../data-path'
import { runInEpoch } from '../account-epoch'
import type { Conversation } from '../conversation'

// ===== 运行态 =====

interface Runtime {
  connectionId: string
  abort: AbortController
  /** 按微信用户的 FIFO 队列（同 peer 串行，防引擎 replaced 打断） */
  peerQueues: Map<string, Promise<void>>
  /** 入站去重（message_id），上限 500 条滚动 */
  seenIds: Set<string>
  /** typing_ticket 按用户缓存（TTL 24h） */
  typingTickets: Map<string, { ticket: string; expiresAt: number }>
  /** 桥发起的引擎轮次（conversationId → requestId），stop 时精确取消（不误伤桌面端同会话的轮次） */
  activeRounds: Map<string, string>
  /** 已发送到微信的会话消息水位线（conversationId → 最后已发消息的 created_at） */
  lastSentByConv: Map<string, string>
  /** 异步补发 watcher（conversationId → AbortController）：生图等 fire-and-forget 追加消息的补发窗口 */
  replyWatchers: Map<string, AbortController>
  loopDone: Promise<void> | null
}

export interface ClawbotState {
  connection: ClawbotConnectionSummary | null
  running: boolean
  login: login.ClawbotLoginState
  todaySent: number
  dailyLimit: number
  peerCount: number
}

const SEEN_IDS_CAP = 500
const SESSION_PAUSE_MS = 60 * 60_000
const DEFAULT_DAILY_LIMIT = 450
const DEFAULT_BOT_NAME = '微信助手'

let runtime: Runtime | null = null

// ===== 通用小件 =====

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolvePromise()
    }, ms)
    ;(timer as any).unref?.()
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new ILinkAbortedError())
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function notifyDesktop(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  } catch {
    /* 通知不支持时静默 */
  }
}

// ===== 状态广播 =====

export function getClawbotState(): ClawbotState {
  const conn = store.getPrimaryConnectionSummary()
  return {
    connection: conn,
    running: runtime !== null,
    login: login.getLoginState(),
    todaySent: safeCount(() => store.countTodayOutgoing()),
    dailyLimit: getDailyLimit(),
    peerCount: conn ? safeCount(() => store.countPeers(conn.id)) : 0
  }
}

function safeCount(fn: () => number): number {
  try {
    return fn()
  } catch {
    return 0
  }
}

function getDailyLimit(): number {
  const n = Number(getSetting('clawbot_daily_send_limit'))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT
}

/** 全窗口广播（ewei:progress 同款惯例）：关窗到托盘时自然静默 */
function broadcastStatus(): void {
  const payload = getClawbotState()
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('clawbot:status', payload)
    } catch {
      /* 窗口销毁竞态忽略 */
    }
  }
}

function broadcastPeerMessage(payload: { connectionId: string; peerId: string; conversationId: string; summary: string }): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('clawbot:peerMessage', payload)
    } catch {
      /* ignore */
    }
  }
}

// ===== 启动 / 停止 =====

export async function startClawbotBridge(): Promise<void> {
  login.setLoginStateListener(() => broadcastStatus())
  // 使用权限门控（allow_clawbot，默认拒绝）：无权限时桥不启动；菜单显示与此解耦
  if (!getAllowClawbot()) {
    stopClawbotBridge()
    broadcastStatus()
    return
  }
  const conn = store.getPrimaryConnection()
  if (!conn || !conn.enabled || !conn.bot_token_enc) {
    stopClawbotBridge()
    broadcastStatus()
    return
  }
  // expired 终态不自动重起：token 已死，重跑只会再走一轮 -14 暂停循环并重复弹掉线通知，
  // 必须等用户重新扫码（saveLoginResult 会把 status 置回 online）
  if (conn.status === 'expired') {
    broadcastStatus()
    return
  }
  // 幂等：同一连接已在跑直接返回（cloud:setToken 登录回流等重复触发场景）
  if (runtime && runtime.connectionId === conn.id) {
    broadcastStatus()
    return
  }
  stopClawbotBridge()
  const abort = new AbortController()
  const rt: Runtime = {
    connectionId: conn.id,
    abort,
    peerQueues: new Map(),
    seenIds: new Set(),
    typingTickets: new Map(),
    activeRounds: new Map(),
    lastSentByConv: new Map(),
    replyWatchers: new Map(),
    loopDone: null
  }
  runtime = rt
  store.setConnectionStatus(conn.id, 'connecting')
  broadcastStatus()
  // 循环体进 epoch：账号热切换后旧循环读库抛 AccountSwitchedError 自然死亡
  rt.loopDone = runInEpoch(() => pollLoop(rt))
  rt.loopDone
    .catch((e) => {
      console.error('[clawbot] poll loop exited with error:', e)
    })
    .finally(() => {
      if (runtime === rt) {
        runtime = null
        broadcastStatus()
      }
    })
  // notifyStart 尽力而为
  try {
    const token = store.resolveBotToken(conn)
    void api.notifyStart(conn.baseurl, token)
  } catch {
    /* 凭据异常由轮询循环处理 */
  }
}

export function stopClawbotBridge(): void {
  const rt = runtime
  if (!rt) return
  runtime = null
  rt.abort.abort()
  // 取消桥发起的在途引擎轮次（精确到 requestId，不误伤桌面端用户在同会话里的轮次）
  for (const [conversationId, requestId] of rt.activeRounds) {
    try {
      engineCancelChat(conversationId, requestId)
    } catch {
      /* ignore */
    }
  }
  rt.activeRounds.clear()
  // 停止全部异步补发 watcher
  for (const ctrl of rt.replyWatchers.values()) ctrl.abort()
  rt.replyWatchers.clear()
  // connecting/online 是进程级暂态，停止后必须降级，避免 DB 里残留假「在线」
  try {
    const status = store.getConnectionStatus(rt.connectionId)
    if (status === 'connecting' || status === 'online') store.setConnectionStatus(rt.connectionId, 'offline')
  } catch {
    /* 库已关闭等场景忽略 */
  }
  // 通知服务端会话结束（尽力）
  try {
    const conn = store.getPrimaryConnection()
    if (conn && conn.bot_token_enc) {
      const token = store.resolveBotToken(conn)
      void api.notifyStop(conn.baseurl, token)
    }
  } catch {
    /* ignore */
  }
}

// ===== 长轮询循环 =====

async function pollLoop(rt: Runtime): Promise<void> {
  const signal = rt.abort.signal
  let failCount = 0
  let sessionFailCount = 0
  while (!signal.aborted) {
    const conn = store.getPrimaryConnection()
    if (!conn || conn.id !== rt.connectionId || !conn.enabled || !conn.bot_token_enc) break

    // -14 暂停期：每 30s 醒来检查一次
    if (conn.paused_until) {
      const until = Date.parse(conn.paused_until)
      if (Number.isFinite(until) && until > Date.now()) {
        await sleep(30_000, signal).catch(() => {})
        continue
      }
    }

    let token: string
    try {
      token = store.resolveBotToken(conn)
    } catch (e) {
      store.setConnectionStatus(conn.id, 'expired', e instanceof Error ? e.message : String(e))
      broadcastStatus()
      break
    }

    try {
      const resp = await api.getUpdates(conn.baseurl, token, conn.get_updates_buf, signal)
      failCount = 0

      // 会话失效：先暂停 60 分钟自动重试，再失效则置 expired 等用户重扫
      if (resp.errcode === ERRCODE_SESSION_TIMEOUT || resp.ret === ERRCODE_SESSION_TIMEOUT) {
        sessionFailCount++
        if (sessionFailCount >= 2) {
          store.setConnectionStatus(conn.id, 'expired', '登录态已失效，请重新扫码绑定')
          notifyDesktop('微信 ClawBot 已掉线', '登录态失效，请打开「微信 ClawBot」页重新扫码绑定')
          broadcastStatus()
          break
        }
        store.updateConnectionFields(conn.id, {
          status: 'paused',
          paused_until: new Date(Date.now() + SESSION_PAUSE_MS).toISOString(),
          last_error: '登录态失效，60 分钟后自动重试'
        })
        broadcastStatus()
        continue
      }
      sessionFailCount = 0

      // 非 -14 的非零 ret/errcode：不是有效响应，按失败退避（否则服务端持续报错时会零退避热循环）
      const errcode = resp.errcode ?? resp.ret ?? 0
      if (errcode !== 0) {
        failCount++
        try {
          store.updateConnectionFields(conn.id, { last_error: `getupdates errcode=${errcode} ${resp.errmsg || ''}`.slice(0, 200) })
        } catch {
          /* ignore */
        }
        if (failCount === 1 || failCount % 10 === 0) broadcastStatus()
        await sleep(failCount <= 2 ? 2000 : 30_000, signal).catch(() => {})
        continue
      }

      if (store.getConnectionStatus(conn.id) !== 'online') {
        store.setConnectionStatus(conn.id, 'online')
        broadcastStatus()
      }

      // 先持久化游标再处理消息（防重复消费）。
      // 已知权衡：崩溃/退出窗口内（游标已推进、队列未消化）该批消息会丢失；
      // 反向方案（处理后写游标）会在崩溃时重复消费。iLink 无历史消息 API，
      // 两害相权取「不重复」，与官方「重启靠持久化游标续传」的用法一致。
      const newBuf = resp.get_updates_buf
      if (typeof newBuf === 'string' && newBuf && newBuf !== conn.get_updates_buf) {
        store.updateConnectionFields(conn.id, { get_updates_buf: newBuf })
      }

      for (const msg of resp.msgs || []) {
        enqueueInbound(rt, conn, msg)
      }
    } catch (e) {
      if (e instanceof ILinkAbortedError) {
        if (signal.aborted) break
        continue // 客户端 40s 超时 = 正常空轮
      }
      failCount++
      const message = e instanceof Error ? e.message : String(e)
      try {
        store.updateConnectionFields(conn.id, { last_error: message.slice(0, 200) })
      } catch {
        /* ignore */
      }
      if (failCount === 1 || failCount % 10 === 0) broadcastStatus()
      await sleep(failCount <= 2 ? 2000 : 30_000, signal).catch(() => {})
    }
  }
}

// ===== 入站分发 =====

function enqueueInbound(rt: Runtime, conn: ClawbotConnection, msg: WeixinMessage): void {
  if (msg.message_type !== MESSAGE_TYPE.USER) return
  const peerId = msg.from_user_id || ''
  if (!peerId) return
  if (msg.group_id) {
    store.insertLog({
      connection_id: conn.id,
      peer_id: peerId,
      direction: 'in',
      msg_type: 'system',
      summary: '群聊消息（官方未开放，已忽略）',
      status: 'dropped'
    })
    return
  }
  // message_id 去重（崩溃重放/网络重试兜底）
  const mid = msg.message_id || msg.client_id || ''
  if (mid) {
    if (rt.seenIds.has(mid)) return
    rt.seenIds.add(mid)
    if (rt.seenIds.size > SEEN_IDS_CAP) {
      const oldest = rt.seenIds.values().next().value
      if (oldest !== undefined) rt.seenIds.delete(oldest)
    }
  }
  const peer = store.ensurePeer(conn.id, peerId)
  // context_token 始终用最新入站值（不可复用旧消息的）
  if (msg.context_token) store.updatePeerContextToken(peer.id, msg.context_token)
  store.touchPeerMessageAt(peer.id)

  const prev = rt.peerQueues.get(peerId) || Promise.resolve()
  const next = prev
    .then(() => processOne(rt, conn.id, peerId, msg))
    .catch((e) => console.error('[clawbot] processOne failed:', e))
  rt.peerQueues.set(peerId, next)
  // 队列消化完毕后清理 Map 条目（防长期运行下按 peer 只增不减）
  next.then(() => {
    if (rt.peerQueues.get(peerId) === next) rt.peerQueues.delete(peerId)
  })
}

// ===== 单条处理流水线 =====

async function processOne(rt: Runtime, connectionId: string, peerId: string, msg: WeixinMessage): Promise<void> {
  const conn = store.getPrimaryConnection()
  if (!conn || conn.id !== connectionId) return
  const token = store.resolveBotToken(conn)
  const peer = store.getPeer(connectionId, peerId)
  if (!peer) return
  const contextToken = peer.last_context_token || msg.context_token || ''
  if (!contextToken) {
    store.insertLog({
      connection_id: connectionId,
      peer_id: peerId,
      direction: 'in',
      msg_type: 'system',
      summary: '缺少 context_token，无法关联回复，已丢弃',
      status: 'dropped'
    })
    return
  }

  // 1. 解析入站（下载解密媒体可能抛错）
  let parsed
  try {
    parsed = await processInboundMessage(msg)
  } catch (e) {
    store.insertLog({
      connection_id: connectionId,
      peer_id: peerId,
      direction: 'in',
      msg_type: 'unknown',
      summary: '消息解析失败',
      status: 'error',
      error: e instanceof Error ? e.message : String(e)
    })
    await safeSendPlain(conn, token, peerId, contextToken, '处理这条消息时出错了，请稍后再试。', rt.abort.signal)
    return
  }

  if (parsed.kind === 'unsupported') {
    store.insertLog({
      connection_id: connectionId,
      peer_id: peerId,
      direction: 'in',
      msg_type: parsed.msgType,
      summary: parsed.summary,
      status: 'dropped'
    })
    await safeSendPlain(conn, token, peerId, contextToken, parsed.notice || '暂不支持这类消息。', rt.abort.signal)
    return
  }
  store.insertLog({ connection_id: connectionId, peer_id: peerId, direction: 'in', msg_type: parsed.msgType, summary: parsed.summary })

  // 2. 校验绑定智能体
  const botId = conn.bot_id
  if (!botId || !getBot(botId)) {
    await safeSendPlain(conn, token, peerId, contextToken, '还没有绑定智能体，请在桌面端「微信 ClawBot」页完成绑定后再聊。', rt.abort.signal)
    return
  }

  // 3. 取/建会话（会话被删等场景自动重建）
  let conversationId = peer.conversation_id
  let conv = conversationId ? getConversation(conversationId) : null
  if (!conversationId || !conv) {
    conv = createConversationForPeer(botId, peerId)
    conversationId = conv.id
    store.updatePeerConversation(peer.id, conversationId)
  } else if (!conv.active_image_model_id) {
    // 老会话回填默认生图模型（一次性幂等）：此前微信会话未预填生图模型，
    // 导致引擎让 LLM 自由选服务商（与桌面端新建会话行为不一致）
    const imgModel = resolveDefaultImageModel()
    if (imgModel) updateConversationImageModel(conversationId, imgModel.provider_id, imgModel.model_id)
  }

  // 同会话新轮开始：停掉上一轮的异步补发 watcher，避免并发 flush 重复发送
  rt.replyWatchers.get(conversationId)?.abort()
  rt.replyWatchers.delete(conversationId)

  // 初始化水位线（仅首次）：只发「本轮及以后」的新消息，会话历史不补发（防首轮把全部历史刷给用户）
  if (!rt.lastSentByConv.has(conversationId)) {
    const history = getMessages(conversationId)
    rt.lastSentByConv.set(conversationId, history[history.length - 1]?.created_at || '')
  }

  // 4. typing 开始（失败不影响主流程）
  const stopTyping = await startTyping(rt, conn, token, peerId, contextToken)

  // 5. 调对话引擎（window=null 纯后台跑，审批走桥内白名单）
  let engineThrow: Error | null = null
  const requestId = `clawbot-${uuid()}`
  rt.activeRounds.set(conversationId, requestId)
  try {
    await engineSendMessage(
      {
        conversationId,
        botId,
        content: parsed.content,
        attachments: parsed.attachments,
        requestId,
        approvalDecider: makeApprovalDecider(conversationId)
      },
      null
    )
  } catch (e) {
    engineThrow = e instanceof Error ? e : new Error(String(e))
  } finally {
    if (rt.activeRounds.get(conversationId) === requestId) rt.activeRounds.delete(conversationId)
    stopTyping()
  }

  // 6. 回发本轮全部新 assistant 消息（而非仅最后一条）：
  //    引擎一轮会产生多条 assistant（工具前言 + 最终回复），逐条按序发送
  if (engineThrow) {
    await safeSendPlain(conn, token, peerId, contextToken, translateEngineThrow(engineThrow), rt.abort.signal)
  } else {
    const sent = await flushNewAssistantMessages(rt, conn, token, peerId, contextToken, conversationId)
    if (sent === 0) {
      await safeSendPlain(conn, token, peerId, contextToken, '（没有生成回复，请再发一次试试）', rt.abort.signal)
    }
    // 7. 异步补发 watcher：生图是 fire-and-forget 后台任务（引擎 resolve 时图还没好，结果稍后追加），
    //    在窗口期内把后续追加的 assistant 消息（生图结果等）补发给微信
    scheduleReplyWatcher(rt, conn, token, peerId, contextToken, conversationId)
  }

  // 8. 广播：对话页联动刷新 + 状态计数
  broadcastPeerMessage({ connectionId, peerId, conversationId, summary: parsed.summary.slice(0, 80) })
  broadcastStatus()
}

/**
 * 把水位线之后的新 assistant 消息逐条发给微信（含 [Error]/中断标记转译、日限额拦截）。
 * 返回成功发送的条数；发送失败中断后续（保序）。
 */
async function flushNewAssistantMessages(
  rt: Runtime,
  conn: ClawbotConnection,
  token: string,
  peerId: string,
  contextToken: string,
  conversationId: string
): Promise<number> {
  const lastSent = rt.lastSentByConv.get(conversationId) || ''
  const pending = getMessages(conversationId).filter(
    (m) => m.role === 'assistant' && (m.created_at || '') > lastSent && String(m.content || '').trim()
  )
  let sent = 0
  for (const m of pending) {
    // 日发送限额（风控）：超限记日志并停止后续
    if (store.countTodayOutgoing() >= getDailyLimit()) {
      store.insertLog({
        connection_id: conn.id,
        peer_id: peerId,
        direction: 'out',
        msg_type: 'system',
        summary: '达到日发送上限，回复已拦截',
        status: 'dropped'
      })
      broadcastStatus()
      break
    }
    const text = translateMarkedError(String(m.content)) ?? String(m.content)
    try {
      await sendOutboundReply(
        {
          conn,
          token,
          peerId,
          contextToken,
          signal: rt.abort.signal,
          onSent: (kind, summary) =>
            store.insertLog({
              connection_id: conn.id,
              peer_id: peerId,
              direction: 'out',
              msg_type: kind === 'image' ? 'image' : 'text',
              summary
            })
        },
        text
      )
      rt.lastSentByConv.set(conversationId, m.created_at || new Date().toISOString())
      sent++
    } catch (e) {
      store.insertLog({
        connection_id: conn.id,
        peer_id: peerId,
        direction: 'out',
        msg_type: 'system',
        summary: '回复发送失败',
        status: 'error',
        error: e instanceof Error ? e.message : String(e)
      })
      break
    }
  }
  return sent
}

/**
 * 异步补发 watcher：引擎 resolve 后仍有后台任务（生图等）在跑，其结果以 appendMessage 稍后落库。
 * 窗口期最长 180s，每 3s 检查一次；连续 12s 无新消息且已过 30s 则提前结束。
 */
function scheduleReplyWatcher(
  rt: Runtime,
  conn: ClawbotConnection,
  token: string,
  peerId: string,
  contextToken: string,
  conversationId: string
): void {
  const ctrl = new AbortController()
  rt.replyWatchers.set(conversationId, ctrl)
  const startedAt = Date.now()
  let silentRounds = 0
  void (async () => {
    for (let i = 0; i < 60; i++) {
      if (ctrl.signal.aborted || rt.abort.signal.aborted) break
      await sleep(3000, ctrl.signal).catch(() => {})
      if (ctrl.signal.aborted || rt.abort.signal.aborted) break
      const sent = await flushNewAssistantMessages(rt, conn, token, peerId, contextToken, conversationId)
      if (sent > 0) {
        silentRounds = 0
      } else {
        silentRounds++
      }
      if (silentRounds >= 4 && Date.now() - startedAt >= 30_000) break
    }
    if (rt.replyWatchers.get(conversationId) === ctrl) rt.replyWatchers.delete(conversationId)
  })().catch((e) => console.error('[clawbot] reply watcher failed:', e))
}

async function safeSendPlain(
  conn: ClawbotConnection,
  token: string,
  peerId: string,
  contextToken: string,
  text: string,
  signal?: AbortSignal
): Promise<void> {
  try {
    await sendPlainText({ conn, token, peerId, contextToken, signal }, text)
  } catch (e) {
    console.error('[clawbot] safeSendPlain failed:', e)
  }
}

// ===== 会话与模型 =====

/** 主进程版默认对话模型解析：取已授权云端模型列表第一个 chat 模型（复合 key 精确路由） */
function resolveDefaultChatModel(): { provider_id: string; model_id: string } | null {
  const first = getCloudModels().find((m) => m.type === 'chat')
  if (!first) return null
  return { provider_id: 'cloud:default', model_id: `${first.model_id}#@${first.provider_name}` }
}

/**
 * 主进程版默认生图模型解析：取已授权云端模型列表第一个 image 模型。
 * 与桌面端新建会话行为对齐（ChatView.resolveDefaultImageModel 同款兜底链）——
 * 不预填的话，会话 active_image_model_id 为空时引擎会让 LLM 自行 list_providers 自由选，
 * 表现为「微信里生图不走桌面端选的服务商/模型」。
 */
function resolveDefaultImageModel(): { provider_id: string; model_id: string } | null {
  const first = getCloudModels().find((m) => m.type === 'image')
  if (!first) return null
  return { provider_id: 'cloud:default', model_id: `${first.model_id}#@${first.provider_name}` }
}

function createConversationForPeer(botId: string, peerId: string): Conversation {
  const bot = getBot(botId)
  // peer 显示名：剥 @im.wechat 后缀取后 6 位
  const shortId = peerId.replace(/@im\.wechat$/, '').slice(-6) || 'user'
  // 初始模型：绑定 bot 自带模型优先，否则解析默认 chat 模型（保证引擎回退链非空）
  let initialModel: { provider_id: string; model_id: string } | null = null
  if (bot?.model_provider_id && bot.model_id) {
    initialModel = { provider_id: bot.model_provider_id, model_id: bot.model_id }
  } else {
    initialModel = resolveDefaultChatModel()
  }
  if (!initialModel) {
    throw new Error('暂无可用对话模型，请先在「模型服务」确认已授权 chat 模型')
  }
  return createConversation(botId, `微信-${shortId}`, initialModel, resolveDefaultImageModel() ?? undefined)
}

// ===== 回复提取与错误转译 =====

/** [Error] / 中断标记 → 用户可读文案；返回 null 表示不是错误标记 */
function translateMarkedError(content: string): string | null {
  const trimmed = content.trim()
  if (trimmed.startsWith('[Error]')) {
    const msg = trimmed.slice(7).trim()
    if (/余额不足|balance|insufficient/i.test(msg)) return '账户余额不足，请充值后再试。'
    if (/Cloud login required/i.test(msg)) return '桌面端云控登录已失效，请在桌面端重新登录后再试。'
    if (/未选择对话模型/.test(msg)) return '绑定的智能体还没有配置对话模型，请在桌面端检查。'
    return `生成回复失败：${msg.slice(0, 150) || '未知错误'}`
  }
  if (trimmed.includes('[上一轮已被新消息中断]') || trimmed.includes('[已中断]')) {
    return '回复被中断了，请再发一次。'
  }
  return null
}

function translateEngineThrow(e: Error): string {
  if (e.message === 'Bot not found') return '绑定的智能体不存在了，请在桌面端「微信 ClawBot」页重新绑定。'
  if (e.message === 'Conversation not found') return '会话丢失了，请再发一次这条消息。'
  if (/未选择对话模型/.test(e.message)) return '绑定的智能体还没有配置对话模型，请在桌面端检查。'
  if (/Cloud login required/i.test(e.message)) return '桌面端云控登录已失效，请在桌面端重新登录后再试。'
  return `处理失败：${e.message.slice(0, 150)}`
}

// ===== typing =====

async function startTyping(
  rt: Runtime,
  conn: ClawbotConnection,
  token: string,
  peerId: string,
  contextToken: string
): Promise<() => void> {
  try {
    let cached = rt.typingTickets.get(peerId)
    if (!cached || cached.expiresAt < Date.now()) {
      const resp = await api.getConfig(conn.baseurl, token, peerId, contextToken, rt.abort.signal)
      if (resp?.typing_ticket) {
        cached = { ticket: resp.typing_ticket, expiresAt: Date.now() + 24 * 3600_000 }
        rt.typingTickets.set(peerId, cached)
      }
    }
    if (!cached) return () => {}
    const ticket = cached.ticket
    await api.sendTyping(conn.baseurl, token, peerId, ticket, TYPING_STATUS.TYPING, rt.abort.signal)
    const timer = setInterval(() => {
      api.sendTyping(conn.baseurl, token, peerId, ticket, TYPING_STATUS.TYPING).catch(() => {})
    }, 5000)
    ;(timer as any).unref?.()
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      api.sendTyping(conn.baseurl, token, peerId, ticket, TYPING_STATUS.CANCEL).catch(() => {})
    }
  } catch {
    return () => {}
  }
}

// ===== 审批白名单 =====

export interface ApprovalPolicy {
  /** 工作区内文件写操作自动批（生成文件类任务的最低需求） */
  allowWorkspaceWrite: boolean
  /** 工作区内文件读自动批 */
  allowWorkspaceRead: boolean
  /** 工作区外文件读自动批（默认关：防静默外泄） */
  allowOutsideRead: boolean
  /** 内置小工具（时间/计算器/网页抓取/JSON/文本/随机数）自动批 */
  allowBuiltinUtils: boolean
  /** 非只读 MCP 工具自动批（默认关） */
  allowMcp: boolean
  /** run_command 自动批（默认关：远程触发命令执行风险不可接受） */
  allowRunCommand: boolean
}

const WRITING_FILE_OPS = new Set(['write', 'append', 'mkdir', 'delete', 'copy', 'rename', 'write_json'])
const READING_FILE_OPS = new Set(['read', 'read_json', 'list', 'glob', 'find_latest', 'tree'])
const BUILTIN_SAFE_TOOLS = new Set(['get_current_time', 'calculator', 'fetch_webpage', 'json_tool', 'text_tool', 'random_generator'])

const DEFAULT_POLICY: ApprovalPolicy = {
  allowWorkspaceWrite: true,
  allowWorkspaceRead: true,
  allowOutsideRead: false,
  allowBuiltinUtils: true,
  allowMcp: false,
  allowRunCommand: false
}

export function getApprovalPolicy(): ApprovalPolicy {
  try {
    const raw = getSetting('clawbot_approval_whitelist')
    if (!raw) return { ...DEFAULT_POLICY }
    return { ...DEFAULT_POLICY, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

export function setApprovalPolicy(patch: Partial<ApprovalPolicy>): ApprovalPolicy {
  const next = { ...getApprovalPolicy(), ...patch }
  setSetting('clawbot_approval_whitelist', JSON.stringify(next))
  return next
}

function resolveWithinWorkspace(p: string, sandboxDir: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(sandboxDir, p)
}

/** 跨平台判断 child 是否位于 parent 内（Windows 大小写不敏感），与 chat-engine 同规则 */
function isWithinDir(child: string, parent: string): boolean {
  if (!child || !parent) return false
  const c = process.platform === 'win32' ? child.toLowerCase() : child
  const p = process.platform === 'win32' ? parent.toLowerCase() : parent
  const rel = relative(p, c)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 桥内自动审批决策器（注入 chat-engine；仅 window=null 时生效）。
 * 默认拒绝一切未点名工具（deck_*、非只读 MCP、unsandboxed 技能等全部落在此类），
 * 白名单只放：工作区内文件读写、内置小工具；run_command 永远默认拒。
 */
function makeApprovalDecider(conversationId: string) {
  const sandboxDir = join(getDataDir(), 'workspaces', conversationId)
  const policy = getApprovalPolicy()
  return ({ name, args }: { name: string; args: any }): boolean => {
    if (name === 'run_command') return policy.allowRunCommand
    if (name === 'mcp_call') return policy.allowMcp
    if (name === 'file_ops') {
      const action = String(args?.action || '')
      if (WRITING_FILE_OPS.has(action)) {
        return policy.allowWorkspaceWrite && allPathsWithin(args, sandboxDir)
      }
      if (READING_FILE_OPS.has(action)) {
        const p = typeof args?.path === 'string' ? args.path : ''
        if (!p) return policy.allowWorkspaceRead
        const inside = isWithinDir(resolveWithinWorkspace(p, sandboxDir), resolve(sandboxDir))
        return inside ? policy.allowWorkspaceRead : policy.allowOutsideRead
      }
      // stat/exists 等元数据操作放行
      return true
    }
    if (BUILTIN_SAFE_TOOLS.has(name)) return policy.allowBuiltinUtils
    return false
  }
}

/** copy/rename 等可能带多路径参数：所有可疑路径字段都必须在工作区内 */
function allPathsWithin(args: any, sandboxDir: string): boolean {
  const PATH_KEYS = ['path', 'from', 'to', 'source', 'destination', 'src', 'dest', 'target', 'new_path', 'old_path']
  const root = resolve(sandboxDir)
  for (const key of PATH_KEYS) {
    const v = args?.[key]
    if (typeof v !== 'string' || !v) continue
    if (!isWithinDir(resolveWithinWorkspace(v, sandboxDir), root)) return false
  }
  return true
}

// ===== IPC 面使用的管理操作 =====

/** 发起扫码登录（fire-and-forget）；confirmed 后自动接力启动桥 */
export async function startLoginFlow(): Promise<void> {
  login.setLoginStateListener(() => broadcastStatus())
  try {
    await login.startLogin()
  } finally {
    broadcastStatus()
    if (login.getLoginState().phase === 'confirmed') {
      try {
        await startClawbotBridge()
      } catch (e) {
        console.error('[clawbot] start after login failed:', e)
      }
    }
  }
}

export function cancelLoginFlow(): void {
  login.cancelLogin()
  broadcastStatus()
}

export function submitVerifyCode(code: string): void {
  login.submitVerifyCode(code)
}

/** 登出：停轮询、清凭据，保留 peer 映射（重扫后上下文可续） */
export function logoutClawbot(): void {
  stopClawbotBridge()
  const conn = store.getPrimaryConnection()
  if (conn) store.clearCredentials(conn.id)
  broadcastStatus()
}

export function bindBot(botId: string): void {
  if (!getBot(botId)) throw new Error('智能体不存在')
  const conn = store.ensurePrimaryConnection()
  store.updateConnectionFields(conn.id, { bot_id: botId })
  broadcastStatus()
}

/** 一键新建默认「微信助手」并绑定（幂等：按名字复用已有） */
export function createDefaultBotAndBind(): { botId: string; created: boolean } {
  let created = false
  let bot = listBots().find((b) => b.name === DEFAULT_BOT_NAME) || null
  if (!bot) {
    const model = resolveDefaultChatModel()
    bot = createBot({
      name: DEFAULT_BOT_NAME,
      description: '微信 ClawBot 默认智能体（自动创建）。工具审批由桥内白名单自动裁决：工作区内文件读写与内置小工具自动批准，命令执行一律拒绝。',
      model_provider_id: model?.provider_id,
      model_id: model?.model_id,
      tool_approval: 'destructive',
      enable_image_gen: 1,
      enable_deck: 0
    })
    created = true
  }
  const conn = store.ensurePrimaryConnection()
  store.updateConnectionFields(conn.id, { bot_id: bot.id })
  broadcastStatus()
  return { botId: bot.id, created }
}

export function setBridgeEnabled(enabled: boolean): void {
  const conn = store.ensurePrimaryConnection()
  store.updateConnectionFields(conn.id, { enabled: enabled ? 1 : 0 })
  if (enabled) {
    startClawbotBridge().catch((e) => console.error('[clawbot] enable start failed:', e))
  } else {
    stopClawbotBridge()
    broadcastStatus()
  }
}

export function resetPeerConversation(peerRowId: string): void {
  store.updatePeerConversation(peerRowId, '')
  broadcastStatus()
}

export function listPeerSummaries(): store.ClawbotPeerSummary[] {
  const conn = store.getPrimaryConnection()
  return conn ? store.listPeers(conn.id) : []
}

export function listBridgeLogs(beforeId?: string, limit?: number): store.ClawbotLog[] {
  return store.listLogs(beforeId, limit)
}

/** 启动/热切换后的僵尸状态清理 + 日志 pruning（main/index 与 account-context 双调用点） */
export function clawbotStartupMaintenance(): void {
  try {
    store.cleanupStaleClawbotState()
    store.pruneClawbotLogs(7)
  } catch (e) {
    console.error('[clawbot] startup maintenance failed:', e)
  }
}
