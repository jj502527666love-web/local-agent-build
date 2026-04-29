import { defineStore } from 'pinia'
import { ref } from 'vue'

function plain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export interface Skill {
  id: string
  name: string
  description: string
  function_def: any
  implementation: string
  source: string
  version: string
  enabled: boolean
  created_at: string
}

export const useSkillStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  const loading = ref(false)

  async function fetchSkills() {
    loading.value = true
    try {
      skills.value = (await window.api.skill.invoke('list')) as Skill[]
    } finally {
      loading.value = false
    }
  }

  async function createSkill(data: Partial<Skill>) {
    const result = (await window.api.skill.invoke('create', plain(data))) as Skill
    skills.value.unshift(result)
    return result
  }

  async function updateSkill(id: string, data: Partial<Skill>) {
    const result = (await window.api.skill.invoke('update', id, plain(data))) as Skill
    const idx = skills.value.findIndex((s) => s.id === id)
    if (idx !== -1) skills.value[idx] = result
    return result
  }

  async function deleteSkill(id: string) {
    await window.api.skill.invoke('delete', id)
    skills.value = skills.value.filter((s) => s.id !== id)
  }

  async function fetchPresets() {
    return (await window.api.skill.invoke('presets')) as any[]
  }

  async function testSkill(implementation: string, argsJson: string) {
    return (await window.api.skill.invoke('test', implementation, argsJson)) as {
      success: boolean
      result?: any
      error?: string
      duration: number
    }
  }

  async function exportSkills(ids: string[]) {
    return (await window.api.skill.invoke('export', plain(ids))) as any[]
  }

  async function importSkills(dataArr: any[]) {
    const results = (await window.api.skill.invoke('import', plain(dataArr))) as Skill[]
    skills.value.unshift(...results)
    return results
  }

  return {
    skills,
    loading,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    fetchPresets,
    testSkill,
    exportSkills,
    importSkills
  }
})
