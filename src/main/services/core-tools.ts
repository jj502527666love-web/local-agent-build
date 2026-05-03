import { executeSkillSandbox, resolveInWorkspace } from './skill-sandbox'
import { generateImages } from './image-generation'
import { listModelProviders } from './model-provider'
import { getDataDir } from './data-path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join, basename } from 'path'

const PREVIEW_MAX_BYTES = 200_000

export interface FileWritePreview {
  type: 'file_write'
  action: string
  path: string
  exists: boolean
  isBinary?: boolean
  tooLarge?: boolean
  currentContent?: string
  newContent: string
}

export function previewFileWrite(args: any, sandboxDir?: string): FileWritePreview | null {
  if (!args || typeof args !== 'object') return null
  const writeActions = ['write', 'append', 'write_json']
  if (!writeActions.includes(args.action)) return null
  const newContent = args.action === 'write_json'
    ? (() => { try { return JSON.stringify(args.data, null, 2) } catch { return String(args.data || '') } })()
    : String(args.content || '')
  let resolvedPath = ''
  let exists = false
  let currentContent: string | undefined
  let tooLarge = false
  let isBinary = false
  try {
    resolvedPath = sandboxDir ? resolveInWorkspace(args.path || '', sandboxDir) : String(args.path || '')
    exists = !!resolvedPath && existsSync(resolvedPath)
    if (exists) {
      const st = statSync(resolvedPath)
      if (st.isDirectory()) exists = false
      else if (st.size > PREVIEW_MAX_BYTES) tooLarge = true
      else {
        const buf = readFileSync(resolvedPath)
        // crude binary sniff: any null byte in the first 8KB
        const sniff = buf.subarray(0, Math.min(8192, buf.length))
        isBinary = sniff.includes(0)
        currentContent = isBinary ? undefined : buf.toString('utf-8')
      }
    }
  } catch {
    // best-effort preview
  }
  if (args.action === 'append' && typeof currentContent === 'string') {
    return {
      type: 'file_write',
      action: args.action,
      path: resolvedPath,
      exists,
      isBinary,
      tooLarge,
      currentContent,
      newContent: currentContent + newContent
    }
  }
  return {
    type: 'file_write',
    action: args.action,
    path: resolvedPath,
    exists,
    isBinary,
    tooLarge,
    currentContent,
    newContent
  }
}

function backupBeforeWrite(args: any, sandboxDir?: string): void {
  if (!args || typeof args !== 'object') return
  if (args.action !== 'write' && args.action !== 'write_json') return
  try {
    const target = sandboxDir ? resolveInWorkspace(args.path || '', sandboxDir) : String(args.path || '')
    if (!target || !existsSync(target)) return
    const st = statSync(target)
    if (st.isDirectory() || st.size === 0) return
    copyFileSync(target, target + '.bak')
  } catch {
    // backup is best-effort; never block the actual write
  }
}

export const CORE_TOOL_NAMES = ['file_ops', 'run_command', 'image_gen']

export const coreToolDefs = [
  {
    type: 'function',
    function: {
      name: 'file_ops',
      description: '文件系统操作：读取、写入、追加、列目录、创建目录、删除、复制、重命名、glob匹配、JSON读写、查找最新文件',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'append', 'list', 'mkdir', 'exists', 'stat', 'delete', 'copy', 'rename', 'glob', 'read_json', 'write_json', 'find_latest', 'tree'],
            description: '操作类型'
          },
          path: { type: 'string', description: '文件或目录路径。相对路径解析到当前对话工作区;绝对路径按字面解析;"." 或 "" 表示工作区根' },
          content: { type: 'string', description: '写入/追加的内容（write/append 时使用）' },
          dest: { type: 'string', description: '目标路径（copy/rename 时使用）' },
          pattern: { type: 'string', description: 'glob匹配模式（glob 时使用，如 *.pptx）' },
          data: { type: 'object', description: 'JSON数据对象（write_json 时使用）' },
          extension: { type: 'string', description: '文件扩展名过滤（find_latest 时使用，如 .pptx）' }
        },
        required: ['action', 'path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在系统终端执行命令，返回结构化结果 {exit_code, stdout, stderr, ok}',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          cwd: { type: 'string', description: '工作目录（可选，默认当前对话工作区；相对路径相对工作区解析）' },
          timeout: { type: 'number', description: '超时毫秒数（可选，默认120000）' }
        },
        required: ['command']
      }
    }
  }
  ,
  {
    type: 'function',
    function: {
      name: 'image_gen',
      description: 'AI图片生成工具：使用应用内配置的模型服务商生成图片。支持两种操作：list_providers 查看可用的图片生成服务商和模型，generate 生成图片。生成的图片会自动保存，可选复制到指定目录。生成成功后返回 image_url 字段，请使用 markdown 图片语法 ![描述](image_url) 在回复中展示生成的图片。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list_providers', 'generate'],
            description: '操作类型：list_providers 查看可用服务商，generate 生成图片'
          },
          prompt: { type: 'string', description: '图片描述提示词（generate 时必填）' },
          model_provider_id: { type: 'string', description: '服务商ID（generate 时必填，从 list_providers 获取）' },
          model_id: { type: 'string', description: '模型ID（generate 时必填，从 list_providers 获取）' },
          size: { type: 'string', description: '图片尺寸比例：1:1, 3:2, 2:3, 16:9, 9:16（默认 1:1）' },
          quality: { type: 'string', description: '图片质量：auto, hd（默认 auto）' },
          output_dir: { type: 'string', description: '可选，将生成的图片复制到此目录。相对路径相对当前对话工作区;未指定时默认落在 {工作区}/images/' },
          output_filename: { type: 'string', description: '可选，自定义输出文件名（不含扩展名，如 cover_bg）' },
          ref_images: { type: 'array', items: { type: 'string' }, description: '可选，参考图片的 base64 data URI 数组（用于图片编辑/风格参考）' }
        },
        required: ['action']
      }
    }
  }
]

const FILE_OPS_IMPL = `try {
  const p = args.path
  switch (args.action) {
    case 'read': return { content: fs.readFile(p), path: fs.wsResolve(p) }
    case 'write': fs.writeFile(p, args.content || ''); return { success: true, path: fs.wsResolve(p) }
    case 'append': fs.appendFile(p, args.content || ''); return { success: true, path: fs.wsResolve(p) }
    case 'list': return { entries: fs.listDir(p), path: fs.wsResolve(p) }
    case 'mkdir': fs.mkdir(p); return { success: true, path: fs.wsResolve(p) }
    case 'exists': return { exists: fs.exists(p), path: fs.wsResolve(p) }
    case 'stat': { const s = fs.stat(p); return Object.assign({}, s, { path: fs.wsResolve(p) }) }
    case 'delete': {
      const s = fs.stat(p)
      if (s.isDirectory) fs.deleteDir(p); else fs.deleteFile(p)
      return { success: true, path: fs.wsResolve(p) }
    }
    case 'copy': fs.copyFile(p, args.dest); return { success: true, path: fs.wsResolve(args.dest) }
    case 'rename': fs.rename(p, args.dest); return { success: true, path: fs.wsResolve(args.dest) }
    case 'glob': {
      const base = fs.wsResolve(p)
      const entries = fs.listDir(p)
      const pattern = args.pattern || '*'
      const re = new RegExp('^' + pattern.replace(/\\./g, '\\\\.').replace(/\\*/g, '.*').replace(/\\?/g, '.') + '$', 'i')
      const matched = entries.filter(e => re.test(e.name)).map(e => ({ name: e.name, path: fs.join(base, e.name), size: e.size, isDirectory: e.isDirectory }))
      return { matches: matched, count: matched.length, path: base }
    }
    case 'read_json': {
      const raw = fs.readFile(p)
      return { data: JSON.parse(raw), path: fs.wsResolve(p) }
    }
    case 'write_json': {
      fs.writeFile(p, JSON.stringify(args.data, null, 2))
      return { success: true, path: fs.wsResolve(p) }
    }
    case 'find_latest': {
      const base = fs.wsResolve(p)
      const ext = args.extension || ''
      const items = fs.listDir(p).filter(e => !e.isDirectory && (!ext || e.name.endsWith(ext)))
      if (!items.length) return { found: false, message: 'No matching files in ' + base, path: base }
      const withStat = items.map(e => { const full = fs.join(base, e.name); const s = fs.stat(full); return { name: e.name, path: full, size: s.size, mtime: s.mtime } })
      withStat.sort((a, b) => b.mtime.localeCompare(a.mtime))
      return { found: true, file: withStat[0], all: withStat, path: base }
    }
    case 'tree': {
      const base = fs.wsResolve(p)
      const result = []
      const walk = (dir, prefix) => {
        const items = fs.listDir(dir)
        items.forEach((item, i) => {
          const isLast = i === items.length - 1
          const connector = isLast ? '└── ' : '├── '
          const sizeStr = item.isDirectory ? '' : ' (' + item.size + 'B)'
          result.push(prefix + connector + item.name + sizeStr)
          if (item.isDirectory) walk(fs.join(dir, item.name), prefix + (isLast ? '    ' : '│   '))
        })
      }
      walk(p, '')
      return { tree: result.join('\\n'), count: result.length, path: base }
    }
    default: return { error: '未知操作: ' + args.action }
  }
} catch (e) { return { error: e.message } }`

const RUN_COMMAND_IMPL = `try {
  const timeout = args.timeout || 120000
  const result = shell.execStructured(args.command, { cwd: args.cwd, timeout })
  return result
} catch (e) {
  return { exit_code: e.status ?? 1, stdout: e.stdout?.toString()?.slice(0, 8000) || '', stderr: e.stderr?.toString()?.slice(0, 4000) || e.message, ok: false }
}`

/** Attach workspace path to every tool result so the LLM can self-orient on retries. */
function withWorkspace(result: any, sandboxDir?: string): any {
  if (!sandboxDir) return result
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...result, workspace: sandboxDir }
  }
  return { result, workspace: sandboxDir }
}

export async function executeCoreToolCall(
  functionName: string,
  args: any,
  sandboxDir?: string
): Promise<{ handled: boolean; result?: any }> {
  if (functionName === 'file_ops') {
    backupBeforeWrite(args, sandboxDir)
    const result = await executeSkillSandbox(FILE_OPS_IMPL, args, sandboxDir)
    const payload = result.success ? result.result : { error: result.error }
    return { handled: true, result: withWorkspace(payload, sandboxDir) }
  }
  if (functionName === 'run_command') {
    const result = await executeSkillSandbox(RUN_COMMAND_IMPL, args, sandboxDir)
    const payload = result.success ? result.result : { error: result.error }
    return { handled: true, result: withWorkspace(payload, sandboxDir) }
  }
  if (functionName === 'image_gen') {
    const result = await executeImageGen(args, sandboxDir)
    return { handled: true, result: withWorkspace(result, sandboxDir) }
  }
  return { handled: false }
}

const IMAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx', 'kolors']

async function executeImageGen(args: any, sandboxDir?: string): Promise<any> {
  try {
    if (args.action === 'list_providers') {
      const providers = listModelProviders()
      const result = providers.map(p => {
        const imageModels = p.models.filter(m => IMAGE_KEYWORDS.some(k => m.toLowerCase().includes(k)))
        return {
          id: p.id,
          name: p.name,
          image_models: imageModels.length ? imageModels : p.models,
          has_image_models: imageModels.length > 0
        }
      })
      return { providers: result }
    }

    if (args.action === 'generate') {
      if (!args.prompt) return { error: '缺少 prompt 参数' }
      if (!args.model_provider_id) return { error: '缺少 model_provider_id 参数，请先调用 list_providers 获取' }
      if (!args.model_id) return { error: '缺少 model_id 参数，请先调用 list_providers 获取' }

      const generations = await generateImages({
        prompt: args.prompt,
        modelProviderId: args.model_provider_id,
        modelId: args.model_id,
        size: args.size || '1:1',
        quality: args.quality || 'auto',
        batchCount: 1,
        refImages: args.ref_images || undefined
      })

      const gen = generations[0]
      if (!gen) return { error: '生成失败：无结果返回' }
      if (gen.status === 'error') return { error: `生成失败: ${gen.error}` }

      const dataDir = getDataDir()
      const absolutePath = gen.result_path ? join(dataDir, gen.result_path) : ''

      // Determine output_dir: explicit arg takes priority, else default to {workspace}/images when we have a sandbox.
      let outputDir: string | undefined = args.output_dir
      if (!outputDir && sandboxDir) outputDir = 'images'
      const resolvedOutputDir = outputDir ? resolveInWorkspace(outputDir, sandboxDir) : ''

      let outputPath = absolutePath
      if (resolvedOutputDir && absolutePath && existsSync(absolutePath)) {
        mkdirSync(resolvedOutputDir, { recursive: true })
        const ext = basename(absolutePath).split('.').pop() || 'png'
        const filename = args.output_filename ? `${args.output_filename}.${ext}` : basename(absolutePath)
        outputPath = join(resolvedOutputDir, filename)
        copyFileSync(absolutePath, outputPath)
      }

      const displayUrl = `local-file://img?p=${encodeURIComponent(outputPath.replace(/\\/g, '/'))}`
      return {
        success: true,
        path: outputPath,
        image_url: displayUrl,
        revised_prompt: gen.revised_prompt || '',
        size: gen.size,
        model: gen.model_id
      }
    }

    return { error: '未知操作: ' + args.action }
  } catch (e: any) {
    return { error: e.message || '图片生成失败' }
  }
}
