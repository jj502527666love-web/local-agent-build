<template>
  <!-- Teleport 到 body：避免被画布节点的 transform 容器影响（缩放 + fixed 重定位） -->
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="cancel">
      <div class="bg-surface-0 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.15)] w-full max-w-4xl max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-surface-3">
        <h2 class="text-sm font-semibold text-text-primary">从图库选择</h2>
        <div class="flex items-center gap-2">
          <span v-if="multiple && selectedPaths.length" class="text-xs text-text-tertiary">
            已选 {{ selectedPaths.length }} 张
          </span>
          <button class="btn-ghost text-xs px-2 py-1" @click="cancel">取消</button>
          <button class="btn-primary text-xs px-3 py-1" :disabled="!selectedPaths.length" @click="confirm">确定</button>
        </div>
      </div>

      <!-- Category tabs + search -->
      <div class="px-4 pt-3 flex items-center gap-2 flex-shrink-0">
        <div class="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar">
          <button
            class="px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors"
            :class="activeCat === null ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-medium' : 'text-text-secondary hover:bg-surface-2'"
            @click="switchCat(null)"
          >全部</button>
          <button
            v-for="cat in categories"
            :key="cat.id"
            class="px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors"
            :class="activeCat === cat.id ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-medium' : 'text-text-secondary hover:bg-surface-2'"
            @click="switchCat(cat.id)"
          >{{ cat.name }}</button>
        </div>
        <div class="relative w-44 flex-shrink-0">
          <input
            v-model="searchText"
            class="input-field pl-7 text-xs h-7"
            placeholder="搜索..."
            @input="onSearch"
          />
          <svg class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
      </div>

      <!-- Grid -->
      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="items.length === 0" class="text-center py-12 text-sm text-text-tertiary">暂无图片</div>
        <div v-else class="grid grid-cols-6 gap-1.5">
          <div
            v-for="item in items"
            :key="item.id"
            class="relative aspect-square rounded-lg overflow-hidden bg-surface-2 cursor-pointer border transition-colors"
            :class="isSelected(item.file_path) ? 'border-primary-500 ring-2 ring-primary-300' : 'border-surface-3 hover:border-primary-400'"
            @click="toggleItem(item)"
          >
            <img
              :src="toLocalThumbUrl(item.file_path)"
              :alt="item.name"
              class="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div
              v-if="isSelected(item.file_path)"
              class="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center"
            >
              <svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-3">
          <button class="btn-secondary text-xs px-2 py-0.5" :disabled="page <= 1" @click="setPage(page - 1)">上一页</button>
          <span class="text-xs text-text-tertiary">{{ page }} / {{ totalPages }}</span>
          <button class="btn-secondary text-xs px-2 py-0.5" :disabled="page >= totalPages" @click="setPage(page + 1)">下一页</button>
        </div>
      </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface GalleryCategory {
  id: string
  name: string
}

interface GalleryItem {
  id: string
  file_path: string
  name: string
}

const props = withDefaults(defineProps<{
  visible: boolean
  multiple?: boolean
}>(), {
  multiple: false
})

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'select', paths: string[]): void
}>()

const categories = ref<GalleryCategory[]>([])
const items = ref<GalleryItem[]>([])
const total = ref(0)
const activeCat = ref<string | null>(null)
const searchText = ref('')
const page = ref(1)
const pageSize = 30
const selectedPaths = ref<string[]>([])

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

watch(() => props.visible, async (val) => {
  if (val) {
    selectedPaths.value = []
    searchText.value = ''
    activeCat.value = null
    page.value = 1
    categories.value = (await window.api.gallery.invoke('listCategories')) as GalleryCategory[]
    await fetchItems()
  }
})

async function fetchItems() {
  const result = (await window.api.gallery.invoke(
    'listItemsPaged',
    activeCat.value,
    searchText.value,
    page.value,
    pageSize
  )) as { items: GalleryItem[]; total: number }
  items.value = result.items
  total.value = result.total
}

function switchCat(id: string | null) {
  activeCat.value = id
  page.value = 1
  fetchItems()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchItems()
  }, 300)
}

function setPage(p: number) {
  page.value = p
  fetchItems()
}

function isSelected(filePath: string) {
  return selectedPaths.value.includes(filePath)
}

function toggleItem(item: GalleryItem) {
  if (props.multiple) {
    if (isSelected(item.file_path)) {
      selectedPaths.value = selectedPaths.value.filter(p => p !== item.file_path)
    } else {
      selectedPaths.value = [...selectedPaths.value, item.file_path]
    }
  } else {
    selectedPaths.value = [item.file_path]
  }
}

function toLocalThumbUrl(filePath: string): string {
  return `local-file://?p=${encodeURIComponent(filePath)}&thumb=1`
}

function cancel() {
  emit('update:visible', false)
}

function confirm() {
  emit('select', [...selectedPaths.value])
  emit('update:visible', false)
}
</script>
