import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { getRuntimeConfig } from '../main/services/runtime-config'

const api = {
  db: {
    query: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`db:${channel}`, ...args)
  },
  model: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`model:${channel}`, ...args)
  },
  persona: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`persona:${channel}`, ...args)
  },
  knowledge: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`knowledge:${channel}`, ...args)
  },
  bot: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`bot:${channel}`, ...args)
  },
  chat: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`chat:${channel}`, ...args),
    onStream: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('chat:stream', handler)
      return () => ipcRenderer.off('chat:stream', handler)
    },
    offStream: () => ipcRenderer.removeAllListeners('chat:stream'),
    onTitleUpdated: (callback: (data: unknown) => void) =>
      ipcRenderer.on('chat:titleUpdated', (_event, data) => callback(data)),
    offTitleUpdated: () => ipcRenderer.removeAllListeners('chat:titleUpdated'),
    onToolApproval: (callback: (data: unknown) => void) =>
      ipcRenderer.on('chat:toolApproval', (_event, data) => callback(data)),
    offToolApproval: () => ipcRenderer.removeAllListeners('chat:toolApproval'),
    /**
     * 异步追加消息事件：image_gen fire-and-forget 完成后由主进程发出，
     * payload: { conversationId, message }。renderer 端 chat store 监听后
     * 把 message push 到 messages.value（仅当 currentConversationId 匹配）。
     */
    onAppendMessage: (callback: (data: unknown) => void) =>
      ipcRenderer.on('chat:appendMessage', (_event, data) => callback(data)),
    offAppendMessage: () => ipcRenderer.removeAllListeners('chat:appendMessage')
  },
  skill: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`skill:${channel}`, ...args)
  },
  mcp: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`mcp:${channel}`, ...args)
  },
  promptSkill: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`promptSkill:${channel}`, ...args)
  },
  settings: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`settings:${channel}`, ...args)
  },
  llm: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`llm:${channel}`, ...args)
  },
  vectorize: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`vectorize:${channel}`, ...args),
    checkModelMismatch: () => ipcRenderer.invoke('vectorize:checkModelMismatch'),
    reembedAll: () => ipcRenderer.invoke('vectorize:reembedAll'),
    onProgress: (callback: (data: unknown) => void) =>
      ipcRenderer.on('vectorize:progress', (_event, data) => callback(data)),
    offProgress: () => ipcRenderer.removeAllListeners('vectorize:progress')
  },
  usage: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`usage:${channel}`, ...args)
  },
  promptPreset: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`promptPreset:${channel}`, ...args)
  },
  imageGen: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`imageGen:${channel}`, ...args),
    /**
     * 注册 progress 回调，返回 unsubscribe 函数。
     * 多视图（ImageGenView / BatchGenView / ImageEditView）共用此信道时，
     * 调用 unsubscribe 只移除自己的监听器，不影响其他视图。
     */
    onProgress: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('imageGen:progress', handler)
      return () => ipcRenderer.off('imageGen:progress', handler)
    },
    /** @deprecated 改用 onProgress 返回的 unsubscribe，避免误清其他视图的监听 */
    offProgress: () => ipcRenderer.removeAllListeners('imageGen:progress')
  },
  canvas: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`canvas:${channel}`, ...args)
  },
  gallery: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`gallery:${channel}`, ...args)
  },
  matting: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`matting:${channel}`, ...args),
    /**
     * 注册抠图任务进度回调；payload = { taskId, phase: 'uploading'|'processing'|'downloading'|'done', message? }
     * 返回 unsubscribe 函数，多视图共用此信道时可安全 off 自己的监听器。
     */
    onProgress: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('matting:progress', handler)
      return () => ipcRenderer.off('matting:progress', handler)
    },
  },
  cloud: {
    setToken: (token: string | null) => ipcRenderer.invoke('cloud:setToken', token),
    getToken: () => ipcRenderer.invoke('cloud:getToken'),
    onTokenUpdated: (callback: (data: { token: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { token: string }) => callback(data)
      ipcRenderer.on('cloud:tokenUpdated', handler)
      return () => ipcRenderer.off('cloud:tokenUpdated', handler)
    },
    onAuthExpired: (callback: (data: { reason?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { reason?: string }) => callback(data)
      ipcRenderer.on('cloud:authExpired', handler)
      return () => ipcRenderer.off('cloud:authExpired', handler)
    },
    setPermissions: (perms: Record<string, any>) => ipcRenderer.invoke('cloud:setPermissions', perms),
    getDeviceId: () => ipcRenderer.invoke('cloud:getDeviceId') as Promise<string>,
    setEmbeddingModels: (models: Array<{ id: number; model_id: string; name: string }>) =>
      ipcRenderer.invoke('cloud:setEmbeddingModels', models),
    // 同步全量云端模型（含 chat/image/embedding）到主进程，发起请求前用于反查 cloud_model_id
    // 精确路由到具体服务商，解决多家提供同 model_id 时云控端错位扣费的 bug
    setModels: (
      models: Array<{
        id: number
        model_id: string
        name: string
        type: string
        provider_name: string
        provider_type?: string
      }>,
    ) => ipcRenderer.invoke('cloud:setModels', models),
    setPreferredEmbeddingModel: (modelId: string) =>
      ipcRenderer.invoke('cloud:setPreferredEmbeddingModel', modelId),
    getEmbeddingState: () => ipcRenderer.invoke('cloud:getEmbeddingState') as Promise<{
      models: Array<{ id: number; model_id: string; name: string }>
      preferred: string
      active: string
      allowCustomEmbedding: boolean
    }>,
    // 上传创作到云端灵感广场（主进程读文件字节 + multipart 上传）
    uploadInspiration: (params: {
      resultPath: string
      title: string
      categoryId: number
      promptLang: 'cn' | 'en'
      promptText: string
    }) => ipcRenderer.invoke('cloudInspiration:upload', params) as Promise<{
      ok: boolean
      error?: string
      data?: any
      /** 原图过大触发自动 JPEG 压缩后上传时为 true，前端可据此提示用户 */
      compressed?: boolean
    }>
  },
  clipboard: {
    writeImage: (filePath: string) => ipcRenderer.invoke('clipboard:writeImage', filePath)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    onAvailable: (cb: (data: { version: string; releaseNotes?: string }) => void) =>
      ipcRenderer.on('updater:available', (_, data) => cb(data)),
    onNotAvailable: (cb: () => void) =>
      ipcRenderer.on('updater:not-available', () => cb()),
    onProgress: (cb: (data: { percent: number; transferred: number; total: number }) => void) =>
      ipcRenderer.on('updater:progress', (_, data) => cb(data)),
    onDownloaded: (cb: (data: { manualInstall?: boolean }) => void) =>
      ipcRenderer.on('updater:downloaded', (_, data) => cb(data || {})),
    onError: (cb: (msg: string) => void) =>
      ipcRenderer.on('updater:error', (_, msg) => cb(msg)),
    offAll: () => {
      ipcRenderer.removeAllListeners('updater:available')
      ipcRenderer.removeAllListeners('updater:not-available')
      ipcRenderer.removeAllListeners('updater:progress')
      ipcRenderer.removeAllListeners('updater:downloaded')
      ipcRenderer.removeAllListeners('updater:error')
    }
  },
  backup: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`backup:${channel}`, ...args),
    onProgress: (
      callback: (data: {
        phase: 'snapshot' | 'pack' | 'verify' | 'extract' | 'apply'
        current: number
        total: number
        fileName: string
        bytes?: number
      }) => void
    ) => ipcRenderer.on('backup:progress', (_, data) => callback(data)),
    offProgress: () => ipcRenderer.removeAllListeners('backup:progress')
  },
  dataDir: {
    get: () => ipcRenderer.invoke('dataDir:get'),
    isFirstLaunch: () => ipcRenderer.invoke('dataDir:isFirstLaunch'),
    isActivated: () => ipcRenderer.invoke('dataDir:isActivated'),
    init: (dir?: string) => ipcRenderer.invoke('dataDir:init', dir),
    set: (dir: string) => ipcRenderer.invoke('dataDir:set', dir),
    pick: () => ipcRenderer.invoke('dataDir:pick')
  },
  migration: {
    check: () => ipcRenderer.invoke('migration:check'),
    start: (options?: { conflictStrategy?: 'keep-existing' | 'overwrite' }) =>
      ipcRenderer.invoke('migration:start', options),
    deleteOld: () => ipcRenderer.invoke('migration:deleteOld'),
    skip: () => ipcRenderer.invoke('migration:skip'),
    abandon: () => ipcRenderer.invoke('migration:abandon'),
    onProgress: (cb: (data: { current: number; total: number; fileName: string }) => void) => {
      ipcRenderer.on('migration:progress', (_, data) => cb(data))
    },
    offProgress: () => ipcRenderer.removeAllListeners('migration:progress')
  },
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch')
  },
  dialog: {
    openFile: (options?: unknown) => ipcRenderer.invoke('dialog:openFile', options)
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    setTitleBarOverlay: (options: { color: string; symbolColor: string }) =>
      ipcRenderer.send('window:setTitleBarOverlay', options)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('runtimeConfig', getRuntimeConfig())
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.runtimeConfig = getRuntimeConfig()
}
