import { ipcMain as electronIpcMain, BrowserWindow, dialog, clipboard, nativeImage, app } from 'electron'
import { closeDatabase } from '../database'
import { stopAllMcpServers } from '../services/mcp-server'
import * as modelProviderService from '../services/model-provider'
import * as personaService from '../services/persona'
import * as knowledgeService from '../services/knowledge'
import * as botService from '../services/bot'
import * as conversationService from '../services/conversation'
import * as skillService from '../services/skill'
import * as mcpServerService from '../services/mcp-server'
import * as settingsService from '../services/settings'
import * as dataPathService from '../services/data-path'
import * as usageStatsService from '../services/usage-stats'
import { sendMessage, cancelChat, isChatActive, respondToolApproval, regenerateLastResponse, editAndResend } from '../services/chat-engine'
import { callLLM } from '../services/llm'
import { skillPresets } from '../services/skill-presets'
import { executeSkillSandbox } from '../services/skill-sandbox'
import * as vectorizeService from '../services/vectorize'
import * as vectorStoreService from '../services/vector-store'
import * as promptSkillService from '../services/prompt-skill'
import * as imageSessionService from '../services/image-session'
import * as imageGenService from '../services/image-generation'
import * as thumbnailService from '../services/thumbnail'
import * as inspirationService from '../services/inspiration'
import * as creativeTemplateService from '../services/creative-template'
import * as cloudCreativeTemplateService from '../services/cloud-creative-template'
import * as cloudCreativeTemplateSubmitService from '../services/cloud-creative-template-submit'
import * as cloudAgentMarketService from '../services/cloud-agent-market'
import * as cloudAgentSubmitService from '../services/cloud-agent-submit'
import * as botAvatarService from '../services/bot-avatar'
import * as promptPresetService from '../services/prompt-preset'
import * as backupService from '../services/backup'
import * as canvasService from '../services/canvas'
import * as galleryService from '../services/gallery'
import * as mattingService from '../services/matting'
import * as mattingProviderService from '../services/matting-providers'
import * as cloudVideoService from '../services/cloud-video'
import * as videoGenerationService from '../services/video-generation'
import { fetchQuota as fetchMattingQuotaFromCloud } from '../services/cloud-matting'
import * as fineMattingService from '../services/fine-matting'
import { fetchQuota as fetchFineMattingQuotaFromCloud } from '../services/cloud-fine-matting'
import { parseDocumentFromBuffer, readFileSmart } from '../services/document-parser'
import {
  setCloudToken,
  getCloudToken,
  setCloudPermissions,
  setCloudEmbeddingModels,
  getCloudEmbeddingModels,
  setPreferredCloudEmbeddingModel,
  getPreferredCloudEmbeddingModel,
  getActiveCloudEmbeddingModelId,
  getAllowCustomEmbedding,
  setCloudModels,
} from '../services/cloud-token'
import { getDeviceId } from '../services/device-id'
import { setActiveAccount } from '../services/account-context'
import * as deviceSettingsService from '../services/device-settings'
import { uploadInspiration as uploadInspirationToCloud } from '../services/cloud-inspiration'
import { runInEpoch } from '../services/account-epoch'

// 用账号代次（epoch）包裹每个 IPC handler 的执行：handler 及其 await / fire-and-forget 子任务
// 都运行在「当前账号代次」的 AsyncLocalStorage 上下文中。账号热切换后，旧 handler 触发的残留
// 异步任务写库时，getDatabase() 的 assertEpoch() 会因代次不符拒绝写入（防止串账号数据）。
function wrapWithEpoch(real: Electron.IpcMain) {
  return {
    handle: (channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) =>
      real.handle(channel, (event, ...args) => runInEpoch(() => listener(event, ...args))),
    on: (channel: string, listener: (event: Electron.IpcMainEvent, ...args: any[]) => void) =>
      real.on(channel, (event, ...args) => runInEpoch(() => listener(event, ...args)))
  }
}

export function registerIpcHandlers(): void {
  // 统一为所有 IPC handler 注入账号代次上下文（见 wrapWithEpoch）。
  // 例外：cloud:setActiveAccount 用未包裹的 electronIpcMain 注册（它本身是切换编排，
  // bumpEpoch 后需以新代次开库，不能停留在旧代次上下文）。
  const ipcMain = wrapWithEpoch(electronIpcMain)
  // === Model Providers ===
  ipcMain.handle('model:list', () => modelProviderService.listModelProviders())
  ipcMain.handle('model:get', (_, id: string) => modelProviderService.getModelProvider(id))
  ipcMain.handle('model:create', (_, data) => modelProviderService.createModelProvider(data))
  ipcMain.handle('model:update', (_, id: string, data) =>
    modelProviderService.updateModelProvider(id, data)
  )
  ipcMain.handle('model:delete', (_, id: string) => modelProviderService.deleteModelProvider(id))
  ipcMain.handle('model:fetchRemote', (_, apiBase: string, apiKey: string) =>
    modelProviderService.fetchRemoteModels(apiBase, apiKey)
  )

  // === Personas ===
  ipcMain.handle('persona:list', () => personaService.listPersonas())
  ipcMain.handle('persona:get', (_, id: string) => personaService.getPersona(id))
  ipcMain.handle('persona:create', (_, data) => personaService.createPersona(data))
  ipcMain.handle('persona:update', (_, id: string, data) =>
    personaService.updatePersona(id, data)
  )
  ipcMain.handle('persona:delete', (_, id: string) => personaService.deletePersona(id))

  // === Knowledge Base Categories ===
  ipcMain.handle('knowledge:listCategories', () => knowledgeService.listCategories())
  ipcMain.handle('knowledge:getCategory', (_, id: string) => knowledgeService.getCategory(id))
  ipcMain.handle('knowledge:createCategory', (_, data) => knowledgeService.createCategory(data))
  ipcMain.handle('knowledge:updateCategory', (_, id: string, data) =>
    knowledgeService.updateCategory(id, data)
  )
  ipcMain.handle('knowledge:deleteCategory', (_, id: string) =>
    knowledgeService.deleteCategory(id)
  )

  // === Knowledge Bases ===
  ipcMain.handle('knowledge:list', (_, categoryId?: string) =>
    knowledgeService.listKnowledgeBases(categoryId)
  )
  ipcMain.handle('knowledge:listPaged', (_, categoryId: string, page: number, pageSize: number) =>
    knowledgeService.listKnowledgeBasesPaged(categoryId, page, pageSize)
  )
  ipcMain.handle('knowledge:get', (_, id: string) => knowledgeService.getKnowledgeBase(id))
  ipcMain.handle('knowledge:create', (_, data) => knowledgeService.createKnowledgeBase(data))
  ipcMain.handle('knowledge:delete', (_, id: string) => knowledgeService.deleteKnowledgeBase(id))
  ipcMain.handle('knowledge:bindFolder', (_, categoryId: string, folderPath: string) =>
    knowledgeService.bindFolder(categoryId, folderPath)
  )
  ipcMain.handle('knowledge:unbindFolder', (_, categoryId: string, folderPath: string) =>
    knowledgeService.unbindFolder(categoryId, folderPath)
  )
  ipcMain.handle('knowledge:sync', (_, categoryId: string) =>
    knowledgeService.syncCategory(categoryId)
  )

  // === Bots ===
  ipcMain.handle('bot:list', () => botService.listBots())
  ipcMain.handle('bot:get', (_, id: string) => botService.getBot(id))
  ipcMain.handle('bot:create', (_, data) => botService.createBot(data))
  ipcMain.handle('bot:update', (_, id: string, data) => botService.updateBot(id, data))
  ipcMain.handle('bot:delete', (_, id: string) => {
    const bot = botService.getBot(id)
    const ok = botService.deleteBot(id)
    if (ok && bot?.avatar) botAvatarService.deleteAvatarFile(bot.avatar)
    return ok
  })
  // 本地形象图：渲染端选图 data:URL → 落盘返回绝对路径
  ipcMain.handle('bot:saveAvatar', (_, dataUrl: string) => botAvatarService.saveAvatarFromDataUrl(dataUrl))
  // 智能体市场：公开拉取 + 保存到本地
  ipcMain.handle('bot:listMarket', (_, options?) => cloudAgentMarketService.fetchMarketAgents(options))
  ipcMain.handle('bot:getMarket', (_, id: number) => cloudAgentMarketService.fetchMarketAgent(id))
  ipcMain.handle('bot:importFromMarket', (_, cloudAgent) => cloudAgentMarketService.importAgentAsLocal(cloudAgent))
  // 投稿 / 状态轮询 / 撤回 / 评分
  ipcMain.handle('bot:submitToMarket', (_, localBotId: string) => cloudAgentSubmitService.submitAgentToMarket(localBotId))
  ipcMain.handle('bot:syncSubmissionStatus', (_, localBotIds: string[]) => cloudAgentSubmitService.syncAgentSubmissionStatus(localBotIds))
  ipcMain.handle('bot:withdrawSubmission', (_, localBotId: string) => cloudAgentSubmitService.withdrawAgentSubmission(localBotId))
  ipcMain.handle('bot:rate', (_, cloudAgentId: number, score: number, comment?: string) => cloudAgentSubmitService.rateAgent(cloudAgentId, score, comment))

  // === Conversations ===
  ipcMain.handle('chat:listConversations', (_, botId: string) =>
    conversationService.listConversations(botId)
  )
  ipcMain.handle('chat:getConversation', (_, id: string) =>
    conversationService.getConversation(id)
  )
  ipcMain.handle(
    'chat:createConversation',
    (
      _,
      botId: string,
      title?: string,
      initialModel?: { provider_id: string; model_id: string },
      initialImageModel?: { provider_id: string; model_id: string }
    ) => conversationService.createConversation(botId, title, initialModel, initialImageModel)
  )
  ipcMain.handle('chat:updateTitle', (_, id: string, title: string) =>
    conversationService.updateConversationTitle(id, title)
  )
  // 切换会话使用的模型（输入框左下角下拉触发）。每个会话独立持久化。
  ipcMain.handle(
    'chat:updateConversationModel',
    (_, id: string, provider_id: string, model_id: string) =>
      conversationService.updateConversationModel(id, provider_id, model_id)
  )
  // v0.6.6+ 切换会话使用的生图模型（输入框左下角第二个切换器）。
  ipcMain.handle(
    'chat:updateConversationImageModel',
    (_, id: string, provider_id: string, model_id: string) =>
      conversationService.updateConversationImageModel(id, provider_id, model_id)
  )
  ipcMain.handle('chat:deleteConversation', (_, id: string) =>
    conversationService.deleteConversation(id)
  )

  // === Messages ===
  ipcMain.handle('chat:getMessages', (_, conversationId: string) =>
    conversationService.getMessages(conversationId)
  )
  ipcMain.handle('chat:sendMessage', (event, data) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return sendMessage(data, window)
  })
  ipcMain.handle('chat:cancel', (_, conversationId: string, requestId?: string) => cancelChat(conversationId, requestId))
  ipcMain.handle('chat:isActive', (_, conversationId: string) => isChatActive(conversationId))
  ipcMain.handle('chat:respondToolApproval', (_, requestId: string, approved: boolean) =>
    respondToolApproval(requestId, approved)
  )
  ipcMain.handle('chat:deleteMessage', (_, id: string) =>
    conversationService.deleteMessage(id)
  )
  ipcMain.handle('chat:regenerate', (event, conversationId: string, requestId?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return regenerateLastResponse(conversationId, window, requestId)
  })
  ipcMain.handle('chat:editMessage', (event, conversationId: string, messageId: string, newContent: string, requestId?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return editAndResend(conversationId, messageId, newContent, window, requestId)
  })

  // === File Reading ===
  ipcMain.handle('chat:readFileBase64', async (_, filePath: string) => {
    const { readFileSync } = require('fs')
    return readFileSync(filePath).toString('base64')
  })
  // readFileText：智能读取，二进制办公文档（PDF/DOCX/DOC/XLS/XLSX）走对应解析器
  // 提取为纯文本；TXT/MD/JSON/CSV 等纯文本格式 utf-8 直读。
  // 解析失败时返回带错误说明的占位字符串，让 LLM 知道发生了什么而非看到乱码。
  ipcMain.handle('chat:readFileText', async (_, filePath: string) => {
    const result = await readFileSmart(filePath)
    if (result.ok) return result.text
    // 失败兜底：把错误信息作为可读占位返回，比抛错更友好（聊天附件场景不应整体失败）
    return `[文档解析失败：${result.error || '未知错误'}（解析器=${result.parser}, 扩展名=${result.ext || '未知'}）]`
  })
  // readDocument：新增。返回结构化 ParsedDocument，便于将来 UI 展示截断/解析器/大小等元数据。
  // 当前 ChatView 仍走 readFileText，无破坏性改动。
  ipcMain.handle('chat:readDocument', async (_, filePath: string) => {
    return readFileSmart(filePath)
  })
  // parseBuffer：拖拽附件场景专用——渲染端拿到 File 对象后 arrayBuffer() 通过 IPC 上送，
  // 主进程按扩展名走 PDF/DOCX/DOC/XLS/XLSX 二进制解析器返回纯文本。
  // 解决「拖入 PDF/DOCX 等二进制文档 → file.text() 按 utf-8 读取得到乱码」问题。
  // 返回值与 readFileText 一致：成功返回 text 字符串；失败返回带错误说明的占位字符串。
  ipcMain.handle('chat:parseBuffer', async (_, payload: { buffer: ArrayBuffer; ext: string }) => {
    const buffer = Buffer.from(payload.buffer)
    const result = await parseDocumentFromBuffer(buffer, payload.ext)
    if (result.ok) return result.text
    return `[文档解析失败：${result.error || '未知错误'}（解析器=${result.parser}, 扩展名=${result.ext || '未知'}）]`
  })
  ipcMain.handle('chat:parseDocumentBuffer', async (_, payload: { buffer: ArrayBuffer; ext: string }) => {
    const buffer = Buffer.from(payload.buffer)
    return parseDocumentFromBuffer(buffer, payload.ext)
  })

  // === LLM Utility ===
  const llmAbortMap = new Map<string, AbortController>()

  ipcMain.handle(
    'llm:call',
    async (
      event,
      providerId: string,
      modelId: string,
      messages: any[],
      opts?: {
        requestId?: string
        max_tokens?: number
        response_format?: { type: string; [k: string]: any }
        stream?: boolean
        notifyStream?: boolean
        timeoutMs?: number
        temperature?: number
      }
    ) => {
      const {
        requestId,
        max_tokens,
        response_format,
        stream = true,
        notifyStream,
        timeoutMs,
        temperature
      } = opts ?? {}

      const ac = new AbortController()
      if (requestId) {
        // Cancel any previous request sharing the same requestId
        const prev = llmAbortMap.get(requestId)
        if (prev) prev.abort()
        llmAbortMap.set(requestId, ac)
      }

      // Optional hard timeout
      let timer: ReturnType<typeof setTimeout> | undefined
      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => ac.abort(), timeoutMs)
      }

      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined

      try {
        const result = await callLLM(
          providerId,
          {
            modelId,
            messages,
            stream,
            max_tokens,
            response_format,
            temperature,
            notifyStream,
            signal: ac.signal
          },
          win
        )
        return result.content
      } finally {
        if (timer) clearTimeout(timer)
        if (requestId) llmAbortMap.delete(requestId)
      }
    }
  )

  ipcMain.handle('llm:cancel', (_, requestId: string) => {
    const ac = llmAbortMap.get(requestId)
    if (ac) {
      ac.abort()
      llmAbortMap.delete(requestId)
    }
  })

  // === Skills ===
  ipcMain.handle('skill:list', () => skillService.listSkills())
  ipcMain.handle('skill:get', (_, id: string) => skillService.getSkill(id))
  ipcMain.handle('skill:create', (_, data) => skillService.createSkill(data))
  ipcMain.handle('skill:update', (_, id: string, data) => skillService.updateSkill(id, data))
  ipcMain.handle('skill:delete', (_, id: string) => skillService.deleteSkill(id))
  ipcMain.handle('skill:presets', () => skillPresets)
  ipcMain.handle('skill:test', async (_, implementation: string, argsJson: string) => {
    let args = {}
    try { args = JSON.parse(argsJson || '{}') } catch {}
    return executeSkillSandbox(implementation, args)
  })
  ipcMain.handle('skill:export', (_, ids: string[]) => {
    const skills = ids.map((id) => skillService.getSkill(id)).filter(Boolean)
    return skills.map((s) => ({
      name: s!.name,
      description: s!.description,
      function_def: s!.function_def,
      implementation: s!.implementation,
      version: s!.version
    }))
  })
  // 单条独立 try/catch：重名失败时跳过该条继续处理后续，不让整批回滚。
  // 返回 { created, errors }：前端可分别提示成功条数 + 重名条目，体验比整批回滚友好得多。
  ipcMain.handle('skill:import', (_, dataArr: any[]) => {
    const created: any[] = []
    const errors: { name: string; reason: string }[] = []
    for (const data of dataArr) {
      try {
        const skill = skillService.createSkill({
          name: data.name,
          description: data.description || '',
          function_def: data.function_def || {},
          implementation: data.implementation || '',
          version: data.version || '1.0.0'
        })
        created.push(skill)
      } catch (e: any) {
        errors.push({
          name: data.name || data.function_def?.name || '未命名',
          reason: e?.message || String(e)
        })
      }
    }
    return { created, errors }
  })

  // === MCP Servers ===
  ipcMain.handle('mcp:list', () => mcpServerService.listMcpServers())
  ipcMain.handle('mcp:get', (_, id: string) => mcpServerService.getMcpServer(id))
  ipcMain.handle('mcp:create', (_, data) => mcpServerService.createMcpServer(data))
  ipcMain.handle('mcp:update', (_, id: string, data) => mcpServerService.updateMcpServer(id, data))
  ipcMain.handle('mcp:delete', (_, id: string) => mcpServerService.deleteMcpServer(id))
  ipcMain.handle('mcp:start', (_, id: string) => mcpServerService.startMcpServer(id))
  ipcMain.handle('mcp:stop', (_, id: string) => mcpServerService.stopMcpServer(id))
  ipcMain.handle('mcp:status', (_, id: string) => mcpServerService.getMcpServerStatus(id))

  // === Prompt Skills (SKILL.md) ===
  ipcMain.handle('promptSkill:list', () => promptSkillService.listPromptSkills())
  ipcMain.handle('promptSkill:getContent', (_, dirName: string) =>
    promptSkillService.getPromptSkillContent(dirName)
  )
  ipcMain.handle('promptSkill:toggle', (_, dirName: string, enabled: boolean) =>
    promptSkillService.togglePromptSkill(dirName, enabled)
  )
  ipcMain.handle('promptSkill:delete', (_, dirName: string) =>
    promptSkillService.deletePromptSkill(dirName)
  )
  ipcMain.handle('promptSkill:create', (_, name: string, description: string, content: string) =>
    promptSkillService.createPromptSkillFromContent(name, description, content)
  )
  ipcMain.handle('promptSkill:getDir', () => promptSkillService.getSkillsDirectory())
  ipcMain.handle('promptSkill:installFromUrl', async (_, url: string) => {
    const { installSkillFromUrl } = await import('../services/prompt-skill-installer')
    return installSkillFromUrl(url)
  })
  ipcMain.handle('promptSkill:searchMarket', async (_, keyword: string) => {
    const { searchMarketSkills } = await import('../services/prompt-skill-installer')
    return searchMarketSkills(keyword)
  })

  // === Data Directory ===
  ipcMain.handle('dataDir:get', () => dataPathService.getDataDir())
  ipcMain.handle('dataDir:isFirstLaunch', () => dataPathService.isFirstLaunch())
  // initDataDir / setDataDir 默认 activate=false，仅写 config 不切换运行时缓存。
  // 由 renderer 拿到 needsRelaunch 信号后弹"立即重启"对话框，避免本次会话数据切割。
  ipcMain.handle('dataDir:init', (_, dir?: string) => {
    const result = dataPathService.initDataDir(dir)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, needsRelaunch: !dataPathService.isDataDirActivated() }
  })
  ipcMain.handle('dataDir:set', async (_, dir: string) => {
    const result = dataPathService.setDataDir(dir)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, needsRelaunch: !dataPathService.isDataDirActivated() }
  })
  ipcMain.handle('dataDir:isActivated', () => dataPathService.isDataDirActivated())
  ipcMain.handle('dataDir:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择数据存储目录',
      defaultPath: dataPathService.getDataDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // === Data Migration ===
  ipcMain.handle('migration:check', () => dataPathService.checkMigration())
  ipcMain.handle('migration:start', async (event, options?: { conflictStrategy?: 'keep-existing' | 'overwrite' }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    // 关键：迁移会复制 sqlite db 文件，必须先关闭已打开的句柄，
    // 否则 Windows 文件锁会让 copyFileSync 失败，或写入正在使用的页缓存破坏一致性。
    // 迁移完成后调用方应触发 app:relaunch，让下次启动重新打开正确的 db。
    try { closeDatabase() } catch (e) { console.error('closeDatabase before migration failed:', e) }
    return dataPathService.migrateFiles((current, total, fileName) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('migration:progress', { current, total, fileName })
      }
    }, options)
  })
  ipcMain.handle('migration:deleteOld', () => dataPathService.deleteOldDir())
  ipcMain.handle('migration:skip', () => {
    dataPathService.skipMigration()
    return true
  })
  // 永久放弃旧数据目录记录（与 skip 区分：skip 仅本次不弹，下次启动仍提示）。
  ipcMain.handle('migration:abandon', () => {
    dataPathService.abandonOldDataDir()
    return true
  })

  // === App Lifecycle ===
  // 触发应用重启。用于：首次配置/设置页修改数据目录后，让 cachedDataDir 与 db 实例同步。
  ipcMain.handle('app:relaunch', () => {
    try { closeDatabase() } catch {}
    // 释放单实例锁，避免新实例抢锁失败而闪退（详见 account-context.performAccountSwitchRelaunch 注释）
    try { app.releaseSingleInstanceLock() } catch {}
    app.relaunch()
    app.exit(0)
  })

  // === Settings ===
  ipcMain.handle('settings:get', (_, key: string) => settingsService.getSetting(key))
  ipcMain.handle('settings:set', (_, key: string, value: string) =>
    settingsService.setSetting(key, value)
  )
  ipcMain.handle('settings:getAll', () => settingsService.getAllSettings())

  // === Device Settings（设备级：root 级 device-settings.json，独立于按账号隔离的 settings 表）===
  ipcMain.handle('deviceSettings:get', (_, key: string) => deviceSettingsService.getDeviceSetting(key))
  ipcMain.handle('deviceSettings:set', (_, key: string, value: string) =>
    deviceSettingsService.setDeviceSetting(key, value)
  )

  // === Vector Connection Test ===
  ipcMain.handle('settings:testVector', async (_, apiBase: string, apiKey: string, model: string) => {
    const url = apiBase.replace(/\/+$/, '') + '/embeddings'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: ['test'] })
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${response.status}: ${errorText}`)
    }
    const data = await response.json()
    if (!data.data || !Array.isArray(data.data) || !data.data[0]?.embedding) {
      throw new Error('返回格式异常')
    }
    return { dimension: data.data[0].embedding.length }
  })

  // === Vectorize ===
  ipcMain.handle('vectorize:document', (event, knowledgeBaseId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return vectorizeService.vectorizeDocument(knowledgeBaseId, window)
  })
  ipcMain.handle('vectorize:category', (event, categoryId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return vectorizeService.vectorizeCategory(categoryId, window)
  })
  ipcMain.handle('vectorize:resetCategory', (event, categoryId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return vectorizeService.resetAndVectorizeCategory(categoryId, window)
  })
  ipcMain.handle('vectorize:all', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return vectorizeService.vectorizeAll(window)
  })
  ipcMain.handle('vectorize:stats', () => vectorizeService.getVectorStatsForUI())
  ipcMain.handle('vectorize:chunkCount', (_, knowledgeBaseId: string) =>
    vectorStoreService.getChunkCountByKnowledgeBaseId(knowledgeBaseId)
  )
  ipcMain.handle('vectorize:checkModelMismatch', () =>
    vectorizeService.checkEmbeddingModelMismatch()
  )
  ipcMain.handle('vectorize:reembedAll', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return vectorizeService.reembedAll(window)
  })

  // === Usage Stats ===
  ipcMain.handle('usage:getAll', () => usageStatsService.getAllUsageStats())
  ipcMain.handle('usage:getProvider', (_, providerId: string) =>
    usageStatsService.getProviderUsageStats(providerId)
  )
  ipcMain.handle('usage:clear', (_, providerId?: string) =>
    usageStatsService.clearUsageStats(providerId)
  )

  // === Dialog ===
  ipcMain.handle('dialog:openFile', async (event, options) => {
    // 必须传 BrowserWindow 作为 parent：mac 上无 parent 的 dialog 偶发不可见 / 弹到屏幕外 /
    // 在某些会话状态下被 WindowServer 拒绝展示，导致「点击附件按钮没反应」。
    // 拿不到 parent 时退化为独立模态（与原行为兼容）。
    try {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      return result
    } catch (e: any) {
      console.error('[dialog:openFile] failed:', e?.message || e)
      return { canceled: true, filePaths: [], error: e?.message || String(e) }
    }
  })

  // === 原生提示框：替代渲染层 window.alert/confirm ===
  // Electron 在 Windows 上有已知 bug：renderer 调用原生 alert/confirm 关闭后，父窗口收不回
  // 键盘焦点，导致随后点击输入框有光标却无法输入（智能体编辑、模板保存等表单均受影响）。
  // 改用主进程 dialog.showMessageBoxSync（不触发该 bug）+ sendSync 保持同步语义，渲染层零改动。
  ipcMain.on('dialog:alert', (event, message: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'info' as const,
      buttons: ['确定'],
      defaultId: 0,
      noLink: true,
      message: String(message ?? '')
    }
    if (win) dialog.showMessageBoxSync(win, options)
    else dialog.showMessageBoxSync(options)
    event.returnValue = true
  })
  ipcMain.on('dialog:confirm', (event, message: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'question' as const,
      buttons: ['确定', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      message: String(message ?? '')
    }
    const index = win ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options)
    event.returnValue = index === 0
  })

  // === Shell ===
  ipcMain.handle('shell:openPath', async (_, path: string) => {
    const { shell } = require('electron')
    const { existsSync } = require('fs')
    // shell.openPath 返回 Promise<string>：空串=成功，非空=错误。统一加日志方便 mac 排查。
    if (!path) {
      console.error('[shell:openPath] empty path')
      return 'empty path'
    }
    if (!existsSync(path)) {
      console.error('[shell:openPath] path not found:', path)
      return `path not found: ${path}`
    }
    try {
      const errMsg = await shell.openPath(path)
      if (errMsg) console.error('[shell:openPath]', path, '→', errMsg)
      return errMsg
    } catch (e: any) {
      const msg = e?.message || String(e)
      console.error('[shell:openPath] exception:', path, msg)
      return msg
    }
  })
  ipcMain.handle('shell:showItemInFolder', async (_, path: string) => {
    const { shell } = require('electron')
    const { existsSync } = require('fs')
    const nodePath = require('path')
    if (!path) {
      console.error('[shell:showItemInFolder] empty path')
      return { success: false, error: 'empty path' }
    }
    // 相对路径（不以盘符或 / 开头）→ 拼接数据目录得到绝对路径
    let resolved = path
    if (!/^[A-Za-z]:|^\//.test(resolved)) {
      resolved = nodePath.join(dataPathService.getDataDir(), resolved)
    }
    console.log('[shell:showItemInFolder] resolved:', resolved)
    if (existsSync(resolved)) {
      try {
        shell.showItemInFolder(resolved)
        return { success: true, path: resolved }
      } catch (e: any) {
        console.error('[shell:showItemInFolder] exception:', resolved, e?.message || e)
        return { success: false, path: resolved, error: e?.message || String(e) }
      }
    }
    // 目标文件已被移动/删除：mac 上 showItemInFolder 对不存在路径静默无响应，
    // 退化为打开父目录，至少让用户看到所在文件夹的位置。
    console.warn('[shell:showItemInFolder] target missing, fallback to parent dir')
    const parent = nodePath.dirname(resolved)
    if (existsSync(parent)) {
      try {
        const errMsg = await shell.openPath(parent)
        if (errMsg) {
          console.error('[shell:showItemInFolder] openPath(parent) failed:', parent, errMsg)
          return { success: false, path: resolved, error: `target not found; opening folder failed: ${errMsg}` }
        }
        return { success: true, path: parent, fallback: 'parent' }
      } catch (e: any) {
        return { success: false, path: resolved, error: e?.message || String(e) }
      }
    }
    return { success: false, path: resolved, error: 'target and parent both missing' }
  })
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    const { shell } = require('electron')
    return shell.openExternal(url)
  })

  // === Image Generation Sessions ===
  ipcMain.handle('imageGen:listSessions', () => imageSessionService.listImageSessions())
  ipcMain.handle('imageGen:getSession', (_, id: string) => imageSessionService.getImageSession(id))
  ipcMain.handle('imageGen:createSession', (_, data?) => imageSessionService.createImageSession(data))
  ipcMain.handle('imageGen:updateSession', (_, id: string, data) =>
    imageSessionService.updateImageSession(id, data)
  )
  ipcMain.handle('imageGen:deleteSession', (_, id: string) =>
    imageSessionService.deleteImageSession(id)
  )

  // === Image Generations ===
  ipcMain.handle('imageGen:listGenerations', (_, sessionId: string) =>
    imageGenService.listGenerations(sessionId)
  )
  ipcMain.handle('imageGen:listRecentGenerations', (_, limit?: number) =>
    imageGenService.listRecentGenerations(limit)
  )
  ipcMain.handle('imageGen:listAllGenerations', (_, page: number, pageSize: number, search?: string, startDate?: string, endDate?: string) =>
    imageGenService.listAllGenerations(page, pageSize, search, startDate, endDate)
  )
  ipcMain.handle('imageGen:generate', (event, options) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return imageGenService.generateImages(options, window)
  })
  ipcMain.handle('imageGen:cancelGeneration', (_, genId: string) =>
    imageGenService.cancelGeneration(genId)
  )
  ipcMain.handle('imageGen:cancelGenerations', (_, genIds: string[]) =>
    imageGenService.cancelGenerations(genIds)
  )
  ipcMain.handle('imageGen:deleteGeneration', (_, id: string) =>
    imageGenService.deleteGeneration(id)
  )
  ipcMain.handle('imageGen:deleteGenerations', (_, ids: string[]) =>
    imageGenService.deleteGenerations(ids)
  )
  ipcMain.handle('imageGen:countFailedGenerations', () =>
    imageGenService.countFailedGenerations()
  )
  ipcMain.handle('imageGen:clearFailedGenerations', () =>
    imageGenService.clearFailedGenerations()
  )
  ipcMain.handle('imageGen:preloadThumbnails', (_, paths: string[]) =>
    thumbnailService.preloadThumbnails((paths || []).map((p) => imageGenService.getAbsolutePath(p)))
  )

  ipcMain.handle('imageGen:getGeneration', (_, id: string) =>
    imageGenService.getGeneration(id)
  )
  ipcMain.handle('imageGen:saveEditedImage', (_, id: string, base64Data: string) =>
    imageGenService.saveEditedImage(id, base64Data)
  )
  ipcMain.handle('imageGen:saveLocalEdited', (_, sourcePath: string, base64Data: string) =>
    imageGenService.saveLocalEdited(sourcePath, base64Data)
  )
  ipcMain.handle('imageGen:getAbsolutePath', (_, relPath: string) =>
    imageGenService.getAbsolutePath(relPath)
  )

  // 通用「按顺序导出」：把内存态结果图（电商工具等非画布 project）按列表顺序复制到
  // 用户选定目录，文件名 = {NN}-{label}.{ext}，序号前缀保证资源管理器内顺序稳定。
  // items: [{ path: result_path（相对/绝对均可）, name: 语义标签 }]
  ipcMain.handle(
    'imageGen:exportImages',
    async (event, items: { path: string; name: string }[]) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { success: false, error: '窗口不可用' }
      const list = (Array.isArray(items) ? items : []).filter((it) => it && it.path)
      if (!list.length) return { success: false, error: '没有可导出的图片' }

      const picked = await dialog.showOpenDialog(win, {
        title: '选择导出目录',
        properties: ['openDirectory', 'createDirectory']
      })
      if (picked.canceled || !picked.filePaths?.[0]) return { success: false, canceled: true }

      const targetDir = picked.filePaths[0]
      const { copyFileSync, existsSync, mkdirSync } = require('fs') as typeof import('fs')
      const { join, extname } = require('path') as typeof import('path')
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

      const sanitize = (s: string): string =>
        ((s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'image').slice(0, 80)
      const used = new Set<string>()
      const files: string[] = []
      let exported = 0
      list.forEach((it, i) => {
        const abs = imageGenService.getAbsolutePath(it.path)
        if (!existsSync(abs)) return
        const ext = extname(abs).replace('.', '').toLowerCase() || 'png'
        const seq = String(i + 1).padStart(2, '0')
        let name = `${seq}-${sanitize(it.name)}.${ext}`
        if (used.has(name)) {
          const base = name.slice(0, name.length - ext.length - 1)
          let k = 2
          while (used.has(`${base}(${k}).${ext}`)) k++
          name = `${base}(${k}).${ext}`
        }
        used.add(name)
        try {
          copyFileSync(abs, join(targetDir, name))
          files.push(name)
          exported++
        } catch (e) {
          console.error('[imageGen:exportImages] copy failed:', abs, '→', name, e)
        }
      })
      return { success: true, dir: targetDir, exported, total: list.length, files }
    }
  )

  // === Creative Templates（v0.7.7+：本地分类/模板 CRUD + 云端模板拉取） ===
  // 本地模板存在 dataDir 的 sqlite；云端模板走云控端 /public/creative-templates/*
  ipcMain.handle('creativeTemplate:listCategories', () =>
    creativeTemplateService.listCategories()
  )
  ipcMain.handle('creativeTemplate:createCategory', (_, data) =>
    creativeTemplateService.createCategory(data)
  )
  ipcMain.handle('creativeTemplate:updateCategory', (_, id: string, data) =>
    creativeTemplateService.updateCategory(id, data)
  )
  ipcMain.handle('creativeTemplate:deleteCategory', (_, id: string) =>
    creativeTemplateService.deleteCategory(id)
  )
  ipcMain.handle('creativeTemplate:list', (_, options?) =>
    creativeTemplateService.listTemplates(options)
  )
  ipcMain.handle('creativeTemplate:get', (_, id: string) =>
    creativeTemplateService.getTemplate(id)
  )
  ipcMain.handle('creativeTemplate:create', (_, data) =>
    creativeTemplateService.createTemplate(data)
  )
  ipcMain.handle('creativeTemplate:update', (_, id: string, data) =>
    creativeTemplateService.updateTemplate(id, data)
  )
  ipcMain.handle('creativeTemplate:delete', (_, id: string) =>
    creativeTemplateService.deleteTemplate(id)
  )
  ipcMain.handle('creativeTemplate:importLocal', (_, source, targetCategoryId: string) =>
    creativeTemplateService.importTemplateAsLocal(source, targetCategoryId)
  )
  ipcMain.handle('creativeTemplate:render', (_, id: string, values: Record<string, unknown>) => {
    const t = creativeTemplateService.getTemplate(id)
    if (!t) return { ok: false, error: 'not_found' as const }
    const missing = creativeTemplateService.findMissingRequired(t, values || {})
    const prompt = creativeTemplateService.renderTemplatePrompt(t, values || {})
    return { ok: true as const, prompt, missing, default_size: t.default_size, example_ref_images: t.example_ref_images, requires_ref_image: t.requires_ref_image }
  })
  // 云端模板（公开接口）
  ipcMain.handle('creativeTemplate:cloudCategories', () =>
    cloudCreativeTemplateService.fetchCloudCategories()
  )
  ipcMain.handle('creativeTemplate:cloudList', (_, options?) =>
    cloudCreativeTemplateService.fetchCloudTemplates(options)
  )
  ipcMain.handle('creativeTemplate:cloudGet', (_, id: number) =>
    cloudCreativeTemplateService.fetchCloudTemplate(id)
  )
  ipcMain.handle('creativeTemplate:submitToCloud', (_, params: { templateId: string; cloudCategoryId: number }) =>
    cloudCreativeTemplateSubmitService.submitCreativeTemplate(params)
  )
  ipcMain.handle('creativeTemplate:syncSubmissionStatus', (_, templateIds: string[]) =>
    cloudCreativeTemplateSubmitService.syncCreativeTemplateSubmissionStatus(templateIds)
  )
  ipcMain.handle('creativeTemplate:withdrawSubmission', (_, templateId: string) =>
    cloudCreativeTemplateSubmitService.withdrawCreativeTemplateSubmission(templateId)
  )

  // === Inspirations ===
  ipcMain.handle('imageGen:listInspirations', (_, options?) =>
    inspirationService.listInspirations(options)
  )
  ipcMain.handle('imageGen:getInspiration', (_, id: string) =>
    inspirationService.getInspiration(id)
  )
  ipcMain.handle('imageGen:fetchOnlineInspirations', (_, options?) =>
    inspirationService.fetchOnlineInspirations(options)
  )
  ipcMain.handle('imageGen:getInspirationCategories', () =>
    inspirationService.getInspirationCategories()
  )

  // === Prompt Presets ===
  ipcMain.handle('promptPreset:listCategories', (_, type?: string) =>
    promptPresetService.listCategories(type)
  )
  ipcMain.handle('promptPreset:createCategory', (_, data) =>
    promptPresetService.createCategory(data)
  )
  ipcMain.handle('promptPreset:updateCategory', (_, id: string, data) =>
    promptPresetService.updateCategory(id, data)
  )
  ipcMain.handle('promptPreset:deleteCategory', (_, id: string) =>
    promptPresetService.deleteCategory(id)
  )
  ipcMain.handle('promptPreset:listPresets', (_, type?: string) =>
    promptPresetService.listPresets(type)
  )
  ipcMain.handle('promptPreset:listByCategory', (_, categoryId: string) =>
    promptPresetService.listPresetsByCategory(categoryId)
  )
  ipcMain.handle('promptPreset:createPreset', (_, data) =>
    promptPresetService.createPreset(data)
  )
  ipcMain.handle('promptPreset:updatePreset', (_, id: string, data) =>
    promptPresetService.updatePreset(id, data)
  )
  ipcMain.handle('promptPreset:deletePreset', (_, id: string) =>
    promptPresetService.deletePreset(id)
  )

  // === Clipboard ===
  ipcMain.handle('clipboard:writeImage', async (_, filePath: string) => {
    try {
      const { existsSync } = require('fs') as typeof import('fs')
      const { resolve } = require('path') as typeof import('path')

      let absPath = filePath
      if (!/^[A-Za-z]:/.test(filePath) && !filePath.startsWith('/')) {
        absPath = resolve(dataPathService.getDataDir(), filePath)
      }
      if (!existsSync(absPath)) return { success: false, error: '文件不存在' }

      const img = nativeImage.createFromPath(absPath)
      if (img.isEmpty()) return { success: false, error: '无法读取图片' }
      clipboard.writeImage(img)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) }
    }
  })

  // === Backup ===
  //
  // 进度事件统一通过 'backup:progress' channel 发送 ProgressEvent 对象。
  // 取消由 'backup:cancel' channel 触发，主进程 service 内部维护单一 token。
  // 恢复成功后强制 relaunch，避免 service 在新 db 上跑 migration+seed 污染恢复结果。

  /**
   * 恢复完成后重启应用。
   *
   * 关键：必须显式停止 MCP 子进程 + 关闭 db，再 relaunch + exit。
   * `app.exit(0)` 不会触发 'before-quit' 事件，所以原本绑定在那里的清理逻辑都被跳过：
   *   - MCP 子进程会变成孤儿进程残留在系统里
   *   - SQLite 句柄虽然被 OS 回收但跳过了 close 流程
   * 这里手动复刻 before-quit 的行为，保证恢复后的新进程能干净启动。
   */
  function relaunchAfterRestore(): void {
    try { stopAllMcpServers() } catch (e) { console.error('[restore] stopAllMcpServers failed:', e) }
    try { closeDatabase() } catch (e) { console.error('[restore] closeDatabase failed:', e) }
    // 释放单实例锁，避免新实例抢锁失败而闪退
    try { app.releaseSingleInstanceLock() } catch (e) { console.error('[restore] release lock failed:', e) }
    app.relaunch()
    app.exit(0)
  }

  function makeProgressForwarder(event: Electron.IpcMainInvokeEvent) {
    const win = BrowserWindow.fromWebContents(event.sender)
    return (ev: backupService.ProgressEvent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('backup:progress', ev)
      }
    }
  }

  ipcMain.handle('backup:list', () => backupService.listBackups())

  ipcMain.handle('backup:db', (event) => {
    return backupService.backupDatabase(makeProgressForwarder(event))
  })

  ipcMain.handle('backup:full', (event) => {
    return backupService.backupFull(makeProgressForwarder(event))
  })

  ipcMain.handle('backup:cancel', () => backupService.cancelCurrent())

  ipcMain.handle('backup:verify', (_, fileName: string) =>
    backupService.verifyBackup(fileName)
  )

  ipcMain.handle('backup:restore', async (event, fileName: string) => {
    const result = await backupService.restoreFromRecord(fileName, makeProgressForwarder(event))
    // 恢复成功必须 relaunch，否则 services 调 getDatabase() 会在恢复后的 db 上跑 migration+seed 污染数据
    if (result.success) {
      setTimeout(() => {
        try { closeDatabase() } catch {}
        // 释放单实例锁，避免新实例抢锁失败而闪退
        try { app.releaseSingleInstanceLock() } catch {}
        app.relaunch()
        app.exit(0)
      }, 200)
    }
    return result
  })

  ipcMain.handle('backup:restoreFromExternal', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不可用' }
    const picked = await dialog.showOpenDialog(win, {
      title: '选择备份文件',
      filters: [{ name: 'LocalAgent 备份', extensions: ['zip'] }],
      properties: ['openFile']
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }
    const result = await backupService.restoreFromExternal(
      picked.filePaths[0],
      makeProgressForwarder(event)
    )
    if (result.success) {
      setTimeout(() => relaunchAfterRestore(), 200)
    }
    return result
  })

  ipcMain.handle('backup:exportTo', async (event, fileName: string) => {
    // IPC 层只负责弹保存对话框，文件复制委托给 backup service
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不可用' }
    const picked = await dialog.showSaveDialog(win, {
      title: '导出备份',
      defaultPath: fileName,
      filters: [{ name: 'LocalAgent 备份', extensions: ['zip'] }]
    })
    if (picked.canceled || !picked.filePath) {
      return { success: false, error: 'cancelled' }
    }
    const result = backupService.exportBackupTo(fileName, picked.filePath)
    return result.success
      ? { success: true, exportedPath: picked.filePath }
      : { success: false, error: result.error }
  })

  ipcMain.handle('backup:delete', (_, fileName: string) => backupService.deleteBackup(fileName))

  ipcMain.handle('backup:getSettings', () => backupService.getSettings())
  ipcMain.handle(
    'backup:setSettings',
    (_, interval: backupService.BackupSettings['interval'], maxCount: number) => {
      try {
        backupService.setSettings({ interval, maxCount })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e?.message || String(e) }
      }
    }
  )

  // === Window Controls ===
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.on('window:setTitleBarOverlay', (event, options: { color: string; symbolColor: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      try {
        win.setTitleBarOverlay({ color: options.color, symbolColor: options.symbolColor, height: 36 })
      } catch (e) {
        console.error('setTitleBarOverlay error:', e)
      }
    }
  })

  // === Canvas ===
  ipcMain.handle('canvas:listProjects', () => canvasService.listProjects())
  ipcMain.handle('canvas:getProject', (_, id: string) => canvasService.getProject(id))
  ipcMain.handle('canvas:createProject', (_, data) => canvasService.createProject(data))
  ipcMain.handle('canvas:updateProject', (_, id: string, data) => canvasService.updateProject(id, data))
  ipcMain.handle('canvas:deleteProject', (_, id: string) => canvasService.deleteProject(id))
  ipcMain.handle('canvas:listNodes', (_, projectId: string) => canvasService.listNodes(projectId))
  ipcMain.handle('canvas:getNode', (_, id: string) => canvasService.getNode(id))
  ipcMain.handle('canvas:createNode', (_, projectId: string, data) => canvasService.createNode(projectId, data))
  ipcMain.handle('canvas:updateNode', (_, id: string, data) => canvasService.updateNode(id, data))
  ipcMain.handle('canvas:updateNodePositions', (_, updates) => canvasService.updateNodePositions(updates))
  ipcMain.handle('canvas:deleteNode', (_, id: string) => {
    canvasService.deleteEdgesByNodeId(id)
    return canvasService.deleteNode(id)
  })
  ipcMain.handle('canvas:listEdges', (_, projectId: string) => canvasService.listEdges(projectId))
  ipcMain.handle('canvas:createEdge', (_, projectId: string, data) => canvasService.createEdge(projectId, data))
  ipcMain.handle('canvas:deleteEdge', (_, id: string) => canvasService.deleteEdge(id))
  ipcMain.handle('canvas:saveProjectState', (_, projectId: string, nodes) => canvasService.saveProjectState(projectId, nodes))
  ipcMain.handle('canvas:saveNodeImage', (_, projectId: string, nodeId: string, dataUrl: string) =>
    canvasService.saveNodeImage(projectId, nodeId, dataUrl)
  )
  ipcMain.handle('canvas:saveNodeVideo', (_, projectId: string, nodeId: string, sourcePath: string) =>
    canvasService.saveNodeVideo(projectId, nodeId, sourcePath)
  )
  ipcMain.handle('canvas:saveNodeFrames', (_, projectId: string, nodeId: string, frames: Array<{ id: string; dataUrl: string }>) =>
    canvasService.saveNodeFrames(projectId, nodeId, Array.isArray(frames) ? frames : [])
  )
  ipcMain.handle('canvas:listCharacters', (_, projectId: string) => canvasService.listCharacters(projectId))
  ipcMain.handle('canvas:createCharacter', (_, projectId: string, data: any) => canvasService.createCharacter(projectId, data || {}))
  ipcMain.handle('canvas:deleteCharacter', (_, id: string) => canvasService.deleteCharacter(id))
  ipcMain.handle('canvas:cloneCharacters', (_, sourceProjectId: string, targetProjectId: string) =>
    canvasService.cloneCharacters(sourceProjectId, targetProjectId)
  )
  ipcMain.handle('canvas:deleteNodeImage', (_, projectId: string, nodeId: string) =>
    canvasService.deleteNodeImage(projectId, nodeId)
  )

  // v0.6.9+ 打开画布的独立图片文件夹：getProjectImageDir 会保证目录存在（mkdir -p），
  // 因此即使该画布从未生成 / 上传过图片，按钮也能打开一个空目录给用户看路径。
  // 返回 { success, dir, error? } 让 renderer 显示具体反馈。
  ipcMain.handle('canvas:openProjectImageDir', async (_, projectId: string) => {
    if (!projectId) return { success: false, error: '画布 ID 为空' }
    try {
      const { shell } = require('electron')
      const dir = canvasService.getProjectImageDir(projectId)
      const errMsg = await shell.openPath(dir)
      if (errMsg) {
        console.error('[canvas:openProjectImageDir]', dir, '→', errMsg)
        return { success: false, dir, error: errMsg }
      }
      return { success: true, dir }
    } catch (e: any) {
      console.error('[canvas:openProjectImageDir] exception:', e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // 按序导出画布图片：弹选目录对话框 → 把出图节点当前图片按 #N 序号复制为 {类型名}-{NN}.{ext}。
  // 序号与画布节点徽章一致，方便用户在目录里按顺序取用（做视频 / PPT / 交付等）。
  ipcMain.handle('canvas:exportImages', async (event, projectId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不可用' }
    if (!projectId) return { success: false, error: '画布 ID 为空' }

    // 先收集清单：没有可导出的图就别弹对话框，直接提示
    let plan: ReturnType<typeof canvasService.collectProjectImageExports>
    try {
      plan = canvasService.collectProjectImageExports(projectId)
    } catch (e: any) {
      return { success: false, error: e?.message || '读取画布失败' }
    }
    if (!plan.length) {
      return { success: false, error: '该画布没有可导出的生成图片' }
    }

    const picked = await dialog.showOpenDialog(win, {
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (picked.canceled || !picked.filePaths?.[0]) {
      return { success: false, canceled: true }
    }

    try {
      const result = canvasService.exportProjectImagesTo(projectId, picked.filePaths[0])
      return { success: true, dir: picked.filePaths[0], ...result }
    } catch (e: any) {
      return { success: false, error: e?.message || '导出失败' }
    }
  })

  // 流式画布导出：弹保存对话框 → 写 .lacanvas.json 文件
  // 仅 prompt + 节点结构，不打包图片字节，跨设备分享用
  ipcMain.handle('canvas:exportProjects', async (event, ids: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不可用' }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return { success: false, error: '未选中项目' }
    }

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const defaultName = ids.length === 1
      ? `画布-${stamp}.lacanvas.json`
      : `画布-${ids.length}个-${stamp}.lacanvas.json`

    const picked = await dialog.showSaveDialog(win, {
      title: '导出流式画布',
      defaultPath: defaultName,
      filters: [
        { name: 'Local Agent 画布', extensions: ['lacanvas.json', 'json'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    })
    if (picked.canceled || !picked.filePath) {
      return { success: false, canceled: true }
    }

    try {
      const file = canvasService.exportProjects(ids, app.getVersion())
      const { writeFileSync } = require('fs') as typeof import('fs')
      writeFileSync(picked.filePath, JSON.stringify(file, null, 2), 'utf-8')
      return {
        success: true,
        filePath: picked.filePath,
        projectCount: file.projects.length,
      }
    } catch (e: any) {
      return { success: false, error: e?.message || '导出失败' }
    }
  })

  // 流式画布导入：弹打开对话框 → 读 JSON → 在本机生成新项目
  // 永远生成新 UUID + 新标题（带导入后缀），不覆盖已有项目
  ipcMain.handle('canvas:importProjects', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '窗口不可用' }

    const picked = await dialog.showOpenDialog(win, {
      title: '导入流式画布',
      filters: [
        { name: 'Local Agent 画布', extensions: ['lacanvas.json', 'json'] },
        { name: '全部文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    try {
      const { readFileSync } = require('fs') as typeof import('fs')
      const raw = readFileSync(picked.filePaths[0], 'utf-8')
      const parsed = JSON.parse(raw)
      const result = canvasService.importProjects(parsed)
      return { success: true, ...result }
    } catch (e: any) {
      return { success: false, error: e?.message || '导入失败' }
    }
  })

  // === Gallery ===
  ipcMain.handle('gallery:listCategories', () => galleryService.listCategories())
  ipcMain.handle('gallery:getCategory', (_, id: string) => galleryService.getCategory(id))
  ipcMain.handle('gallery:createCategory', (_, data: { name: string; description?: string }) =>
    galleryService.createCategory(data)
  )
  ipcMain.handle('gallery:updateCategory', (_, id: string, data: { name?: string; description?: string }) =>
    galleryService.updateCategory(id, data)
  )
  ipcMain.handle('gallery:deleteCategory', (_, id: string) => galleryService.deleteCategory(id))
  ipcMain.handle('gallery:getCategoryItemCount', (_, categoryId: string) =>
    galleryService.getCategoryItemCount(categoryId)
  )
  ipcMain.handle(
    'gallery:listItemsPaged',
    (_, categoryId: string | null, search: string, page: number, pageSize: number) =>
      galleryService.listItemsPaged(categoryId, search, page, pageSize)
  )
  ipcMain.handle('gallery:getItem', (_, id: string) => galleryService.getItem(id))
  ipcMain.handle('gallery:addFile', (_, categoryId: string, filePath: string) =>
    galleryService.addFile(categoryId, filePath)
  )
  // O4: 工具页保存图片 → 写盘 + 入库
  ipcMain.handle('gallery:addFromDataUri', (_, categoryId: string, dataUri: string, displayName: string) =>
    galleryService.addFromDataUri(categoryId, dataUri, displayName)
  )
  ipcMain.handle(
    'gallery:addFolder',
    (_, categoryId: string, folderPath: string, recursive: boolean) =>
      galleryService.addFolder(categoryId, folderPath, recursive)
  )
  ipcMain.handle('gallery:removeItems', (_, ids: string[]) => galleryService.removeItems(ids))
  ipcMain.handle('gallery:removeByFilePath', (_, filePath: string) =>
    galleryService.removeByFilePath(filePath)
  )
  ipcMain.handle('gallery:sync', (_, categoryId?: string) => galleryService.sync(categoryId))
  ipcMain.handle('gallery:addToCreation', (_, filePath: string) =>
    galleryService.addToCreation(filePath)
  )

  ipcMain.handle('cloudVideo:download', async (event, url: string, defaultName?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return cloudVideoService.downloadRemoteVideo(url, defaultName || '', window)
  })

  ipcMain.handle('videoGen:list', (_, options?: videoGenerationService.VideoGenerationListOptions) =>
    videoGenerationService.listGenerations(options || {})
  )
  ipcMain.handle('videoGen:get', (_, id: string) => videoGenerationService.getGeneration(id))
  ipcMain.handle('videoGen:resolveLocalPath', (_, id: string) => videoGenerationService.resolveLocalAbsolutePath(id))
  ipcMain.handle('videoGen:getDeletedIds', (_, ids: string[]) =>
    videoGenerationService.getDeletedGenerationIds(Array.isArray(ids) ? ids : [])
  )
  ipcMain.handle('videoGen:syncTask', (_, input: videoGenerationService.SyncVideoTaskInput) =>
    videoGenerationService.syncCloudTask(input)
  )
  ipcMain.handle('videoGen:syncTasks', (_, inputs: videoGenerationService.SyncVideoTaskInput[]) =>
    videoGenerationService.syncCloudTasks(Array.isArray(inputs) ? inputs : [])
  )
  ipcMain.handle('videoGen:save', (_, id: string) => videoGenerationService.saveGenerationVideo(id))
  ipcMain.handle('videoGen:runPendingDownloads', (_, limit?: number) =>
    videoGenerationService.runPendingDownloads(limit)
  )
  ipcMain.handle('videoGen:delete', (_, id: string, deleteFile?: boolean) =>
    videoGenerationService.deleteGeneration(id, Boolean(deleteFile))
  )

  // === Cloud Token ===
  ipcMain.handle('cloud:setToken', (_, token: string | null) => setCloudToken(token))
  ipcMain.handle('cloud:getToken', () => getCloudToken())
  ipcMain.handle('cloud:setPermissions', (_, perms: Record<string, any>) => setCloudPermissions(perms))
  ipcMain.handle('cloud:getDeviceId', () => getDeviceId())
  // 账号切换：写账号目录映射；目录变化时主进程运行中热切换（关旧库开新库 + reload 渲染层，不重启进程）。
  // 用未包裹的 electronIpcMain 注册：本 handler 是切换编排本身，bumpEpoch 后需以新代次开库，不能停在旧代次上下文。
  // （renderer 拿到 { switched:true } 即停下当前登录流程，等 reload 后由 init 接管按新账号加载数据）
  electronIpcMain.handle('cloud:setActiveAccount', (_, id: number | string | null) => setActiveAccount(id))

  // === Cloud Models（全量 chat/image/embedding；用于 callLLM/image/embedding 出 body 前反查 cloud_model_id） ===
  // 解决多家服务商提供同名 model_id 时云控端 first() 错位路由的 bug：
  // renderer fetchCloudData 拉到全量模型后通过此 IPC 同步到 main 缓存，
  // main 在请求体里附 cloud_model_id 让后端按主键精确路由。
  ipcMain.handle('cloud:setModels', (_, models: any[]) => {
    setCloudModels(Array.isArray(models) ? models : [])
  })

  // === Cloud Embedding（渲染进程同步云端可用 embedding 模型 + 偏好选择） ===
  ipcMain.handle('cloud:setEmbeddingModels', (_, models: any[]) => {
    setCloudEmbeddingModels(Array.isArray(models) ? models : [])
  })
  ipcMain.handle('cloud:setPreferredEmbeddingModel', (_, modelId: string) => {
    setPreferredCloudEmbeddingModel(modelId || '')
  })
  ipcMain.handle('cloud:getEmbeddingState', () => ({
    models: getCloudEmbeddingModels(),
    preferred: getPreferredCloudEmbeddingModel(),
    active: getActiveCloudEmbeddingModelId(),
    allowCustomEmbedding: getAllowCustomEmbedding(),
  }))

  // === Cloud Inspiration（桌面端用户上传创作到灵感广场） ===
  // 渲染端传入的 resultPath 由主进程拼接数据目录并读字节，避免渲染端直读文件系统
  ipcMain.handle('cloudInspiration:upload', (_, params: {
    resultPath: string
    title: string
    categoryId: number
    promptLang: 'cn' | 'en'
    promptText: string
    refImages?: string[]
    generationSize?: string
  }) => uploadInspirationToCloud(params))

  // === AI 抠图（v0.6.9+，阿里 viapi SegmentHDCommonImage）===
  // 自定义模式（provider 管理）：本地存 AK/SK，直连阿里
  ipcMain.handle('matting:listProviders', () => mattingProviderService.listProviders())
  ipcMain.handle('matting:getProvider', (_, id: string) => {
    const p = mattingProviderService.getProvider(id)
    if (!p) return null
    // 返回 masked 摘要，不暴露密文
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      access_key_id_masked: p.access_key_id ? (p.access_key_id.slice(0, 4) + '****' + p.access_key_id.slice(-4)) : '',
      endpoint: p.endpoint,
      region_id: p.region_id,
      is_default: !!p.is_default,
      remark: p.remark,
      last_test_at: p.last_test_at,
      last_test_status: p.last_test_status,
      last_test_message: p.last_test_message,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }
  })
  ipcMain.handle('matting:createProvider', (_, data: mattingProviderService.CreateProviderInput) =>
    mattingProviderService.createProvider(data),
  )
  ipcMain.handle('matting:updateProvider', (_, id: string, data: mattingProviderService.UpdateProviderInput) =>
    mattingProviderService.updateProvider(id, data),
  )
  ipcMain.handle('matting:deleteProvider', (_, id: string) =>
    mattingProviderService.deleteProvider(id),
  )

  // 测试 provider 凭证：上传一张本地图（renderer 提供绝对路径）跑通端到端
  ipcMain.handle('matting:testProvider', (_, providerId: string, testImagePath: string) =>
    mattingService.testProvider(providerId, testImagePath),
  )

  // 核心：抠图调用（输入 + 模式）。同步阻塞最长 90s，进度通过 'matting:progress' 事件推送
  ipcMain.handle('matting:segment', (_, input: mattingService.SegmentInput) =>
    mattingService.segment(input),
  )

  // 任务历史（本地 matting_tasks 表）
  ipcMain.handle('matting:listTasks', (_, limit?: number, offset?: number) =>
    mattingService.listTasks(limit ?? 50, offset ?? 0),
  )
  ipcMain.handle('matting:getTask', (_, id: string) => mattingService.getTask(id))
  ipcMain.handle('matting:deleteTask', (_, id: string) => mattingService.deleteTask(id))

  // 拉云控端配额状态（剩余张数 / 单次扣费）。用于桌面端 MattingView 顶部 banner 展示
  ipcMain.handle('matting:fetchCloudQuota', () => fetchMattingQuotaFromCloud())

  // === 精细抠图（抠抠图 koukoutu，仅云端中转，按尺寸三档计费）===
  ipcMain.handle('fineMatting:segment', (_, input: fineMattingService.SegmentInput) =>
    fineMattingService.segment(input),
  )
  ipcMain.handle('fineMatting:listTasks', (_, limit?: number, offset?: number) =>
    fineMattingService.listTasks(limit ?? 50, offset ?? 0),
  )
  ipcMain.handle('fineMatting:getTask', (_, id: string) => fineMattingService.getTask(id))
  ipcMain.handle('fineMatting:deleteTask', (_, id: string) => fineMattingService.deleteTask(id))
  // 拉云控端精细抠图配额 + 三档价 + 阈值。用于桌面端 FineMattingView 顶部 banner + 按尺寸预估
  ipcMain.handle('fineMatting:fetchCloudQuota', () => fetchFineMattingQuotaFromCloud())
}
