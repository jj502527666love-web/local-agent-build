// 画布智能体 · 渲染层多轮工具循环
// -----------------------------------------------------------------------------
// 参照 chat-engine 的 Agent while-loop，但整个循环放在渲染层、贴着画布真源
// （canvasStore / useWorkflowEngine / node-schema），工具直连本地画布，无需主进程桥。
// 每轮：带 tools 调对话模型 → 有 tool_calls 则逐个执行画布工具、回填 tool 消息 → 无
// tool_calls 即为最终答复。模型统一走画布设置里的对话模型（project.text_provider_id/
// text_model_id），人设固化内置不可自定义。
//
// 安全层（Phase 2）：破坏性工具（删节点/断线/运行）执行前经 onApproval 确认卡；每次改动
// 记入跨轮持久的撤销事务，面板可一键撤销（undoLast）。
// 面板 UI / 流式增量在 Phase 3 落地。

import { ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkflowEngine } from './useWorkflowEngine'
import { createCanvasTools, DESTRUCTIVE_CANVAS_TOOLS } from './canvas-tools'
import { CANVAS_AGENT_PERSONA } from './canvas-agent-persona'
import { createUndoManager, type UndoManager, type UndoTransaction } from './canvas-undo'

const api = () => (window as any).api

/** 对话消息（OpenAI 兼容） */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: any[]
  tool_call_id?: string
}

/** 破坏性动作审批请求（面板据此弹确认卡） */
export interface ApprovalRequest {
  tool: string
  args: Record<string, any>
  /** 人类可读的变更预览 */
  preview: string
}

/** 循环过程事件（供面板可视化） */
export interface CanvasAgentEvents {
  onToken?: (text: string) => void
  onToolStart?: (name: string, args: Record<string, any>) => void
  onToolResult?: (name: string, result: Record<string, any>) => void
  onRound?: (round: number) => void
  onError?: (message: string) => void
}

export interface SendParams {
  /** 用户本轮输入 */
  input: string
  /** 目标画布 id */
  projectId: string
  /** 历史消息（不含本轮 input，不含 system；跨轮对话由调用方维护） */
  history?: AgentMessage[]
  /** 当前选中的节点 id */
  getSelection?: () => string[]
  /** 触发画布自动整理布局（画布视图注入，供 canvas_layout 工具） */
  layout?: () => Promise<void>
  /** 本地知识库检索（面板选了知识库才传；决定是否提供 canvas_kb_search 工具） */
  kbSearch?: (query: string, topK?: number) => Promise<{ results: { score: number; source: string; content: string }[]; error?: string }>
  /** 本轮附带图片（决定是否提供 canvas_add_reference_image 工具） */
  imageAttachments?: () => { name: string; dataUri: string }[]
  /** 把 dataUri 落盘为节点图片（走 canvas:saveNodeImage） */
  saveNodeImage?: (nodeId: string, dataUri: string) => Promise<{ image_path: string }>
  /** 破坏性动作确认门：返回 true 才执行，false 则取消并回报模型。缺省 fail-closed（无确认通道则拒绝执行破坏性动作） */
  onApproval?: (req: ApprovalRequest) => Promise<boolean>
  events?: CanvasAgentEvents
}

export interface SendResult {
  ok: boolean
  /** 最终助手文本 */
  text: string
  /** 完整消息序列（含本轮 user、assistant、tool），供调用方续接下一轮 */
  messages: AgentMessage[]
  error?: string
}

/** 单次 send 内的最大工具轮次（防死循环） */
const MAX_TOOL_ROUNDS = 25
/** 单次模型调用硬超时 */
const LLM_TIMEOUT_MS = 120000

let reqSeq = 0

export function useCanvasAgent() {
  const store = useCanvasStore()
  const engine = useWorkflowEngine()

  const running = ref(false)
  // 撤销栈跨 send 持久（面板「撤销上次 AI 变更」按钮据此工作）
  let undoMgr: UndoManager | null = null
  const currentProjectId = ref('')
  /** 可撤销的事务数（响应式，供面板启用/禁用撤销按钮） */
  const undoCount = ref(0)

  let currentReqId = ''
  let canceled = false

  function ensureUndo(): UndoManager {
    if (!undoMgr) undoMgr = createUndoManager(store, () => currentProjectId.value)
    return undoMgr
  }

  function cancel(): void {
    canceled = true
    if (currentReqId) {
      try { api().llm.invoke('cancel', currentReqId) } catch {}
    }
  }

  /** 撤销最近一次画布变更；返回被撤销的事务（无则 null） */
  async function undoLast(): Promise<UndoTransaction | null> {
    const mgr = ensureUndo()
    const tx = await mgr.undoLast()
    undoCount.value = mgr.size()
    return tx
  }

  const lastUndoLabel = (): string | null => (undoMgr ? undoMgr.lastLabel() : null)

  async function send(params: SendParams): Promise<SendResult> {
    const { input, projectId, history = [], getSelection, layout, kbSearch, imageAttachments, saveNodeImage, events } = params

    const project = store.currentProject
    if (!project || project.id !== projectId) {
      const msg = '画布未就绪'
      events?.onError?.(msg)
      return { ok: false, text: '', messages: [], error: msg }
    }
    if (!project.text_provider_id || !project.text_model_id) {
      const msg = '尚未配置对话模型，请到画布设置里选择「文本处理服务商 / 文本模型」。'
      events?.onError?.(msg)
      return { ok: false, text: '', messages: [], error: msg }
    }

    currentProjectId.value = projectId
    const undo = ensureUndo()
    const tools = createCanvasTools({
      store,
      engine: {
        runWorkflow: engine.runWorkflow,
        executeSingleNode: engine.executeSingleNode,
        validateConnectivity: engine.validateConnectivity,
        isProjectRunning: engine.isProjectRunning
      },
      undo,
      projectId: () => projectId,
      getSelection,
      layout,
      kbSearch,
      imageAttachments,
      saveNodeImage
    })

    // 组装消息：system(固化人设) + 历史 + 本轮 user。
    // history 来自面板的响应式 conversation ref，其元素是 Vue reactive Proxy，
    // 直接经 IPC(llm:call) 结构化克隆会抛「An object could not be cloned」——先深拷贝剥离响应式。
    const plainHistory: AgentMessage[] = history.length ? JSON.parse(JSON.stringify(history)) : []
    const messages: AgentMessage[] = [
      { role: 'system', content: CANVAS_AGENT_PERSONA },
      ...plainHistory,
      { role: 'user', content: input }
    ]

    running.value = true
    canceled = false
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (canceled) return { ok: false, text: '', messages, error: '已中止' }
        events?.onRound?.(round + 1)

        currentReqId = `canvas-agent-${Date.now()}-${++reqSeq}`
        let resp: any
        try {
          resp = await api().llm.invoke('call', project.text_provider_id, project.text_model_id, messages, {
            tools: tools.defs,
            returnToolCalls: true,
            stream: true,
            notifyStream: false,
            requestId: currentReqId,
            timeoutMs: LLM_TIMEOUT_MS
          })
        } catch (err: any) {
          if (canceled) return { ok: false, text: '', messages, error: '已中止' }
          const msg = err?.message || '模型调用失败'
          events?.onError?.(msg)
          return { ok: false, text: '', messages, error: msg }
        }

        // 兼容返回形状：{content,tool_calls} | 纯字符串
        const content: string = typeof resp === 'string' ? resp : (resp?.content || '')
        const toolCalls: any[] | undefined = typeof resp === 'object' ? resp?.tool_calls : undefined

        messages.push({ role: 'assistant', content, tool_calls: toolCalls && toolCalls.length ? toolCalls : undefined })
        if (content) events?.onToken?.(content)

        if (!toolCalls || toolCalls.length === 0) {
          return { ok: true, text: content, messages }
        }

        // 关键：无论中途取消/出错，都必须给每个 tool_call 回填一条 role:'tool' 消息，
        // 否则末尾 assistant.tool_calls 悬空、下一轮会被 provider 400 拒并污染历史。
        let aborted = false
        for (const tc of toolCalls) {
          const tcId = tc?.id
          if (canceled) aborted = true
          if (aborted) {
            // 已中止：仍回填占位结果以保证 tool_calls 与 tool 消息严格配对
            messages.push({ role: 'tool', tool_call_id: tcId, content: JSON.stringify({ ok: false, canceled: true }) })
            continue
          }
          const fname: string = tc?.function?.name || ''
          let fargs: Record<string, any> = {}
          try {
            const raw = tc?.function?.arguments
            fargs = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}
          } catch {
            fargs = {}
          }
          events?.onToolStart?.(fname, fargs)

          let result: Record<string, any>
          if (!tools.names.has(fname)) {
            result = { ok: false, error: `未知工具：${fname}` }
          } else if (tools.destructive.has(fname)) {
            // 破坏性动作：先弹确认卡；无确认通道（onApproval）则 fail-closed 拒绝执行
            let previewText = ''
            try { previewText = tools.preview(fname, fargs) } catch { previewText = `将执行：${fname}` }
            const approved = params.onApproval ? await params.onApproval({ tool: fname, args: fargs, preview: previewText }) : false
            if (canceled) {
              aborted = true
              result = { ok: false, canceled: true }
            } else if (!approved) {
              result = { ok: false, canceled: true, error: params.onApproval ? '用户取消了此操作' : '该动作需要用户确认，但当前环境无确认通道' }
            } else {
              try {
                result = await tools.execute(fname, fargs)
              } catch (err: any) {
                result = { ok: false, error: err?.message || '工具执行异常' }
              }
            }
          } else {
            try {
              result = await tools.execute(fname, fargs)
            } catch (err: any) {
              result = { ok: false, error: err?.message || '工具执行异常' }
            }
          }
          events?.onToolResult?.(fname, result)
          messages.push({ role: 'tool', tool_call_id: tcId, content: JSON.stringify(result) })
        }
        if (aborted) return { ok: false, text: '', messages, error: '已中止' }
      }

      // 达到最大轮次：再做一次不带 tools 的收尾总结
      currentReqId = `canvas-agent-${Date.now()}-${++reqSeq}`
      let finalText = ''
      try {
        const resp = await api().llm.invoke('call', project.text_provider_id, project.text_model_id, [
          ...messages,
          { role: 'user', content: '（已达到本轮操作上限，请用一段话总结你已完成的动作，以及还需要用户做什么。）' }
        ], { stream: true, notifyStream: false, requestId: currentReqId, timeoutMs: LLM_TIMEOUT_MS })
        finalText = typeof resp === 'string' ? resp : (resp?.content || '')
      } catch { /* 收尾失败忽略 */ }
      const wrap = finalText || '本轮操作较多已达上限，已尽力完成，请检查画布或继续下一步指令。'
      messages.push({ role: 'assistant', content: wrap })
      return { ok: true, text: wrap, messages }
    } finally {
      running.value = false
      currentReqId = ''
      undoCount.value = undo.size()
    }
  }

  return { running, send, cancel, undoLast, undoCount, lastUndoLabel, DESTRUCTIVE_CANVAS_TOOLS }
}
