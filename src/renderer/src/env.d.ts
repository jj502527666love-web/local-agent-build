/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electron: typeof import('@electron-toolkit/preload').electronAPI
  api: {
    db: { query: (channel: string, ...args: unknown[]) => Promise<unknown> }
    model: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    persona: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    knowledge: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    bot: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    chat: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      onStream: (callback: (data: unknown) => void) => void
      offStream: () => void
      onTitleUpdated: (callback: (data: unknown) => void) => void
      offTitleUpdated: () => void
      onToolApproval: (callback: (data: unknown) => void) => void
      offToolApproval: () => void
    }
    skill: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    mcp: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    promptSkill: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    settings: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    llm: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    usage: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    imageGen: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      onProgress: (callback: (data: unknown) => void) => void
      offProgress: () => void
    }
    vectorize: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      checkModelMismatch: () => Promise<{
        mismatch: boolean
        reason: 'empty' | 'multiple_models' | 'model_changed' | 'config_error' | 'consistent'
        current?: { model: string; source: 'cloud' | 'local' }
        legacy?: Array<{ model: string; dim: number; source: string; chunk_count: number }>
        totalChunks: number
      }>
      reembedAll: () => Promise<{ processed: number; failed: number }>
      onProgress: (callback: (data: unknown) => void) => void
      offProgress: () => void
    }
    cloud: {
      setToken: (token: string | null) => Promise<void>
      getToken: () => Promise<string | null>
      setPermissions: (perms: Record<string, any>) => Promise<void>
      getDeviceId: () => Promise<string>
      setEmbeddingModels: (models: Array<{ id: number; model_id: string; name: string }>) => Promise<void>
      setPreferredEmbeddingModel: (modelId: string) => Promise<void>
      getEmbeddingState: () => Promise<{
        models: Array<{ id: number; model_id: string; name: string }>
        preferred: string
        active: string
        allowCustomEmbedding: boolean
      }>
    }
    clipboard: {
      writeImage: (filePath: string) => Promise<{ success: boolean; error?: string }>
    }
    updater: {
      check: () => Promise<{ currentVersion?: string; latestVersion?: string; error?: string }>
      download: () => Promise<void>
      install: () => Promise<void>
      getVersion: () => Promise<string>
      onAvailable: (cb: (data: { version: string; releaseNotes?: string }) => void) => void
      onNotAvailable: (cb: () => void) => void
      onProgress: (cb: (data: { percent: number; transferred: number; total: number }) => void) => void
      onDownloaded: (cb: () => void) => void
      onError: (cb: (msg: string) => void) => void
      offAll: () => void
    }
    backup: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      onProgress: (callback: (data: { current: number; total: number; fileName: string }) => void) => void
      offProgress: () => void
    }
    dialog: { openFile: (options?: unknown) => Promise<unknown> }
    shell: {
      openPath: (path: string) => Promise<unknown>
      showItemInFolder: (path: string) => Promise<unknown>
    }
    window: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
