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
    canvas: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    gallery: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    creativeTemplate: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    matting: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      /**
       * 抠图任务进度回调；payload = { taskId, phase: 'uploading'|'processing'|'downloading'|'done', message? }
       * 返回 unsubscribe 函数，多视图共用此信道时可安全 off 自己的监听器。
       */
      onProgress: (
        callback: (data: {
          taskId: string
          phase: 'uploading' | 'processing' | 'downloading' | 'done'
          message?: string
        }) => void,
      ) => () => void
    }
    model: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    persona: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    knowledge: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    bot: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }
    chat: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      onStream: (callback: (data: unknown) => void) => () => void
      offStream: () => void
      onTitleUpdated: (callback: (data: unknown) => void) => void
      offTitleUpdated: () => void
      onToolApproval: (callback: (data: unknown) => void) => void
      offToolApproval: () => void
      onAppendMessage: (callback: (data: unknown) => void) => void
      offAppendMessage: () => void
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
      onTokenUpdated: (callback: (data: { token: string }) => void) => () => void
      onAuthExpired: (callback: (data: { reason?: string }) => void) => () => void
      setPermissions: (perms: Record<string, any>) => Promise<void>
      getDeviceId: () => Promise<string>
      setEmbeddingModels: (models: Array<{ id: number; model_id: string; name: string }>) => Promise<void>
      setModels: (
        models: Array<{
          id: number
          model_id: string
          name: string
          type: string
          provider_name: string
          provider_type?: string
        }>,
      ) => Promise<void>
      setPreferredEmbeddingModel: (modelId: string) => Promise<void>
      getEmbeddingState: () => Promise<{
        models: Array<{ id: number; model_id: string; name: string }>
        preferred: string
        active: string
        allowCustomEmbedding: boolean
      }>
      uploadInspiration: (params: {
        resultPath: string
        title: string
        categoryId: number
        promptLang: 'cn' | 'en'
        promptText: string
        refImages?: string[]
        generationSize?: string
      }) => Promise<{
        ok: boolean
        error?: string
        data?: any
        compressed?: boolean
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
      onDownloaded: (cb: (data: { manualInstall?: boolean }) => void) => void
      onError: (cb: (msg: string) => void) => void
      offAll: () => void
    }
    backup: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      onProgress: (
        callback: (data: {
          phase: 'snapshot' | 'pack' | 'verify' | 'extract' | 'apply'
          current: number
          total: number
          fileName: string
          bytes?: number
        }) => void
      ) => void
      offProgress: () => void
    }
    dialog: { openFile: (options?: unknown) => Promise<unknown> }
    shell: {
      openPath: (path: string) => Promise<string>
      showItemInFolder: (path: string) => Promise<{ success: boolean; path?: string; fallback?: string; error?: string }>
      openExternal: (url: string) => Promise<unknown>
    }
    window: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
