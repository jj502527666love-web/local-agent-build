import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useCloudAuthStore } from './cloud-auth'

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
  isCloud?: boolean
}

export const useModelStore = defineStore('models', () => {
  const localProviders = ref<ModelProvider[]>([])
  const loading = ref(false)

  const providers = computed(() => {
    const cloudAuth = useCloudAuthStore()
    const showLocal = cloudAuth.isLoggedIn && cloudAuth.permissions.allow_custom_provider
    const result = showLocal ? [...localProviders.value] : []
    // Add cloud models as a virtual provider if logged in
    if (cloudAuth.isLoggedIn && cloudAuth.models.length > 0) {
      result.unshift({
        id: 'cloud:default',
        name: 'Cloud Models',
        type: 'cloud',
        api_base: '',
        api_key: '',
        models: cloudAuth.models.map(m => m.model_id),
        created_at: '',
        updated_at: '',
        isCloud: true
      })
    }
    return result
  })

  // Map of cloud model_id -> type ('chat' | 'image' | 'embedding' | ...)
  // Used by capability detection to trust the backend ground-truth over name heuristics.
  const cloudTypes = computed<Record<string, string>>(() => {
    const cloudAuth = useCloudAuthStore()
    const map: Record<string, string> = {}
    for (const m of cloudAuth.models) {
      if (m.model_id) map[m.model_id] = m.type
    }
    return map
  })

  function cloudTypeOf(providerId: string, modelId: string): string | undefined {
    if (providerId !== 'cloud:default') return undefined
    return cloudTypes.value[modelId]
  }

  async function fetchProviders() {
    loading.value = true
    try {
      localProviders.value = (await window.api.model.invoke('list')) as ModelProvider[]
    } finally {
      loading.value = false
    }
  }

  async function createProvider(data: Partial<ModelProvider>) {
    const result = (await window.api.model.invoke('create', plain(data))) as ModelProvider
    localProviders.value.unshift(result)
    return result
  }

  async function updateProvider(id: string, data: Partial<ModelProvider>) {
    const result = (await window.api.model.invoke('update', id, plain(data))) as ModelProvider
    const idx = localProviders.value.findIndex((p) => p.id === id)
    if (idx !== -1) localProviders.value[idx] = result
    return result
  }

  async function deleteProvider(id: string) {
    await window.api.model.invoke('delete', id)
    localProviders.value = localProviders.value.filter((p) => p.id !== id)
  }

  return { providers, loading, fetchProviders, createProvider, updateProvider, deleteProvider, cloudTypeOf }
})
