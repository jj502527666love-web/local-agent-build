import { ipcMain, BrowserWindow, dialog, clipboard, nativeImage, app } from 'electron'
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
import { sendMessage, cancelChat, isChatActive, respondToolApproval } from '../services/chat-engine'
import { callLLM } from '../services/llm'
import { skillPresets } from '../services/skill-presets'
import { executeSkillSandbox } from '../services/skill-sandbox'
import * as vectorizeService from '../services/vectorize'
import * as vectorStoreService from '../services/vector-store'
import * as promptSkillService from '../services/prompt-skill'
import * as imageSessionService from '../services/image-session'
import * as imageGenService from '../services/image-generation'
import * as inspirationService from '../services/inspiration'
import * as promptPresetService from '../services/prompt-preset'
import * as backupService from '../services/backup'
import * as canvasService from '../services/canvas'
import * as galleryService from '../services/gallery'
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
} from '../services/cloud-token'
import { getDeviceId } from '../services/device-id'
import { uploadInspiration as uploadInspirationToCloud } from '../services/cloud-inspiration'

export function registerIpcHandlers(): void {
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
  ipcMain.handle('bot:delete', (_, id: string) => botService.deleteBot(id))

  // === Conversations ===
  ipcMain.handle('chat:listConversations', (_, botId: string) =>
    conversationService.listConversations(botId)
  )
  ipcMain.handle('chat:getConversation', (_, id: string) =>
    conversationService.getConversation(id)
  )
  ipcMain.handle('chat:createConversation', (_, botId: string, title?: string) =>
    conversationService.createConversation(botId, title)
  )
  ipcMain.handle('chat:updateTitle', (_, id: string, title: string) =>
    conversationService.updateConversationTitle(id, title)
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
  ipcMain.handle('chat:cancel', (_, conversationId: string) => cancelChat(conversationId))
  ipcMain.handle('chat:isActive', (_, conversationId: string) => isChatActive(conversationId))
  ipcMain.handle('chat:respondToolApproval', (_, requestId: string, approved: boolean) =>
    respondToolApproval(requestId, approved)
  )

  // === File Reading ===
  ipcMain.handle('chat:readFileBase64', async (_, filePath: string) => {
    const { readFileSync } = require('fs')
    return readFileSync(filePath).toString('base64')
  })
  ipcMain.handle('chat:readFileText', async (_, filePath: string) => {
    const { readFileSync } = require('fs')
    return readFileSync(filePath, 'utf-8')
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
  ipcMain.handle('skill:import', (_, dataArr: any[]) => {
    const results: any[] = []
    for (const data of dataArr) {
      results.push(skillService.createSkill({
        name: data.name,
        description: data.description || '',
        function_def: data.function_def || {},
        implementation: data.implementation || '',
        version: data.version || '1.0.0'
      }))
    }
    return results
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
    app.relaunch()
    app.exit(0)
  })

  // === Settings ===
  ipcMain.handle('settings:get', (_, key: string) => settingsService.getSetting(key))
  ipcMain.handle('settings:set', (_, key: string, value: string) =>
    settingsService.setSetting(key, value)
  )
  ipcMain.handle('settings:getAll', () => settingsService.getAllSettings())

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
  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(options)
    return result
  })

  // === Shell ===
  ipcMain.handle('shell:openPath', async (_, path: string) => {
    const { shell } = require('electron')
    return shell.openPath(path)
  })
  ipcMain.handle('shell:showItemInFolder', (_, path: string) => {
    const { shell } = require('electron')
    // 如果是相对路径（不以盘符或 / 开头），拼接数据目录
    if (path && !/^[A-Za-z]:|^\//.test(path)) {
      path = require('path').join(dataPathService.getDataDir(), path)
    }
    shell.showItemInFolder(path)
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

  ipcMain.handle('imageGen:getGeneration', (_, id: string) =>
    imageGenService.getGeneration(id)
  )
  ipcMain.handle('imageGen:saveEditedImage', (_, id: string, base64Data: string) =>
    imageGenService.saveEditedImage(id, base64Data)
  )
  ipcMain.handle('imageGen:getAbsolutePath', (_, relPath: string) =>
    imageGenService.getAbsolutePath(relPath)
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
  ipcMain.handle('imageGen:getInspirationConfig', () =>
    inspirationService.getInspirationConfig()
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
  ipcMain.handle('canvas:deleteNodeImage', (_, projectId: string, nodeId: string) =>
    canvasService.deleteNodeImage(projectId, nodeId)
  )

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

  // === Cloud Token ===
  ipcMain.handle('cloud:setToken', (_, token: string | null) => setCloudToken(token))
  ipcMain.handle('cloud:getToken', () => getCloudToken())
  ipcMain.handle('cloud:setPermissions', (_, perms: Record<string, any>) => setCloudPermissions(perms))
  ipcMain.handle('cloud:getDeviceId', () => getDeviceId())

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
  }) => uploadInspirationToCloud(params))
}
