import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>((localStorage.getItem('theme') as ThemeMode) || 'system')

  function applyTheme(m: ThemeMode) {
    const root = document.documentElement
    let isDark: boolean
    if (m === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    } else {
      isDark = m === 'dark'
    }
    root.classList.toggle('dark', isDark)
  }

  function setMode(m: ThemeMode) {
    mode.value = m
    localStorage.setItem('theme', m)
    applyTheme(m)
  }

  // Listen for system theme changes
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', () => {
    if (mode.value === 'system') {
      applyTheme('system')
    }
  })

  // Apply on init
  applyTheme(mode.value)

  return { mode, setMode }
})
