const ERROR_MAP: Record<string, string> = {
  'Insufficient token balance': 'Token \u4f59\u989d\u4e0d\u8db3\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u5145\u503c',
  'Insufficient credit balance': '\u79ef\u5206\u4f59\u989d\u4e0d\u8db3\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u5145\u503c',
  'Cloud login required': '\u8bf7\u5148\u767b\u5f55\u4e91\u7aef\u8d26\u53f7',
  'Custom provider is disabled by admin': '\u7ba1\u7406\u5458\u5df2\u7981\u7528\u81ea\u5b9a\u4e49\u670d\u52a1\u5546',
  'You do not have access to this model': '\u60a8\u6ca1\u6709\u8be5\u6a21\u578b\u7684\u4f7f\u7528\u6743\u9650',
  'Model not found': '\u6a21\u578b\u672a\u627e\u5230',
  'Provider disabled': '\u670d\u52a1\u5546\u5df2\u7981\u7528',
  'API error 524': '\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5',
  'API error 502': '\u670d\u52a1\u5668\u9519\u8bef\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5',
  'API error 503': '\u670d\u52a1\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5',
  'API error 504': '\u7f51\u5173\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5',
  'ETIMEDOUT': '\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5',
  'ECONNRESET': '\u8fde\u63a5\u88ab\u91cd\u7f6e\uff0c\u8bf7\u91cd\u8bd5',
  'ECONNREFUSED': '\u8fde\u63a5\u88ab\u62d2\u7edd\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u6216\u670d\u52a1\u5668\u72b6\u6001',
  'ENETUNREACH': '\u7f51\u7edc\u4e0d\u53ef\u8fbe\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5',
  'EAI_AGAIN': 'DNS \u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc',
  'UND_ERR_CONNECT_TIMEOUT': '\u8fde\u63a5\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5',
  'UND_ERR_HEADERS_TIMEOUT': '\u670d\u52a1\u5668\u54cd\u5e94\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5',
  'UND_ERR_BODY_TIMEOUT': '\u6570\u636e\u8bfb\u53d6\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5',
  'UND_ERR_SOCKET': '\u8fde\u63a5\u4e2d\u65ad\uff0c\u8bf7\u91cd\u8bd5',
  'socket hang up': '\u8fde\u63a5\u4e2d\u65ad\uff0c\u8bf7\u91cd\u8bd5',
  'fetch failed': '\u7f51\u7edc\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5',
  'Upstream request failed': '\u4e0a\u6e38\u6a21\u578b\u62d2\u7edd\u5f53\u524d\u8bf7\u6c42\uff0c\u5e38\u89c1\u539f\u56e0\uff1a\u5c3a\u5bf8\u6bd4\u4f8b\u8fc7\u4e8e\u6781\u7aef\u3001\u77ed\u8fb9\u592a\u5c0f\u6216\u6a21\u578b\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u6362\u7528\u9884\u8bbe\u6bd4\u4f8b\u6216\u7a0d\u540e\u91cd\u8bd5',
  'Upstream error': '\u4e0a\u6e38\u6a21\u578b\u8fd4\u56de\u9519\u8bef\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u66f4\u6362\u6a21\u578b',
  'invalid size': '\u5c3a\u5bf8\u4e0d\u53d7\u6a21\u578b\u652f\u6301\uff0c\u8bf7\u6539\u7528\u9884\u8bbe\u6bd4\u4f8b',
  'size is not supported': '\u5c3a\u5bf8\u4e0d\u53d7\u6a21\u578b\u652f\u6301\uff0c\u8bf7\u6539\u7528\u9884\u8bbe\u6bd4\u4f8b'
}

export function translateError(msg: string): string {
  if (!msg) return '\u64cd\u4f5c\u5931\u8d25'

  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return val
  }

  // Extract JSON error from "LLM API error 4xx: {...}"
  const jsonMatch = msg.match(/(?:LLM|Image) API error \d+: (.+)/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      const inner = parsed.error || parsed.message
      if (inner && typeof inner === 'string') {
        for (const [key, val] of Object.entries(ERROR_MAP)) {
          if (inner.includes(key)) return val
        }
        return inner
      }
    } catch {}
  }

  return msg
}

export function isBalanceError(msg: string): boolean {
  return msg.includes('Insufficient') && msg.includes('balance')
}
