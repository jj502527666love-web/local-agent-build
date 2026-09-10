/**
 * 不可信文本消毒（审批卡片等场景渲染模型/工具生成的文本前调用）。
 *
 * 风险形态（参考 OrbitOS mcp-shared/tools.ts 的 quoteUntrusted 思路）：
 *  - bidi 控制符（U+202A-202E、U+2066-2069）可视觉重排字符序，让危险命令看起来无害；
 *  - 零宽字符（U+200B-200D、U+FEFF）可藏不可见内容；
 *  - C0/C1 控制字符（除换行、制表符）无正当用途（ANSI 转义在 pre 里虽不执行，但 ESC 序列原文会干扰阅读）；
 *  - 超长参数撑爆渲染。
 *
 * 实现说明：刻意用码点数字比较而非控制字符正则字面量——源码文件不内嵌任何
 * 不可见字符，可审阅、不会因编码问题被误识别为二进制文件。
 * HTML 注入由 Vue 插值转义兜底，此处不重复。按行处理 diff 时逐行传入，换行符被保留不会吞行。
 */
export interface SanitizedText {
  text: string
  /** 是否发生了截断（调用方可据此追加「已截断」提示） */
  truncated: boolean
}

const TAB = 0x09
const LF = 0x0a

/** 判定码点是否属于需剥离的不可见/视觉伪造字符 */
function isBannedCodePoint(cp: number): boolean {
  // C0 控制字符（保留 TAB、LF）
  if (cp <= 0x1f && cp !== TAB && cp !== LF) return true
  // DEL 与 C1 控制字符
  if (cp >= 0x7f && cp <= 0x9f) return true
  // 零宽字符 U+200B-200D、BOM/零宽不换行 U+FEFF
  if (cp >= 0x200b && cp <= 0x200d) return true
  if (cp === 0xfeff) return true
  // bidi 嵌入/覆盖 U+202A-202E、bidi 隔离 U+2066-2069
  if (cp >= 0x202a && cp <= 0x202e) return true
  if (cp >= 0x2066 && cp <= 0x2069) return true
  return false
}

export function sanitizeUntrusted(input: unknown, maxLen = 4000): SanitizedText {
  const raw = typeof input === 'string' ? input : String(input ?? '')
  let out = ''
  // for...of 按码点迭代（正确处理代理对）
  for (const ch of raw) {
    const cp = ch.codePointAt(0)
    if (cp !== undefined && !isBannedCodePoint(cp)) out += ch
  }
  if (out.length > maxLen) {
    return { text: out.slice(0, maxLen), truncated: true }
  }
  return { text: out, truncated: false }
}

/** 便捷版：只要字符串（不关心截断标记） */
export function sanitizeText(input: unknown, maxLen = 4000): string {
  return sanitizeUntrusted(input, maxLen).text
}
