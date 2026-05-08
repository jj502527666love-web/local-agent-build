import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translateError } from '@/utils/error-message'

// 说明：gen.error 始终保留后端返回的原文，友好翻译由展示层现场调用 translateError，
// 这样详情弹窗总是能拿到英文原文，不会出现 HMR / 新旧数据结构不一致导致原文丢失的问题。

export interface ImageGeneration {
  id: string
  session_id: string
  prompt: string
  revised_prompt: string
  ref_images: string[]
  model_provider_id: string
  model_id: string
  size: string
  quality: string
  result_path: string
  result_url: string
  status: string
  /** 后端原文错误。展示时在 UI 层调 translateError 转换为友好文案 */
  error: string
  created_at: string
}

export interface GenerateOptions {
  prompt: string
  refImages?: string[]
  modelProviderId: string
  modelId: string
  size: string
  tierId?: string
  quality?: string
  batchCount?: number
  concurrency?: number
}

export interface QueueItem {
  id: number
  options: GenerateOptions
  /** 队列中摘要显示用 */
  label: string
}

const api = () => (window as any).api

/**
 * 分页策略：
 *  - items：当前页持久化数据，通过 listAllGenerations 按页拉取（仅 status=done）
 *  - inFlight：generating/error 状态的临时项，跨页始终置顶展示，不计入 total
 *  - completed 事件触发时：把 item 从 inFlight 移除；如果 currentPage === 1 再 prepend
 *    到 items 顶部并裁到 pageSize；非首页只更新 total，待用户切回首页自然刷新
 */
export const useImageGenStore = defineStore('imageGen', () => {
  /** 当前页数据（仅包含 status=done） */
  const items = ref<ImageGeneration[]>([])
  /** 正在生成中 / 失败的临时项，展示时永远置顶 */
  const inFlight = ref<ImageGeneration[]>([])
  const currentPage = ref(1)
  const pageSize = ref(25)
  const total = ref(0)
  const loading = ref(false)

  const generating = ref(false)
  /** 防竞态计数器：每次 _runOne() 递增，finally 只在计数匹配时重置 generating */
  let _genCount = 0
  const progress = ref<{ total: number; completed: number; type: string } | null>(null)
  const lastError = ref('')

  /** 任务队列 */
  const queue = ref<QueueItem[]>([])
  let _queueIdSeq = 0
  let _processing = false

  /** 展示列表：inFlight 置顶 + items 分页数据 */
  const displayList = computed<ImageGeneration[]>(() => [...inFlight.value, ...items.value])
  /** 兼容旧消费者：等价于 displayList，供仍在读 store.generations 的代码使用 */
  const generations = computed<ImageGeneration[]>(() => displayList.value)

  async function fetchPage(page = 1, size = pageSize.value) {
    loading.value = true
    try {
      const result = await api().imageGen.invoke('listAllGenerations', page, size) as {
        items: ImageGeneration[]
        total: number
      }
      items.value = result.items || []
      total.value = result.total || 0
      currentPage.value = page
      pageSize.value = size
    } finally {
      loading.value = false
    }
  }

  /** 将任务加入队列，若当前无任务在跑则立即开始 */
  function enqueue(options: GenerateOptions) {
    const label = options.prompt.slice(0, 30) + (options.prompt.length > 30 ? '...' : '')
    queue.value.push({ id: ++_queueIdSeq, options, label })
    _scheduleNext()
  }

  function removeFromQueue(queueId: number) {
    queue.value = queue.value.filter(q => q.id !== queueId)
  }

  function clearQueue() {
    queue.value = []
  }

  async function _scheduleNext() {
    if (_processing) return
    const next = queue.value.shift()
    if (!next) return
    _processing = true
    await _runOne(next.options)
    _processing = false
    // 继续处理队列中的下一个
    _scheduleNext()
  }

  async function _runOne(options: GenerateOptions) {
    generating.value = true
    const myGen = ++_genCount
    lastError.value = ''
    progress.value = { total: options.batchCount || 1, completed: 0, type: 'start' }
    try {
      const results = await api().imageGen.invoke('generate', JSON.parse(JSON.stringify(options))) as ImageGeneration[]
      return results || []
    } catch (e: any) {
      lastError.value = translateError(e.message || '')
      return []
    } finally {
      if (_genCount === myGen) {
        generating.value = false
        progress.value = null
      }
    }
  }

  /** 兼容旧接口：等价于 enqueue，但返回 Promise 以兼容老调用方 */
  async function generate(options: GenerateOptions) {
    enqueue(options)
  }

  async function deleteGeneration(id: string) {
    await api().imageGen.invoke('deleteGeneration', id)
    const wasInItems = items.value.some(g => g.id === id)
    items.value = items.value.filter(g => g.id !== id)
    inFlight.value = inFlight.value.filter(g => g.id !== id)
    if (wasInItems) total.value = Math.max(0, total.value - 1)
  }

  async function deleteGenerations(ids: string[]) {
    await api().imageGen.invoke('deleteGenerations', JSON.parse(JSON.stringify(ids)))
    const idSet = new Set(ids)
    const before = items.value.length
    items.value = items.value.filter(g => !idSet.has(g.id))
    inFlight.value = inFlight.value.filter(g => !idSet.has(g.id))
    const removed = before - items.value.length
    if (removed > 0) total.value = Math.max(0, total.value - removed)
  }

  function mergeCompleted(gen: ImageGeneration) {
    // 从 inFlight 移除
    inFlight.value = inFlight.value.filter(g => g.id !== gen.id)
    if (currentPage.value === 1) {
      const idx = items.value.findIndex(g => g.id === gen.id)
      if (idx >= 0) {
        items.value[idx] = gen
      } else {
        items.value = [gen, ...items.value]
        if (items.value.length > pageSize.value) {
          items.value = items.value.slice(0, pageSize.value)
        }
        total.value += 1
      }
    } else {
      // 非首页不改动 items，让用户切回首页时 fetchPage 自然看到新数据
      total.value += 1
    }
  }

  function listenProgress() {
    api().imageGen.onProgress((data: any) => {
      if (data.type === 'done') {
        // generating 状态由 generate() 的 finally 统一管理，此处不再重置
        // 仅清理 progress 展示
        progress.value = null
      } else {
        progress.value = { total: data.total, completed: data.completed, type: data.type }
      }
      if (data.type === 'generating' && data.genId) {
        const existsInFlight = inFlight.value.find(g => g.id === data.genId)
        const existsInItems = items.value.find(g => g.id === data.genId)
        if (!existsInFlight && !existsInItems) {
          inFlight.value.unshift({
            id: data.genId,
            session_id: '',
            prompt: '',
            revised_prompt: '',
            ref_images: [],
            model_provider_id: '',
            model_id: '',
            size: '',
            quality: '',
            result_path: '',
            result_url: '',
            status: 'generating',
            error: '',
            created_at: new Date().toISOString()
          })
        } else if (existsInFlight) {
          existsInFlight.status = 'generating'
        } else if (existsInItems) {
          existsInItems.status = 'generating'
        }
      }
      if (data.type === 'completed' && data.generation) {
        mergeCompleted(data.generation)
      }
      if (data.type === 'error' && data.genId) {
        // 失败项保留在 inFlight 中（状态标为 error），置顶提醒用户；
        // 数据库里的记录由后端写入，用户点"清理失败"时再走 IPC 一并清除
        const gen = inFlight.value.find(g => g.id === data.genId)
        if (gen) {
          gen.status = 'error'
          gen.error = data.error || ''
        } else {
          // 保险分支：此前 generating 事件丢失或已被合并走 completed，直接补一条
          inFlight.value.unshift({
            id: data.genId,
            session_id: '',
            prompt: '',
            revised_prompt: '',
            ref_images: [],
            model_provider_id: '',
            model_id: '',
            size: '',
            quality: '',
            result_path: '',
            result_url: '',
            status: 'error',
            error: data.error || '',
            created_at: new Date().toISOString()
          })
        }
      }
    })
  }

  function stopListenProgress() {
    api().imageGen.offProgress()
  }

  return {
    // 新消费者优先使用
    items,
    inFlight,
    displayList,
    currentPage,
    pageSize,
    total,
    loading,
    // 兼容旧消费者
    generations,
    generating,
    progress,
    lastError,
    queue,
    // methods
    fetchPage,
    generate,
    enqueue,
    removeFromQueue,
    clearQueue,
    deleteGeneration,
    deleteGenerations,
    listenProgress,
    stopListenProgress
  }
})
