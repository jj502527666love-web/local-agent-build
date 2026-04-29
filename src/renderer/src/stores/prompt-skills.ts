import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PromptSkill {
  id: string
  name: string
  description: string
  dirName: string
  enabled: boolean
}

export const usePromptSkillStore = defineStore('promptSkills', () => {
  const skills = ref<PromptSkill[]>([])
  const loading = ref(false)

  async function fetchSkills() {
    loading.value = true
    try {
      skills.value = (await window.api.promptSkill.invoke('list')) as PromptSkill[]
    } finally {
      loading.value = false
    }
  }

  async function getContent(dirName: string): Promise<string> {
    return (await window.api.promptSkill.invoke('getContent', dirName)) as string
  }

  async function toggleSkill(dirName: string, enabled: boolean) {
    await window.api.promptSkill.invoke('toggle', dirName, enabled)
    const s = skills.value.find((sk) => sk.dirName === dirName)
    if (s) s.enabled = enabled
  }

  async function deleteSkill(dirName: string) {
    await window.api.promptSkill.invoke('delete', dirName)
    skills.value = skills.value.filter((s) => s.dirName !== dirName)
  }

  async function createSkill(name: string, description: string, content: string) {
    const result = (await window.api.promptSkill.invoke('create', name, description, content)) as PromptSkill
    skills.value.push(result)
    return result
  }

  async function getSkillsDir(): Promise<string> {
    return (await window.api.promptSkill.invoke('getDir')) as string
  }

  async function installFromUrl(url: string): Promise<{ success: boolean; name?: string; error?: string }> {
    const result = (await window.api.promptSkill.invoke('installFromUrl', url)) as any
    if (result.success) {
      await fetchSkills()
    }
    return result
  }

  async function searchMarket(keyword: string, page = 1): Promise<{ results: any[]; total: number }> {
    return (await window.api.promptSkill.invoke('searchMarket', keyword, page)) as any
  }

  return {
    skills,
    loading,
    fetchSkills,
    getContent,
    toggleSkill,
    deleteSkill,
    createSkill,
    getSkillsDir,
    installFromUrl,
    searchMarket
  }
})
