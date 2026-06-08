/**
 * 对话内交互卡片（ask_user 通用询问 / 生图参数确认卡）的「人在回路」回环。
 *
 * 与「工具调用确认（chat-engine 的 pendingApprovals）」同构：把工具执行挂起为一个
 * Promise，通过 IPC 把卡片推给渲染端，等用户在对话里选择后 resolve，工具再继续。
 *
 * 独立成模块（而非放进 chat-engine）是为了避免 core-tools ↔ chat-engine 循环依赖：
 * core-tools 的 executeAskUser 需要 requestUserChoice；chat-engine 只需 cancel helpers；
 * ipc 需要 respondUserChoice。三者都只依赖本模块。
 */

/** 用户对一张卡片的应答。回环返回 null 表示超时 / abort / 取消（未作出选择）。 */
export interface ChoiceResponse {
  /** ask_user 多题答案，按 question id 索引（分步向导回传） */
  answers?: Record<string, { selected: string[]; free_text?: string }>
  /** 结构化结果（image_params 卡回传生图参数：size / tierId / quality / batchCount 等） */
  result?: Record<string, any>
}

interface PendingChoice {
  conversationId: string
  resolve: (selection: ChoiceResponse | null) => void
  cleanup: () => void
}

const pendingChoices = new Map<string, PendingChoice>()

// 与工具确认弹窗一致的 30 分钟超时：用户离开一会儿不会被强制取消；
// 真要取消用对话面板「中止」按钮（abort signal 会立即 resolve(null)）。
const CHOICE_TIMEOUT_MS = 30 * 60_000

/**
 * 挂起当前工具执行，等待用户对卡片作出选择。
 * @returns 用户选择；超时 / abort / 显式取消时返回 null。
 */
export function requestUserChoice(
  conversationId: string,
  requestId: string,
  signal?: AbortSignal
): Promise<ChoiceResponse | null> {
  return new Promise<ChoiceResponse | null>((resolve) => {
    const cleanup = (): void => {
      pendingChoices.delete(requestId)
      signal?.removeEventListener('abort', onAbort)
      clearTimeout(timer)
    }
    const onAbort = (): void => {
      const ctx = pendingChoices.get(requestId)
      if (ctx) {
        cleanup()
        ctx.resolve(null)
      }
    }
    const timer = setTimeout(() => {
      const ctx = pendingChoices.get(requestId)
      if (ctx) {
        cleanup()
        ctx.resolve(null)
      }
    }, CHOICE_TIMEOUT_MS)
    pendingChoices.set(requestId, { conversationId, resolve, cleanup })
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 渲染端用户作出选择后回传。返回 false 表示该 requestId 已不在等待（超时 / 已响应）。
 */
export function respondUserChoice(requestId: string, selection: ChoiceResponse | null): boolean {
  const ctx = pendingChoices.get(requestId)
  if (!ctx) return false
  ctx.cleanup()
  ctx.resolve(selection)
  return true
}

/** 取消某会话所有挂起的卡片选择（会话被中止 / 删除时）。 */
export function cancelPendingChoices(conversationId: string): void {
  for (const [, ctx] of pendingChoices) {
    if (ctx.conversationId === conversationId) {
      ctx.cleanup()
      ctx.resolve(null)
    }
  }
}

/** 取消全部挂起的卡片选择（账号热切换 / 全局清场）。 */
export function cancelAllPendingChoices(): void {
  for (const [, ctx] of pendingChoices) {
    try {
      ctx.cleanup()
      ctx.resolve(null)
    } catch {
      // ignore
    }
  }
}
