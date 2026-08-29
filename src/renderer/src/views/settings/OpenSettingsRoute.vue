<script setup lang="ts">
/**
 * 兼容旧路由 /settings 与 /settings?tab=xxx：
 * 打开居中设置模态后回到首页，避免再渲染全页设置。
 * tab 值映射：设置分类（general/vector/data/about）直接定位；
 * 其余历史值（models/clawbot/personas 等独立页）跳对应路由。
 */
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsUiStore, type SettingsCategory } from '@/stores/settings-ui'
import { getHomePath } from '@/utils/home-path'

const VALID: SettingsCategory[] = ['general', 'vector', 'data', 'about']
// 历史 tab 值 → 独立路由（这些功能在我方仍是独立页面，未沉入设置）
const ROUTE_TABS: Record<string, string> = {
  models: '/models',
  clawbot: '/clawbot',
  personas: '/personas'
}

const route = useRoute()
const router = useRouter()
const settingsUi = useSettingsUiStore()

onMounted(() => {
  const raw = typeof route.query.tab === 'string' ? route.query.tab : ''
  if (ROUTE_TABS[raw]) {
    router.replace(ROUTE_TABS[raw])
    return
  }
  const tab = (VALID as string[]).includes(raw) ? (raw as SettingsCategory) : undefined
  settingsUi.show(tab)
  router.replace(getHomePath())
})
</script>

<template>
  <div class="h-full" />
</template>
