import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import DOMPurify from 'dompurify'

// 按需注册常用语言，避免全量 hljs（~900KB gz）进入 ChatView bundle。
// xml 语言在 hljs 里同时覆盖 html，shell 同时覆盖 console/sh。
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('php', php)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)
// 常见别名
hljs.registerAliases(['js', 'mjs', 'cjs'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['sh', 'zsh', 'console'], { languageName: 'bash' })
hljs.registerAliases(['ps', 'ps1', 'pwsh'], { languageName: 'powershell' })
hljs.registerAliases(['html', 'xhtml', 'svg', 'vue'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['rs'], { languageName: 'rust' })
hljs.registerAliases(['rb'], { languageName: 'ruby' })
hljs.registerAliases(['cs'], { languageName: 'csharp' })
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' })
hljs.registerAliases(['c++', 'cc', 'hpp', 'h'], { languageName: 'cpp' })
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' })

marked.setOptions({
  breaks: true,
  gfm: true
})

const renderer = new marked.Renderer()

renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${language}</span><button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('code').textContent)">复制</button></div><pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`
}

marked.use({ renderer })

const LOCAL_PATH_RE = /[A-Z]:\\[^\s<"']+/g
const URL_RE = /https?:\/\/[^\s<"')\]]+/g
const JUMP_ICON = '<svg class="link-jump-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-4.5-6H21m0 0v7.5m0-7.5-9 9" /></svg>'

function insertLinkButtons(html: string): string {
  const codeBlockPlaceholders: string[] = []
  let processed = html.replace(/<pre[\s>][\s\S]*?<\/pre>/gi, (match) => {
    codeBlockPlaceholders.push(match)
    return `__CODE_BLOCK_${codeBlockPlaceholders.length - 1}__`
  })

  processed = processed.replace(/<code>([^<]*)<\/code>/gi, (match, inner: string) => {
    const localMatch = inner.match(/[A-Z]:\\[^\s<"']+/)
    if (localMatch) {
      const escaped = localMatch[0].replace(/"/g, '&quot;')
      return `${match}<button class="link-jump-btn" data-link="${escaped}" data-link-type="local" title="打开所在目录">${JUMP_ICON}</button>`
    }
    const urlMatch = inner.match(/https?:\/\/[^\s<"')\]]+/)
    if (urlMatch) {
      const escaped = urlMatch[0].replace(/"/g, '&quot;')
      return `${match}<button class="link-jump-btn" data-link="${escaped}" data-link-type="external" title="在浏览器中打开">${JUMP_ICON}</button>`
    }
    return match
  })

  const inlineCodePlaceholders: string[] = []
  processed = processed.replace(/<code>[^<]*<\/code>(?:<button class="link-jump-btn"[^>]*>.*?<\/button>)?/gi, (match) => {
    inlineCodePlaceholders.push(match)
    return `__INLINE_CODE_${inlineCodePlaceholders.length - 1}__`
  })

  processed = processed.replace(LOCAL_PATH_RE, (match) => {
    const escaped = match.replace(/"/g, '&quot;')
    return `${match}<button class="link-jump-btn" data-link="${escaped}" data-link-type="local" title="打开所在目录">${JUMP_ICON}</button>`
  })

  processed = processed.replace(URL_RE, (match) => {
    const escaped = match.replace(/"/g, '&quot;')
    return `${match}<button class="link-jump-btn" data-link="${escaped}" data-link-type="external" title="在浏览器中打开">${JUMP_ICON}</button>`
  })

  inlineCodePlaceholders.forEach((code, i) => {
    processed = processed.replace(`__INLINE_CODE_${i}__`, code)
  })
  codeBlockPlaceholders.forEach((code, i) => {
    processed = processed.replace(`__CODE_BLOCK_${i}__`, code)
  })

  return processed
}

function convertLocalImages(html: string): string {
  return html.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi, (_match, before, src, after) => {
    if (src.startsWith('local-file:') || src.startsWith('data:') || src.startsWith('http')) return _match
    if (/^[A-Z]:[/\\].+\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(src)) {
      const url = `local-file://img?p=${encodeURIComponent(src.replace(/\\/g, '/'))}`
      return `<img ${before}src="${url}"${after}>`
    }
    return _match
  })
}

const LINK_JUMP_BTN_RE = /<button class="link-jump-btn"[^>]*>[\s\S]*?<\/button>/g

export function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string
  const withImages = convertLocalImages(html)
  const processed = insertLinkButtons(withImages)
  // Protect self-generated link-jump buttons from DOMPurify stripping their SVG icons.
  // Use a plain-ASCII token so it survives DOMPurify's HTML5 parsing round-trip.
  const jumpButtons: string[] = []
  const shielded = processed.replace(LINK_JUMP_BTN_RE, (match) => {
    jumpButtons.push(match)
    return `__LINK_JUMP_BTN_${jumpButtons.length - 1}__`
  })
  let sanitized = DOMPurify.sanitize(shielded, {
    ADD_ATTR: ['onclick', 'data-link', 'data-link-type'],
    ADD_TAGS: ['button'],
    ADD_URI_SAFE_ATTR: ['src'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|data|local-file):)/i
  })
  jumpButtons.forEach((btn, i) => {
    sanitized = sanitized.replace(`__LINK_JUMP_BTN_${i}__`, btn)
  })
  return sanitized
}
