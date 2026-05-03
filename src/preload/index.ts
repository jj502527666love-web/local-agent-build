import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
    onStream: (callback: (data: unknown) => void) =>
      ipcRenderer.on('chat:stream', (_event, data) => callback(data)),
    offStream: () => ipcRenderer.removeAllListeners('chat:stream'),
    onTitleUpdated: (callback: (data: unknown) => void) =>
      ipcRenderer.on('chat:titleUpdated', (_event, data) => callback(data)),
    offTitleUpdated: () => ipcRenderer.removeAllListeners('chat:titleUpdated'),
    onToolApproval: (callback: (data: unknown) => void) =>
      ipcRenderer.on('chat:toolApproval', (_event, data) => callback(data)),
    offToolApproval: () => ipcRenderer.removeAllListeners('chat:toolApproval')
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
    onProgress: (callback: (data: unknown) => void) =>
      ipcRenderer.on('imageGen:progress', (_event, data) => callback(data)),
    offProgress: () => ipcRenderer.removeAllListeners('imageGen:progress')
  },
  canvas: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(`canvas:${channel}`, ...args)
  },
  cloud: {
    setToken: (token: string | null) => ipcRenderer.invoke('cloud:setToken', token),
    getToken: () => ipcRenderer.invoke('cloud:getToken'),
    setPermissions: (perms: Record<string, any>) => ipcRenderer.invoke('cloud:setPermissions', perms),
    getDeviceId: () => ipcRenderer.invoke('cloud:getDeviceId') as Promise<string>
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
    onDownloaded: (cb: () => void) =>
      ipcRenderer.on('updater:downloaded', () => cb()),
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
    onProgress: (callback: (data: { current: number; total: number; fileName: string }) => void) =>
      ipcRenderer.on('backup:progress', (_, data) => callback(data)),
    offProgress: () => ipcRenderer.removeAllListeners('backup:progress')
  },
  dataDir: {
    get: () => ipcRenderer.invoke('dataDir:get'),
    isFirstLaunch: () => ipcRenderer.invoke('dataDir:isFirstLaunch'),
    init: (dir?: string) => ipcRenderer.invoke('dataDir:init', dir),
    set: (dir: string) => ipcRenderer.invoke('dataDir:set', dir),
    pick: () => ipcRenderer.invoke('dataDir:pick')
  },
  migration: {
    check: () => ipcRenderer.invoke('migration:check'),
    start: () => ipcRenderer.invoke('migration:start'),
    deleteOld: () => ipcRenderer.invoke('migration:deleteOld'),
    skip: () => ipcRenderer.invoke('migration:skip'),
    onProgress: (cb: (data: { current: number; total: number; fileName: string }) => void) => {
      ipcRenderer.on('migration:progress', (_, data) => cb(data))
    },
    offProgress: () => ipcRenderer.removeAllListeners('migration:progress')
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
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
