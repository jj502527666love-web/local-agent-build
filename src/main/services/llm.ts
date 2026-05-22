import { getModelProvider } from './model-provider'
import { BrowserWindow } from 'electron'
import { recordUsage } from './usage-stats'
import {
  getCloudToken,
  getCloudGatewayUrl,
  getAllowCustomProvider,
  resolveCloudModelId,
  refreshCloudToken,
  notifyCloudAuthExpired,
  wasLastCloudTokenRefreshAuthFailure,
} from './cloud-token'
import { normalizeApiBase } from './api-base-normalize'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | any[]
  tool_call_id?: string
  tool_calls?: any[]
}

export interface LLMRequestOptions {
  providerIdOrBase?: string
  modelId: string
  messages: ChatMessage[]
  tools?: any[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  signal?: AbortSignal
  /** OpenAI-compatible response_format, e.g. { type: 'json_object' } */
  response_format?: { type: string; [k: string]: any }
  /** When true (default), streaming chunks are forwarded via chat:stream.
   *  Set to false for background / non-chat LLM calls to avoid cross-talk. */
  notifyStream?: boolean
  streamContext?: {
    conversationId?: string
    requestId?: string
  }
}

export class AbortedError extends Error {
  constructor() {
    super('Aborted')
    this.name = 'AbortedError'
  }
}

class LLMHttpError extends Error {
  status: number

  constructor(status: number, body: string) {
    super(`LLM API error ${status}: ${body}`)
    this.status = status
  }
}

export function isAbortedError(err: any): boolean {
  if (!err) return false
  if (err instanceof AbortedError) return true
  if (err.name === 'AbortError') return true
  if (err.cause?.name === 'AbortError') return true
  const code = err.cause?.code || err.code
  return code === 'ABORT_ERR'
}

export interface LLMResponse {
  content: string
  tool_calls?: any[]
  finish_reason: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

function getProviderConfig(providerId: string) {
  const provider = getModelProvider(providerId)
  if (!provider) throw new Error(`Model provider not found: ${providerId}`)
  return { apiBase: provider.api_base, apiKey: provider.api_key }
}

const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'EPIPE'
])

function isTransientFetchError(err: any): boolean {
  if (!err) return false
  const cause = err.cause
  if (cause?.code && RETRYABLE_CODES.has(cause.code)) return true
  const msg = String(err.message || err).toLowerCase()
  return msg.includes('fetch failed') || msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('socket hang up')
}

// undici 在 SSE 流读取过程中被对端关闭时抛 `TypeError: terminated`，
// cause 一般是 SocketError(UND_ERR_SOCKET) 或 message 含 'other side closed'。
// 这类错误说明响应阶段被中断，可在尚未产生任何输出时安全重试整条请求。
function isStreamTerminatedError(err: any): boolean {
  if (!err) return false
  const cause = err.cause
  const code = cause?.code || err.code
  if (code === 'UND_ERR_SOCKET' || code === 'UND_ERR_BODY_TIMEOUT' || code === 'ECONNRESET' || code === 'EPIPE') return true
  const name = String(err.name || '').toLowerCase()
  const msg = String(err.message || '').toLowerCase()
  if (name === 'typeerror' && msg === 'terminated') return true
  if (msg.includes('other side closed')) return true
  return false
}

function describeFetchError(err: any): string {
  if (!err) return 'unknown fetch error'
  const cause = err.cause
  const head = err.message || String(err)
  const code = cause?.code || cause?.errno
  const causeMsg = cause?.message && cause.message !== head ? cause.message : ''
  if (code && causeMsg) return `${head} [${code}]: ${causeMsg}`
  if (code) return `${head} [${code}]`
  if (causeMsg) return `${head}: ${causeMsg}`
  return head
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let lastErr: any
  const signal = init.signal as AbortSignal | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, init)
      if ((resp.status === 502 || resp.status === 503 || resp.status === 504 || resp.status === 524) && attempt < retries) {
        const delay = 500 * Math.pow(2, attempt)
        console.log(`[llm] fetch ${resp.status} attempt ${attempt + 1}/${retries + 1}, retry in ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
        if (signal?.aborted) throw new AbortedError()
        continue
      }
      return resp
    } catch (err: any) {
      lastErr = err
      if (signal?.aborted) throw new AbortedError()
      // Never retry user-initiated abort
      if (isAbortedError(err)) throw new AbortedError()
      if (attempt < retries && isTransientFetchError(err)) {
        const delay = 500 * Math.pow(2, attempt)
        console.log(`[llm] fetch attempt ${attempt + 1}/${retries + 1} failed (${describeFetchError(err)}), retry in ${delay}ms`)
        await new Promise(r => setTimeout(r, delay))
        if (signal?.aborted) throw new AbortedError()
        continue
      }
      break
    }
  }
  const enriched = new Error(describeFetchError(lastErr))
  ;(enriched as any).cause = lastErr
  throw enriched
}

export async function callLLM(
  providerId: string,
  options: LLMRequestOptions,
  window?: BrowserWindow | null
): Promise<LLMResponse> {
  let url: string
  let apiKey: string

  // 渲染层传进来的 modelId 在云端 provider 下可能是复合 key `{model_id}#@{provider_name}`，
  // 用于标识用户实际选择的服务商；上游 OpenAI 协议只认纯 model_id，路由用 cloud_model_id 透传。
  const isCloud = providerId.startsWith('cloud:')
  let bodyModelId = options.modelId
  let cloudModelId: number | null = null
  if (isCloud) {
    const resolved = resolveCloudModelId(options.modelId, 'chat')
    bodyModelId = resolved.pureModelId
    cloudModelId = resolved.cloudModelId
  }

  if (isCloud) {
    // Cloud model: route through cloud gateway
    const token = getCloudToken()
    if (!token) throw new Error('Cloud login required')
    url = `${getCloudGatewayUrl()}/chat/completions`
    apiKey = token
  } else {
    if (!getCloudToken()) {
      throw new Error('Cloud login required')
    }
    if (!getAllowCustomProvider()) {
      throw new Error('Custom provider is disabled by admin')
    }
    const config = getProviderConfig(providerId)
    url = `${normalizeApiBase(config.apiBase)}/chat/completions`
    apiKey = config.apiKey
  }

  const body: any = {
    model: bodyModelId,
    messages: options.messages,
    stream: options.stream ?? false
  }
  // 云端网关按 cloud_model_id 主键精确路由到具体服务商，避免同 model_id 多家时 first() 错位
  if (isCloud && cloudModelId !== null) {
    body.cloud_model_id = cloudModelId
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools
  }
  if (options.temperature !== undefined) {
    body.temperature = options.temperature
  }
  if (options.max_tokens !== undefined) {
    body.max_tokens = options.max_tokens
  }
  if (options.response_format) {
    body.response_format = options.response_format
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const refreshCloudHeaders = async (reason: string): Promise<boolean> => {
    if (!isCloud) return false
    const token = await refreshCloudToken()
    if (!token) {
      if (wasLastCloudTokenRefreshAuthFailure()) notifyCloudAuthExpired(reason)
      return false
    }
    headers['Authorization'] = `Bearer ${token}`
    return true
  }

  if (options.stream) {
    const notify = options.notifyStream !== false
    try {
      return await streamLLM(url, headers, body, window ?? null, providerId, options.modelId, options.signal, notify, options.streamContext)
    } catch (e: any) {
      if (e instanceof LLMHttpError && e.status === 401 && await refreshCloudHeaders(e.message)) {
        return streamLLM(url, headers, body, window ?? null, providerId, options.modelId, options.signal, notify, options.streamContext)
      }
      throw e
    }
  }

  let response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal
  })

  if (response.status === 401 && await refreshCloudHeaders('LLM API error 401')) {
    response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal
    })
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new LLMHttpError(response.status, errorText)
  }

  const data = await response.json()
  const choice = data.choices?.[0]

  if (data.usage) {
    try {
      recordUsage(
        providerId,
        options.modelId,
        data.usage.prompt_tokens || 0,
        data.usage.completion_tokens || 0,
        data.usage.total_tokens || 0
      )
    } catch {}
  }

  return {
    content: choice?.message?.content || '',
    tool_calls: choice?.message?.tool_calls,
    finish_reason: choice?.finish_reason || 'stop',
    usage: data.usage
  }
}

// 流式请求最多重试次数（仅在尚未产生任何输出且错误属于连接中断类时生效）。
const MAX_STREAM_RETRIES = 2

// LLM 流式静默超时：连续 60 秒未收到任何 chunk 就认为连接已悄悄断开。
// 用 reader.cancel() 主动断流 → 抛错；外层若尚未推送过 token 会自动重试整条请求，
// 已推送过则降级为友好错误（连接被中断）。
const STREAM_IDLE_TIMEOUT_MS = 60_000

async function streamLLM(
  url: string,
  headers: Record<string, string>,
  body: any,
  window: BrowserWindow | null,
  providerId: string,
  modelId: string,
  signal?: AbortSignal,
  notifyStream = true,
  streamContext?: LLMRequestOptions['streamContext']
): Promise<LLMResponse> {
  body.stream_options = { include_usage: true }

  let attempt = 0
  let lastErr: any
  while (attempt <= MAX_STREAM_RETRIES) {
    if (signal?.aborted) throw new AbortedError()
    try {
      return await streamLLMOnce(url, headers, body, window, providerId, modelId, signal, notifyStream, streamContext)
    } catch (err: any) {
      if (isAbortedError(err)) throw err
      lastErr = err
      // 已经向 renderer 推送过 content/tool_call 时，重发整条请求会让 UI 出现重复内容，
      // 此时只能降级为友好错误，由用户手动重试。
      const hadOutput = (err as any).__streamHadOutput === true
      const idleTimeout = (err as any).__streamIdleTimeout === true
      const retryable =
        !hadOutput &&
        (idleTimeout || isStreamTerminatedError(err) || isTransientFetchError(err))
      if (!retryable || attempt >= MAX_STREAM_RETRIES) break
      const delay = 500 * Math.pow(2, attempt)
      console.log(`[llm] stream attempt ${attempt + 1}/${MAX_STREAM_RETRIES + 1} terminated (${describeFetchError(err)}), retry in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
      attempt++
    }
  }

  // 重试耗尽或本身就不可重试。对连接中断类错误抠成中文友好提示，
  // 避免上层把裸 `terminated` 写进 DB 让用户摸不着头脑。
  if (isStreamTerminatedError(lastErr) || isTransientFetchError(lastErr)) {
    const friendly = new Error('与模型服务的连接被中断，请稍后重试（terminated）')
    ;(friendly as any).cause = lastErr
    throw friendly
  }
  throw lastErr
}

async function streamLLMOnce(
  url: string,
  headers: Record<string, string>,
  body: any,
  window: BrowserWindow | null,
  providerId: string,
  modelId: string,
  signal?: AbortSignal,
  notifyStream = true,
  streamContext?: LLMRequestOptions['streamContext']
): Promise<LLMResponse> {
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM API error ${response.status}: ${errorText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  // If user aborts mid-stream, cancel the reader to release the network socket.
  const onAbort = () => {
    try { reader.cancel() } catch {}
  }
  if (signal) {
    if (signal.aborted) {
      try { reader.cancel() } catch {}
      throw new AbortedError()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let toolCalls: any[] = []
  let finishReason = 'stop'
  let buffer = ''
  let usage: any = null

  // Stream idle watchdog：60s 没收到 chunk 就 reader.cancel() 主动断开，
  // 让下面的 reader.read() 抛错；catch 里识别 idleTimedOut 并贴标签由外层决定重试 / 报错。
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let idleTimedOut = false
  const armIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimedOut = true
      try { reader.cancel(new Error('LLM stream idle timeout')) } catch {}
    }, STREAM_IDLE_TIMEOUT_MS)
  }
  const disarmIdle = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }
  armIdle()

  try {
  while (true) {
    if (signal?.aborted) throw new AbortedError()
    const { done, value } = await reader.read()
    armIdle()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        const reason = parsed.choices?.[0]?.finish_reason

        if (reason) finishReason = reason

        if (parsed.usage) {
          usage = parsed.usage
        }

        if (delta?.content) {
          fullContent += delta.content
          if (window && notifyStream) {
            window.webContents.send('chat:stream', {
              type: 'content',
              content: delta.content,
              conversationId: streamContext?.conversationId,
              requestId: streamContext?.requestId
            })
          }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } }
            }
            if (tc.id) toolCalls[idx].id = tc.id
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments
          }
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
  } catch (err: any) {
    disarmIdle()
    if (idleTimedOut) {
      const idleErr: any = new Error('与模型服务连接静默超过 60 秒，已断开')
      idleErr.cause = err
      idleErr.__streamIdleTimeout = true
      if (fullContent.length > 0 || toolCalls.length > 0) {
        idleErr.__streamHadOutput = true
      }
      throw idleErr
    }
    if (signal?.aborted || isAbortedError(err)) throw new AbortedError()
    // 给外层重试判定打标记：已经推送过任何 content/tool_call 就不能再重发整条请求，
    // 否则 renderer 会拼出重复内容。
    if (fullContent.length > 0 || toolCalls.length > 0) {
      ;(err as any).__streamHadOutput = true
    }
    throw err
  } finally {
    disarmIdle()
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  if (window && notifyStream) {
    window.webContents.send('chat:stream', { type: 'done', conversationId: streamContext?.conversationId, requestId: streamContext?.requestId })
  }

  if (usage) {
    try {
      recordUsage(
        providerId,
        modelId,
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        usage.total_tokens || 0
      )
    } catch {}
  }

  return {
    content: fullContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    finish_reason: finishReason,
    usage
  }
}
