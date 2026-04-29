import { defineStore } from 'pinia'
import { ref } from 'vue'

function plain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export interface ModelProvider {
  id: string
  name: string
  type: string
  api_base: string
  api_key: string
  models: string[]
  created_at: string
  updated_at: string
}

export const useModelStore = defineStore('models', () => {
  const providers = ref<ModelProvider[]>([])
  const loading = ref(false)

  async function fetchProviders() {
    loading.value = true
    try {
      providers.value = (await window.api.model.invoke('list')) as ModelProvider[]
    } finally {
      loading.value = false
    }
  }

  async function createProvider(data: Partial<ModelProvider>) {
    const result = (await window.api.model.invoke('create', plain(data))) as ModelProvider
    providers.value.unshift(result)
    return result
  }

  async function updateProvider(id: string, data: Partial<ModelProvider>) {
    const result = (await window.api.model.invoke('update', id, plain(data))) as ModelProvider
    const idx = providers.value.findIndex((p) => p.id === id)
    if (idx !== -1) providers.value[idx] = result
    return result
  }

  async function deleteProvider(id: string) {
    await window.api.model.invoke('delete', id)
    providers.value = providers.value.filter((p) => p.id !== id)
  }

  return { providers, loading, fetchProviders, createProvider, updateProvider, deleteProvider }
})
