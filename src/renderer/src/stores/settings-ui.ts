import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 设置居中模态的分类（与我方 SettingsView 内容 section 对应） */
export type SettingsCategory = 'general' | 'vector' | 'data' | 'about'

export const useSettingsUiStore = defineStore('settings-ui', () => {
  const open = ref(false)
  const category = ref<SettingsCategory>('general')

  function show(cat?: SettingsCategory) {
    if (cat) category.value = cat
    open.value = true
  }

  function hide() {
    open.value = false
  }

  function setCategory(cat: SettingsCategory) {
    category.value = cat
  }

  return { open, category, show, hide, setCategory }
})
