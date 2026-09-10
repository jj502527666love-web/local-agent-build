/**
 * 工具调用参数流的增量 JSON 解析器，O(n) 总成本。
 * 移植自 OrbitOS（cloudflare-os）packages/orbitos-backend/src/streaming-json-parser.ts（Apache-2.0）。
 *
 * 指定一个「流式字段」（如 file_ops.write 的 content）：其之前的字段在流式字段
 * 引号出现时一次性 JSON.parse 前缀；之后逐字符解码该字段的值，跨 chunk 的转义
 * 序列（\n、\uXXXX）留位待下次 append 重试。
 *
 * 用法：
 *   const parser = new StreamingToolInputParser('content')
 *   parser.append('{"path": "foo.ts", "content": "hel')
 *   parser.append('lo world"}')
 *   parser.prefixFields   // => { path: 'foo.ts' }
 *   parser.streamingValue // => 'hello world'
 *
 * 为什么不每次整体 JSON.parse 半截字符串：大文件写入场景每 delta 从头 parse 是 O(n²)。
 */

const JSON_SIMPLE_ESCAPES: Record<string, string | undefined> = {
  '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f',
  n: '\n', r: '\r', t: '\t'
}

function isJsonWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

type ParserPhase =
  | 'initial' // 开括号 { 之前
  | 'expectKey' // { 或 , 之后，等 key 字符串
  | 'inKey' // key 字符串内
  | 'expectColon' // key 之后等冒号
  | 'expectValue' // 冒号之后等值
  | 'inStringValue' // 非流式字符串值内（跳过）
  | 'inOtherValue' // 非字符串值内（带深度跟踪跳过）
  | 'afterValue' // 完整值之后，等 , 或 }
  | 'streaming' // 增量解码流式字段的字符串值
  | 'done' // 对象闭合或流式字段完成
  | 'error' // 解析错误

export class StreamingToolInputParser {
  #streamingFieldName: string
  #buffer = ''
  #pos = 0
  #phase: ParserPhase = 'initial'

  // inKey 阶段的 key 累积
  #currentKey = ''
  #keyStartPos = 0

  // inOtherValue 阶段的非字符串值深度跟踪
  #valueDepth = 0
  #valueInString = false

  // 前缀字段：流式字段的开引号找到后一次性解析
  #prefixFields: Record<string, unknown> | null = null

  // 流式字符串解码输出
  #decodedValue = ''
  #streamComplete = false

  constructor(streamingFieldName: string) {
    this.#streamingFieldName = streamingFieldName
  }

  /** 喂入工具调用参数流的一段新原文 */
  append(delta: string): void {
    this.#buffer += delta
    this.#scan()
  }

  /** 流式字段之前的字段（其开引号找到后非空，此时前缀字段必然完整） */
  get prefixFields(): Record<string, unknown> | null {
    return this.#prefixFields
  }

  /** 流式字段目前累积的解码值 */
  get streamingValue(): string {
    return this.#decodedValue
  }

  /** 流式字段的字符串值是否已完整接收 */
  get streamComplete(): boolean {
    return this.#streamComplete
  }

  /** 是否遇到 JSON 解析错误 */
  get hasError(): boolean {
    return this.#phase === 'error'
  }

  #scan(): void {
    while (this.#pos < this.#buffer.length) {
      const ch = this.#buffer[this.#pos]

      switch (this.#phase) {
        case 'initial':
          if (isJsonWhitespace(ch)) { this.#pos++; break }
          if (ch === '{') { this.#phase = 'expectKey'; this.#pos++; break }
          this.#phase = 'error'
          return

        case 'expectKey':
          if (isJsonWhitespace(ch)) { this.#pos++; break }
          if (ch === '}') { this.#phase = 'done'; this.#pos++; return }
          if (ch === '"') {
            this.#keyStartPos = this.#pos
            this.#currentKey = ''
            this.#phase = 'inKey'
            this.#pos++ // 跳过开引号
            break
          }
          this.#phase = 'error'
          return

        case 'inKey':
          if (ch === '\\') {
            // pos 留在 '\'：数据不足时等下次 append 重试
            if (this.#pos + 1 >= this.#buffer.length) return
            const esc = this.#buffer[this.#pos + 1]
            if (esc === 'u') {
              if (this.#pos + 6 > this.#buffer.length) return
              const hex = this.#buffer.slice(this.#pos + 2, this.#pos + 6)
              if (!/^[0-9a-fA-F]{4}$/.test(hex)) { this.#phase = 'error'; return }
              this.#currentKey += String.fromCharCode(parseInt(hex, 16))
              this.#pos += 6
            } else {
              const decoded = JSON_SIMPLE_ESCAPES[esc]
              if (decoded === undefined) { this.#phase = 'error'; return }
              this.#currentKey += decoded
              this.#pos += 2
            }
            break
          }
          if (ch === '"') {
            this.#phase = 'expectColon'
            this.#pos++
            break
          }
          this.#currentKey += ch
          this.#pos++
          break

        case 'expectColon':
          if (isJsonWhitespace(ch)) { this.#pos++; break }
          if (ch === ':') { this.#phase = 'expectValue'; this.#pos++; break }
          this.#phase = 'error'
          return

        case 'expectValue':
          if (isJsonWhitespace(ch)) { this.#pos++; break }
          if (this.#currentKey === this.#streamingFieldName) {
            if (ch !== '"') { this.#phase = 'error'; return }
            this.#pos++ // 跳过开引号
            this.#phase = 'streaming'
            this.#extractPrefix()
            break
          }
          if (ch === '"') {
            this.#phase = 'inStringValue'
            this.#pos++ // 跳过开引号
            break
          }
          this.#valueDepth = ch === '{' || ch === '[' ? 1 : 0
          this.#valueInString = false
          this.#phase = 'inOtherValue'
          this.#pos++
          break

        case 'inStringValue':
          if (ch === '\\') {
            if (this.#pos + 1 >= this.#buffer.length) return
            this.#pos += 2 // 跳过 \ 与被转义字符
            break
          }
          if (ch === '"') { this.#phase = 'afterValue'; this.#pos++; break }
          this.#pos++
          break

        case 'inOtherValue':
          if (this.#valueInString) {
            if (ch === '\\') {
              if (this.#pos + 1 >= this.#buffer.length) return
              this.#pos += 2
              break
            }
            if (ch === '"') { this.#valueInString = false; this.#pos++; break }
            this.#pos++
            break
          }
          if (ch === '"') { this.#valueInString = true; this.#pos++; break }
          if (ch === '{' || ch === '[') { this.#valueDepth++; this.#pos++; break }
          if (ch === '}' || ch === ']') {
            if (this.#valueDepth > 0) {
              this.#valueDepth--
              this.#pos++
              if (this.#valueDepth === 0) this.#phase = 'afterValue'
              break
            }
            // 深度 0 的标量——该字符属于外层结构
            this.#phase = 'afterValue'
            break
          }
          if (this.#valueDepth === 0 && (ch === ',' || isJsonWhitespace(ch))) {
            this.#phase = 'afterValue'
            break
          }
          this.#pos++
          break

        case 'afterValue':
          if (isJsonWhitespace(ch)) { this.#pos++; break }
          if (ch === ',') { this.#phase = 'expectKey'; this.#pos++; break }
          if (ch === '}') { this.#phase = 'done'; this.#pos++; return }
          this.#phase = 'error'
          return

        case 'streaming':
          this.#decodeStreaming()
          return

        case 'done':
        case 'error':
          return
      }
    }
  }

  // 把流式字段 key 之前的部分当 JSON 解析出前缀字段
  #extractPrefix(): void {
    let prefix = this.#buffer.slice(0, this.#keyStartPos).trimEnd()
    if (prefix.endsWith(',')) prefix = prefix.slice(0, -1)
    prefix += '}'
    try {
      this.#prefixFields = JSON.parse(prefix)
    } catch {
      this.#prefixFields = {}
    }
  }

  // 增量解码流式字段的字符串值。只处理 #pos 起的字符；跨 chunk 的转义序列
  // 把 #pos 留在 '\' 上等下次 append 重试。
  #decodeStreaming(): void {
    let start = this.#pos
    while (this.#pos < this.#buffer.length) {
      const ch = this.#buffer[this.#pos]
      if (ch === '"') {
        if (this.#pos > start) {
          this.#decodedValue += this.#buffer.slice(start, this.#pos)
        }
        this.#streamComplete = true
        this.#phase = 'done'
        this.#pos++
        return
      }
      if (ch === '\\') {
        // 先冲刷转义符之前累积的纯文本
        if (this.#pos > start) {
          this.#decodedValue += this.#buffer.slice(start, this.#pos)
        }
        if (this.#pos + 1 >= this.#buffer.length) return
        const esc = this.#buffer[this.#pos + 1]
        const decoded = JSON_SIMPLE_ESCAPES[esc]
        if (decoded !== undefined) {
          this.#decodedValue += decoded
          this.#pos += 2
        } else if (esc === 'u') {
          if (this.#pos + 6 > this.#buffer.length) return
          const hex = this.#buffer.slice(this.#pos + 2, this.#pos + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) { this.#phase = 'error'; return }
          this.#decodedValue += String.fromCharCode(parseInt(hex, 16))
          this.#pos += 6
        } else {
          this.#phase = 'error'
          return
        }
        start = this.#pos
        continue
      }
      this.#pos++
    }
    // 冲刷剩余纯文本
    if (this.#pos > start) {
      this.#decodedValue += this.#buffer.slice(start, this.#pos)
    }
  }
}
