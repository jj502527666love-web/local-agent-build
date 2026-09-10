import type { BrowserWindow } from 'electron'
import { callLLM } from '../llm'
import type { DeckLlm } from './deck-generator'
import type { CritiqueLlm } from './critique'

// 把 llm.ts 的 callLLM 包成 deck-generator 需要的 DeckLlm(结构化 JSON 产出)。
// 这是 deck-generator 与真实 LLM 之间唯一接线点(deck-generator 本身 LLM 无关、可 fake 单测)。

/** 宽松解析 LLM 返回 JSON: 剥 markdown 代码围栏 / 取首个平衡 {…}, 失败回退空对象 */
export function parseJsonLoose(text: string): unknown {
  if (!text) return {}
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1]) t = fence[1].trim()
  try {
    return JSON.parse(t)
  } catch {
    /* 继续尝试截取 */
  }
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1))
    } catch {
      /* 放弃 */
    }
  }
  return {}
}

/**
 * 从半截 JSON 文本里提取「已完整闭合的 key:string 字段对」（流式预览用）。
 * 只认完整闭合的 `"key": "value"`（转义安全）；数组/嵌套对象等复杂字段提取不到——
 * 它们等最终完整 JSON 再生效（流式预览只显示先完成的字符串字段，属预期降级）。
 */
export function extractCompleteStringFields(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!text) return out
  const re = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    try {
      const k = JSON.parse(`"${m[1]}"`)
      const v = JSON.parse(`"${m[2]}"`)
      if (typeof k === 'string' && typeof v === 'string') out[k] = v
    } catch {
      /* 坏转义字段跳过 */
    }
  }
  return out
}

export function toDeckLlm(
  providerId: string,
  modelId: string,
  window?: BrowserWindow | null
): DeckLlm {
  return {
    async generateJson({ system, user, schema, signal }) {
      const res = await callLLM(
        providerId,
        {
          modelId,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content:
                user +
                '\n\n只输出一个 JSON 对象, 严格符合下列 JSON Schema, 不要任何额外说明或代码围栏:\n' +
                JSON.stringify(schema)
            }
          ],
          response_format: { type: 'json_object' },
          // 流式: 首字节秒级到达避开网关 524(JSON 模式同样能流式, 累积全文再解析)。
          // 后台调用 notifyStream:false 不串扰对话流。
          stream: true,
          notifyStream: false,
          signal
        },
        window ?? null
      )
      return parseJsonLoose(res.content)
    },
    // 流式纯文本: stream:true 让首字节秒级到达, 避开云端网关 524。res.content 是累积全文。
    async generateText({ system, user, signal, onContent }) {
      const res = await callLLM(
        providerId,
        {
          modelId,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          stream: true,
          notifyStream: false, // 不串扰对话流; 增量经 streamContext.onContent 回调
          streamContext: onContent ? { onContent } : undefined,
          signal
        },
        window ?? null
      )
      return res.content
    },
    // 流式 JSON: 边收边提取已闭合的字符串字段回调 onPartial（预览用）, 最终仍以全文宽松解析为准。
    // onPartial 节流（100ms）：避免每 token 触发一次下游渲染管线。
    async generateJsonStream({ system, user, schema, signal, onPartial }) {
      let accumulated = ''
      let lastEmitAt = 0
      let lastEmittedKeys = 0
      const res = await callLLM(
        providerId,
        {
          modelId,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content:
                user +
                '\n\n只输出一个 JSON 对象, 严格符合下列 JSON Schema, 不要任何额外说明或代码围栏:\n' +
                JSON.stringify(schema)
            }
          ],
          response_format: { type: 'json_object' },
          stream: true,
          notifyStream: false,
          streamContext: {
            onContent: (piece) => {
              accumulated += piece
              const now = Date.now()
              if (now - lastEmitAt < 100) return
              const partial = extractCompleteStringFields(accumulated)
              const keyCount = Object.keys(partial).length
              if (keyCount === 0 || keyCount === lastEmittedKeys) return
              lastEmitAt = now
              lastEmittedKeys = keyCount
              onPartial(partial)
            }
          },
          signal
        },
        window ?? null
      )
      // 流末兜底补发：节流窗口内未发的尾部字段（快速模型最后 100ms 内闭合的字段）补一次预览
      const finalPartial = extractCompleteStringFields(accumulated)
      if (Object.keys(finalPartial).length > lastEmittedKeys) {
        try { onPartial(finalPartial) } catch { /* 预览失败不影响权威结果 */ }
      }
      return parseJsonLoose(res.content)
    }
  }
}

/**
 * 把 llm.ts 的 callLLM 包成 critique.ts 需要的 CritiqueLlm(多模态图像评审)。
 * 用 OpenAI 兼容多模态 content 数组([text, image_url]); 截图 dataURL 由 llm.ts 的
 * materializeMessageImages 自动转云端临时 URL(避免 base64 污染上游日志)。
 */
export function toCritiqueLlm(
  providerId: string,
  modelId: string,
  window?: BrowserWindow | null
): CritiqueLlm {
  return {
    async reviewImage({ system, user, imageDataUrl, schema, signal }) {
      const res = await callLLM(
        providerId,
        {
          modelId,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    user +
                    '\n\n只输出一个 JSON 对象, 严格符合下列 JSON Schema, 不要任何额外说明或代码围栏:\n' +
                    JSON.stringify(schema)
                },
                { type: 'image_url', image_url: { url: imageDataUrl } }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          // 流式同 generateJson: 避开网关 524(多模态评审输出也走流式)
          stream: true,
          notifyStream: false,
          signal
        },
        window ?? null
      )
      return parseJsonLoose(res.content)
    }
  }
}
