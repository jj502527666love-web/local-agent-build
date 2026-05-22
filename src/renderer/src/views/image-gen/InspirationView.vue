<template>
  <div class="h-full flex flex-col">
    <header class="page-header justify-between">
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-text-secondary">灵感广场</span>
      </div>
      <div class="flex items-center gap-2">
        <!-- 「换一批」仅默认（ERNIE）随机源显示；自定义来源是有限数据集，改走下方分页控件不重复拉 -->
        <button v-if="!isCustomSource" @click="refreshRandom" :disabled="loading" class="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary hover:text-primary-600 border border-surface-3 rounded-lg bg-surface-0 hover:bg-surface-1 transition-colors disabled:opacity-50" title="换一批">
          <svg :class="['w-3.5 h-3.5', loading && 'animate-spin']" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" /></svg>
          换一批
        </button>
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
          <input
            v-model="search"
            placeholder="搜索当前列表..."
            class="pl-9 pr-3 py-2 text-xs border border-surface-3 rounded-lg bg-surface-0 outline-none focus:ring-2 focus:ring-primary-500 w-56"
          />
        </div>
      </div>
    </header>
    <div class="page-body">
      <!-- Category tabs -->
      <div class="flex flex-wrap gap-1.5 mb-5">
        <button
          @click="selectedCategory = ''"
          :class="['px-3 py-1.5 text-xs rounded-lg transition-colors', !selectedCategory ? 'bg-primary-600 text-white' : 'bg-surface-2 text-text-secondary hover:bg-surface-3']"
        >全部</button>
        <button
          v-for="cat in displayCategories"
          :key="cat"
          @click="selectedCategory = selectedCategory === cat ? '' : cat"
          :class="['px-3 py-1.5 text-xs rounded-lg transition-colors', selectedCategory === cat ? 'bg-primary-600 text-white' : 'bg-surface-2 text-text-secondary hover:bg-surface-3']"
        >{{ cat }}</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex-1 flex items-center justify-center py-20">
        <svg class="w-6 h-6 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
      </div>

      <!-- Empty state -->
      <div v-else-if="!filteredItems.length" class="empty-state">
        <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
        </div>
        <p class="text-sm font-medium text-text-secondary mb-1">暂无匹配的灵感</p>
        <p class="text-xs text-text-tertiary">尝试切换分类或{{ isCustomSource ? '点击下一页' : '点击「换一批」' }}</p>
      </div>

      <!-- Grid -->
      <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          @click="openDetail(item)"
          class="cursor-pointer rounded-xl overflow-hidden border border-surface-3 bg-surface-0 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div class="aspect-[4/3] bg-surface-2 overflow-hidden">
            <img v-if="item.cover_image" :src="item.cover_image" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" @error="($event.target as HTMLImageElement).style.display='none'" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="w-10 h-10 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
            </div>
          </div>
          <div class="p-3">
            <h4 class="text-xs font-medium text-text-primary truncate">{{ item.title }}</h4>
            <div class="flex items-center gap-1.5 mt-1">
              <p class="text-[10px] text-text-tertiary line-clamp-1 flex-1">{{ item.category }}</p>
              <span v-if="item.uploader_nickname" class="text-[10px] text-text-tertiary truncate flex-shrink-0" :title="`上传者：${item.uploader_nickname}`">@{{ item.uploader_nickname }}</span>
            </div>
            <div v-if="item.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
              <span v-for="tag in item.tags.slice(0, 3)" :key="tag" class="text-[9px] px-1.5 py-0.5 bg-surface-2 text-text-tertiary rounded">{{ tag }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页控件：仅自定义来源且不是在打口资源加载的中文注释。默认 ERNIE 随机源走「换一批」不需要分页 -->
      <div v-if="isCustomSource && !loading && total > pageSize" class="mt-5 flex items-center justify-center gap-3 text-xs">
        <button
          class="px-3 py-1.5 border border-surface-3 rounded-lg bg-surface-0 hover:bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :disabled="page <= 1 || loading"
          @click="goToPage(page - 1)"
        >上一页</button>
        <span class="text-text-secondary">第 <strong class="text-text-primary">{{ page }}</strong> 页 / 共 {{ totalPages }} 页（{{ total }} 个灵感）</span>
        <button
          class="px-3 py-1.5 border border-surface-3 rounded-lg bg-surface-0 hover:bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :disabled="page >= totalPages || loading"
          @click="goToPage(page + 1)"
        >下一页</button>
      </div>
    </div>

    <!-- Detail Modal：图片原图尺寸展示（不超出视口） + 右上角独立悬浮关闭按钮提亮 -->
    <div v-if="detailItem" class="fixed inset-0 z-50 flex items-center justify-center p-6" @click.self="detailItem = null">
      <div class="relative bg-surface-0 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.12)] max-w-[min(90vw,1200px)] max-h-[90vh] flex flex-col overflow-hidden">
        <!-- 右上角悬浮关闭按钮：36px 圆形 + 半透明黑底 + 白色粗体 X + 高 z-index，原图上也能看清 -->
        <button
          @click="detailItem = null"
          class="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors shadow-lg"
          title="关闭"
          aria-label="关闭详情"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <!-- Cover：原图宽高按比例自适应，不裁剪，超过视口时高度被 max-h-[55vh] 限住。详情部分可独立滚动 -->
        <div class="flex-shrink-0 bg-surface-2 flex items-center justify-center overflow-hidden" style="max-height: 55vh;">
          <img v-if="detailItem.cover_image" :src="detailItem.cover_image" class="max-w-full max-h-[55vh] w-auto h-auto object-contain block" />
          <div v-else class="w-full h-40 flex items-center justify-center">
            <svg class="w-16 h-16 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
          </div>
        </div>
        <div class="p-5 overflow-y-auto flex-1">
          <!-- 标题 / 上传者：右侧预留问关闭按钮位置避免遮挡 -->
          <div class="mb-4 pr-12">
            <h3 class="text-sm font-semibold text-text-primary">{{ detailItem.title }}</h3>
            <p v-if="detailItem.uploader_nickname" class="text-[11px] text-text-tertiary mt-1">by @{{ detailItem.uploader_nickname }}</p>
            <p v-if="detailItem.generation_size" class="text-[11px] text-text-tertiary mt-1">尺寸：{{ detailItem.generation_size }}</p>
          </div>

          <!-- Reference images -->
          <div v-if="detailRefImages.length" class="mb-4">
            <label class="text-xs font-medium text-text-secondary mb-1.5 block">参考图片（{{ detailRefImages.length }}）</label>
            <div class="flex gap-2 flex-wrap">
              <img v-for="(url, index) in detailRefImages" :key="`${url}-${index}`" :src="url" class="w-20 h-20 object-cover rounded-lg border border-surface-3" />
            </div>
          </div>

          <!-- Chinese prompt -->
          <div v-if="detailItem.prompt_cn" class="mb-4">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-text-secondary">中文提示词</label>
              <button @click="useInspiration(detailItem!.prompt_cn, detailItem!)" class="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                使用灵感
              </button>
            </div>
            <div class="text-xs text-text-primary bg-surface-1 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{{ detailItem.prompt_cn }}</div>
          </div>

          <!-- English prompt -->
          <div v-if="detailItem.prompt_en" class="mb-4">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-text-secondary">English Prompt</label>
              <button @click="useInspiration(detailItem!.prompt_en, detailItem!)" class="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                Use Prompt
              </button>
            </div>
            <div class="text-xs text-text-primary bg-surface-1 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{{ detailItem.prompt_en }}</div>
          </div>

          <!-- Tags -->
          <div v-if="detailItem.tags?.length" class="flex flex-wrap gap-1.5 mb-4">
            <span v-for="tag in detailItem.tags" :key="tag" class="text-[10px] px-2 py-0.5 bg-surface-2 text-text-tertiary rounded-md">{{ tag }}</span>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
interface Inspiration {
  id: string
  title: string
  prompt_cn: string
  prompt_en: string
  category: string
  tags: string[]
  ref_image?: string
  ref_images?: string[]
  generation_size?: string
  cover_image?: string
  // 用户上传的创作在自定义灵感广场中显示上传者昵称（百度文心默认数据为空）
  uploader_nickname?: string
}

let _cachedItems: Inspiration[] = []
let _hasLoaded = false
</script>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHandoffStore } from '@/stores/handoff'

const router = useRouter()
const handoff = useHandoffStore()
const api = () => (window as any).api

const allItems = ref<Inspiration[]>(_cachedItems)
const selectedCategory = ref('')
const search = ref('')
const loading = ref(false)
const detailItem = ref<Inspiration | null>(null)
const detailRefImages = computed(() => {
  const item = detailItem.value
  if (!item) return []
  return (item.ref_images?.length ? item.ref_images : (item.ref_image ? [item.ref_image] : [])).slice(0, 8)
})

const DEFAULT_CATEGORIES = ['人物', '风景', '动漫', '设计', '创意']
const dynamicCategories = ref<string[]>([])
const isCustomSource = ref(false)

// 分页（仅自定义来源用；ERNIE 默认源走「换一批」一次性 random，不分页）
const page = ref(1)
const pageSize = ref(40)
const total = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const displayCategories = computed(() => {
  return isCustomSource.value ? dynamicCategories.value : DEFAULT_CATEGORIES
})

const filteredItems = computed(() => {
  let list = allItems.value
  if (selectedCategory.value) {
    list = list.filter(i => i.category === selectedCategory.value)
  }
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.prompt_cn.toLowerCase().includes(q) ||
      i.tags.some(t => t.toLowerCase().includes(q))
    )
  }
  return list
})

async function fetchOnline(targetPage?: number) {
  loading.value = true
  try {
    const wantedPage = targetPage ?? page.value
    const result = await api().imageGen.invoke('fetchOnlineInspirations', {
      page: wantedPage,
      pageSize: pageSize.value,
    })
    allItems.value = result.items
    _cachedItems = result.items
    // Distinguish source by presence of categories key (not its length)
    // - undefined => default (ERNIE) source（页内随机 + 一次性，不分页）
    // - array (incl. empty) => custom source from cloud admin（按 page/pageSize 分页）
    if (Array.isArray(result.categories)) {
      dynamicCategories.value = result.categories
      isCustomSource.value = true
      total.value = typeof result.total === 'number' ? result.total : result.items.length
      page.value = wantedPage
    } else {
      isCustomSource.value = false
      total.value = 0
      page.value = 1
    }
  } catch (e) {
    console.error('Failed to fetch inspirations:', e)
  } finally {
    loading.value = false
  }
}

/** 「换一批」：默认（ERNIE）源专用，触发服务端 random page，自定义源已隐藏此按钮 */
function refreshRandom() {
  selectedCategory.value = ''
  search.value = ''
  fetchOnline()
}

/** 翻页：仅自定义来源使用；切换页时滚到顶 + 清空当前的搜索过滤避免误以为「这页没数据」 */
function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || loading.value) return
  search.value = ''
  fetchOnline(p)
  try {
    document.querySelector('.page-body')?.scrollTo({ top: 0, behavior: 'smooth' })
  } catch { /* ignore */ }
}

function openDetail(item: Inspiration) {
  detailItem.value = item
}

function useInspiration(promptText: string, item: Inspiration) {
  detailItem.value = null
  const refs = (item.ref_images?.length ? item.ref_images : (item.ref_image ? [item.ref_image] : [])).slice(0, 8)
  handoff.set('imageGen', {
    prompt: promptText,
    presetSize: item.generation_size || undefined,
    refImages: refs.length ? refs : undefined
  })
  router.push('/image-gen')
}

onMounted(() => {
  if (!_hasLoaded) {
    _hasLoaded = true
    fetchOnline()
  }
})
</script>
