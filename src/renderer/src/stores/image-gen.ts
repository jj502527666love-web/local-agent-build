import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  error: string
  created_at: string
}

const api = () => (window as any).api

export const useImageGenStore = defineStore('imageGen', () => {
  const generations = ref<ImageGeneration[]>([])
  const generating = ref(false)
  const progress = ref<{ total: number; completed: number; type: string } | null>(null)

  async function fetchGenerations() {
    generations.value = await api().imageGen.invoke('listRecentGenerations', 200)
  }

  async function generate(options: {
    prompt: string
    refImages?: string[]
    modelProviderId: string
    modelId: string
    size: string
    quality?: string
    batchCount?: number
  }) {
    generating.value = true
    progress.value = { total: options.batchCount || 1, completed: 0, type: 'start' }
    try {
      await api().imageGen.invoke('generate', JSON.parse(JSON.stringify(options)))
      await fetchGenerations()
    } finally {
      generating.value = false
      progress.value = null
    }
  }

  async function deleteGeneration(id: string) {
    await api().imageGen.invoke('deleteGeneration', id)
    generations.value = generations.value.filter((g) => g.id !== id)
  }

  async function deleteGenerations(ids: string[]) {
    await api().imageGen.invoke('deleteGenerations', JSON.parse(JSON.stringify(ids)))
    const idSet = new Set(ids)
    generations.value = generations.value.filter((g) => !idSet.has(g.id))
  }

  function listenProgress() {
    api().imageGen.onProgress((data: any) => {
      if (data.type === 'done') {
        generating.value = false
        progress.value = null
      } else {
        progress.value = { total: data.total, completed: data.completed, type: data.type }
      }
      if (data.type === 'generating' && data.genId) {
        const exists = generations.value.find((g) => g.id === data.genId)
        if (!exists) {
          generations.value.push({
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
        } else {
          exists.status = 'generating'
        }
      }
      if (data.type === 'completed' && data.generation) {
        const exists = generations.value.find((g) => g.id === data.generation.id)
        if (!exists) {
          generations.value.push(data.generation)
        } else {
          Object.assign(exists, data.generation)
        }
      }
      if (data.type === 'error' && data.genId) {
        const gen = generations.value.find((g) => g.id === data.genId)
        if (gen) {
          gen.status = 'error'
          gen.error = data.error || ''
        }
      }
    })
  }

  function stopListenProgress() {
    api().imageGen.offProgress()
  }

  return {
    generations,
    generating,
    progress,
    fetchGenerations,
    generate,
    deleteGeneration,
    deleteGenerations,
    listenProgress,
    stopListenProgress
  }
})
