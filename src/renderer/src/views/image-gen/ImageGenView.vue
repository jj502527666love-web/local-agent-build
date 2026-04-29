<template>
  <div class="h-full flex overflow-hidden">
      <!-- Left: Generation Config -->
      <div class="w-72 flex-shrink-0 border-r border-surface-3 bg-surface-0 flex flex-col">
            <div class="flex-1 overflow-y-auto p-4 space-y-5">
              <h3 class="text-xs font-semibold text-text-primary tracking-wide uppercase">生成配置</h3>

              <!-- Prompt -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-1.5">
                    <label class="text-xs font-medium text-text-secondary">提示词 (Prompt)</label>
                    <button
                      @click="showPresetPopup = !showPresetPopup"
                      class="px-1.5 py-0.5 rounded text-[10px] text-text-tertiary hover:text-primary-600 hover:bg-surface-2 transition-colors"
                    >预设</button>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button
                      v-if="prompt.trim() && optimizeProviderId && optimizeModelId"
                      @click="optimizePrompt('cn')"
                      :disabled="optimizing"
                      class="px-2 py-1 rounded-md text-xs font-medium text-text-tertiary hover:text-primary-600 hover:bg-surface-2 transition-colors"
                      title="优化为中文提示词"
                    >中</button>
                    <button
                      v-if="prompt.trim() && optimizeProviderId && optimizeModelId"
                      @click="optimizePrompt('en')"
                      :disabled="optimizing"
                      class="px-2 py-1 rounded-md text-xs font-medium text-text-tertiary hover:text-primary-600 hover:bg-surface-2 transition-colors"
                      title="优化为英文提示词"
                    >En</button>
                  </div>
                </div>
                <textarea
                  v-model="prompt"
                  rows="5"
                  class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-text-disabled"
                  placeholder="描述你想要生成的图片..."
                ></textarea>
                <div v-if="optimizing" class="flex items-center gap-1.5 mt-1 text-[10px] text-text-tertiary">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  正在优化提示词...
                </div>
              </div>

              <!-- Reference Images -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-medium text-text-secondary">参考图</label>
                  <span class="text-[10px] text-text-tertiary">{{ refImages.length }} / 10</span>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <div v-for="(img, i) in refImages" :key="i" class="relative w-14 h-14 rounded-lg overflow-hidden border border-surface-3 group">
                    <img :src="img" class="w-full h-full object-cover" />
                    <button @click="refImages.splice(i, 1)" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <button
                    v-if="refImages.length < 10"
                    @click="pickRefImage"
                    class="w-14 h-14 rounded-lg border-2 border-dashed border-surface-4 flex flex-col items-center justify-center text-text-tertiary hover:text-text-secondary hover:border-surface-5 transition-colors"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    <span class="text-[9px] mt-0.5">添加</span>
                  </button>
                </div>
              </div>

              <!-- Model Selection -->
              <div>
                <label class="text-xs font-medium text-text-secondary mb-1.5 block">模型</label>
                <select v-model="selectedProviderId" @change="selectedModelId = ''" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2">
                  <option value="">-- 选择服务商 --</option>
                  <option v-for="p in imageProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <select v-model="selectedModelId" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" :disabled="!selectedProviderModels.length">
                  <option value="">-- 选择模型 --</option>
                  <option v-for="m in selectedProviderModels" :key="m" :value="m">{{ m }}</option>
                </select>
                <input v-if="selectedProviderId && !selectedProviderModels.length" v-model="selectedModelId" placeholder="输入模型名称" class="w-full mt-2 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              <!-- Prompt Optimize Model (used for prompt optimization) -->
              <div>
                <label class="text-xs font-medium text-text-secondary mb-1.5 block">提示词优化模型</label>
                <select v-model="optimizeProviderId" @change="optimizeModelId = ''" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2">
                  <option value="">-- 选择服务商 --</option>
                  <option v-for="p in languageProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
                <select v-model="optimizeModelId" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" :disabled="!optimizeProviderModels.length">
                  <option value="">-- 选择模型 --</option>
                  <option v-for="m in optimizeProviderModels" :key="m" :value="m">{{ m }}</option>
                </select>
                <input v-if="optimizeProviderId && !optimizeProviderModels.length" v-model="optimizeModelId" placeholder="输入模型名称" class="w-full mt-2 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              <!-- Size -->
              <div>
                <label class="text-xs font-medium text-text-secondary mb-1.5 block">尺寸</label>
                <div class="grid grid-cols-5 gap-1.5">
                  <button
                    v-for="s in sizeOptions"
                    :key="s.value"
                    @click="selectedSize = s.value"
                    :class="['px-2 py-2 text-[10px] rounded-lg border transition-colors text-center', selectedSize === s.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2']"
                  >{{ s.label }}</button>
                </div>
              </div>

              <!-- Quality -->
              <div>
                <label class="text-xs font-medium text-text-secondary mb-1.5 block">画质</label>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="q in qualityOptions"
                    :key="q.value"
                    @click="selectedQuality = q.value"
                    :class="['px-2 py-2 text-[10px] rounded-lg border transition-colors text-center', selectedQuality === q.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2']"
                  >{{ q.label }}</button>
                </div>
              </div>

              <!-- Batch Count -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-medium text-text-secondary">批量数量</label>
                  <span class="text-xs font-semibold text-primary-600">{{ batchCount }}</span>
                </div>
                <input type="range" v-model.number="batchCount" min="1" max="10" step="1" class="w-full h-1.5 bg-surface-3 rounded-full appearance-none cursor-pointer accent-primary-600" />
                <div class="flex justify-between text-[10px] text-text-tertiary mt-1">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

            </div>
            <!-- Generate Button (sticky bottom) -->
            <div class="flex-shrink-0 p-4 border-t border-surface-3">
              <button
                @click="doGenerate"
                :disabled="!canGenerate || store.generating"
                class="w-full py-3 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg v-if="store.generating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                {{ store.generating ? `生成中 (${store.progress?.completed || 0}/${store.progress?.total || batchCount})` : '开始生成' }}
              </button>
            </div>
          </div>

          <!-- Right: Results -->
          <div class="flex-1 flex flex-col bg-surface-1 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-surface-3 bg-surface-0">
              <div class="flex items-center gap-2">
                <h3 class="text-xs font-semibold text-text-primary">生成结果</h3>
                <template v-if="selectMode">
                  <span class="text-[10px] text-text-tertiary">{{ selectedIds.size }} 项已选</span>
                  <button @click="toggleSelectAll" class="text-[10px] text-primary-600 hover:text-primary-700">{{ selectedIds.size === recentGenerations.length ? '取消全选' : '全选' }}</button>
                  <button v-if="selectedIds.size > 0" @click="deleteSelected" class="text-[10px] text-red-500 hover:text-red-600">删除所选</button>
                </template>
              </div>
              <div class="flex items-center gap-1">
                <button v-if="recentGenerations.length" @click="toggleSelectMode" :class="['p-1.5 rounded text-[10px]', selectMode ? 'bg-primary-100 text-primary-600' : 'text-text-tertiary hover:text-text-secondary']" :title="selectMode ? '退出选择' : '选择'">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                </button>
                <button @click="viewMode = 'grid'" :class="['p-1.5 rounded', viewMode === 'grid' ? 'bg-surface-2 text-text-primary' : 'text-text-tertiary hover:text-text-secondary']">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" /></svg>
                </button>
                <button @click="viewMode = 'list'" :class="['p-1.5 rounded', viewMode === 'list' ? 'bg-surface-2 text-text-primary' : 'text-text-tertiary hover:text-text-secondary']">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
              <div v-if="!recentGenerations.length && !store.generating" class="flex-1 flex flex-col items-center justify-center py-20">
                <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                  <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                </div>
                <p class="text-sm font-medium text-text-secondary mb-1">开始创作你的图片</p>
                <p class="text-xs text-text-tertiary">在左侧配置面板输入提示词进行生图</p>
              </div>

              <!-- Grid view -->
              <div v-else-if="viewMode === 'grid'" class="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                <div v-for="gen in recentGenerations" :key="gen.id" :class="['group relative rounded-xl overflow-hidden border bg-surface-0 shadow-sm hover:shadow-md transition-shadow', selectedIds.has(gen.id) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-surface-3']" @click="selectMode ? toggleSelect(gen.id) : null">
                  <div v-if="selectMode" class="absolute top-1.5 left-1.5 z-10">
                    <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors', selectedIds.has(gen.id) ? 'bg-primary-600 border-primary-600' : 'bg-white/80 border-surface-4']">
                      <svg v-if="selectedIds.has(gen.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    </div>
                  </div>
                  <button v-if="!selectMode" @click.stop="deleteSingle(gen.id)" class="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-black/40 hover:bg-red-500 text-white flex items-center justify-center transition-all" title="删除">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                  <div v-if="gen.status === 'done' && gen.result_path" class="aspect-square relative">
                    <img :src="localFileUrl(gen.result_path)" class="w-full h-full object-cover cursor-pointer" @click.stop="selectMode ? toggleSelect(gen.id) : (previewImage = localFileUrl(gen.result_path))" />
                    <div v-if="!selectMode" class="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button @click.stop="copyImage(gen.result_path)" class="w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 text-white flex items-center justify-center" title="复制图片">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                      </button>
                      <button @click.stop="editImage" class="w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 text-white flex items-center justify-center" title="编辑">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                      </button>
                    </div>
                  </div>
                  <div v-else-if="gen.status === 'generating' || gen.status === 'pending'" class="aspect-square flex items-center justify-center bg-surface-2">
                    <svg class="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  </div>
                  <div v-else-if="gen.status === 'error'" class="aspect-square flex flex-col items-center justify-center bg-red-50 p-3">
                    <svg class="w-6 h-6 text-red-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                    <p class="text-[10px] text-red-500 text-center line-clamp-3">{{ gen.error }}</p>
                  </div>
                  <div class="p-2.5">
                    <p class="text-[11px] text-text-secondary line-clamp-2">{{ gen.prompt }}</p>
                    <div class="flex items-center justify-between mt-1.5">
                      <span class="text-[10px] text-text-tertiary">{{ gen.model_id }} / {{ gen.size }}</span>
                      <button v-if="gen.status === 'done' && gen.result_path" @click.stop="openFolder(gen.result_path)" class="opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-text-primary transition-opacity" title="打开所在目录">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- List view -->
              <div v-else class="space-y-2">
                <div v-for="gen in recentGenerations" :key="gen.id" :class="['flex gap-3 p-3 rounded-xl border bg-surface-0 group hover:shadow-sm transition-shadow', selectedIds.has(gen.id) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-surface-3']" @click="selectMode ? toggleSelect(gen.id) : null">
                  <div v-if="selectMode" class="flex items-center pr-1">
                    <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors', selectedIds.has(gen.id) ? 'bg-primary-600 border-primary-600' : 'border-surface-4']">
                      <svg v-if="selectedIds.has(gen.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    </div>
                  </div>
                  <div class="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-surface-2">
                    <img v-if="gen.status === 'done' && gen.result_path" :src="localFileUrl(gen.result_path)" class="w-full h-full object-cover cursor-pointer" @click="previewImage = localFileUrl(gen.result_path)" />
                    <div v-else-if="gen.status === 'generating' || gen.status === 'pending'" class="w-full h-full flex items-center justify-center">
                      <svg class="w-5 h-5 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                    </div>
                    <div v-else class="w-full h-full flex items-center justify-center bg-red-50">
                      <svg class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-text-primary line-clamp-2">{{ gen.prompt }}</p>
                    <p v-if="gen.revised_prompt" class="text-[10px] text-text-tertiary mt-1 line-clamp-1">{{ gen.revised_prompt }}</p>
                    <div class="flex items-center gap-3 mt-1.5">
                      <span class="text-[10px] text-text-tertiary">{{ gen.model_id }}</span>
                      <span class="text-[10px] text-text-tertiary">{{ gen.size }}</span>
                      <span :class="['text-[10px]', gen.status === 'done' ? 'text-green-600' : gen.status === 'error' ? 'text-red-500' : 'text-text-tertiary']">{{ gen.status }}</span>
                    </div>
                    <p v-if="gen.status === 'error'" class="text-[10px] text-red-500 mt-1">{{ gen.error }}</p>
                  </div>
                  <div v-if="!selectMode" class="flex items-start gap-1">
                    <button v-if="gen.status === 'done' && gen.result_path" @click.stop="copyImage(gen.result_path)" class="opacity-0 group-hover:opacity-100 p-1.5 text-text-tertiary hover:text-primary-600 rounded-lg hover:bg-surface-2 transition-all" title="复制图片">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                    </button>
                    <button v-if="gen.status === 'done' && gen.result_path" @click.stop="editImage" class="opacity-0 group-hover:opacity-100 p-1.5 text-text-tertiary hover:text-primary-600 rounded-lg hover:bg-surface-2 transition-all" title="编辑">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                    </button>
                    <button v-if="gen.status === 'done' && gen.result_path" @click.stop="openFolder(gen.result_path)" class="opacity-0 group-hover:opacity-100 p-1.5 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-surface-2 transition-all" title="打开所在目录">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
                    </button>
                    <button @click.stop="deleteSingle(gen.id)" class="opacity-0 group-hover:opacity-100 p-1.5 text-text-tertiary hover:text-red-500 rounded-lg hover:bg-surface-2 transition-all" title="删除">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
  </div>

  <!-- Toast -->
  <div v-if="copyToast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-surface-0 shadow-lg border border-surface-3 text-xs text-text-primary">{{ copyToast }}</div>

  <!-- Preset Prompt Modal -->
  <div v-if="showPresetPopup" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showPresetPopup = false">
    <div class="w-[480px] max-h-[70vh] bg-surface-0 border border-surface-3 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-surface-3">
        <h3 class="text-sm font-semibold text-text-primary">预设提示词</h3>
        <button @click="showPresetPopup = false" class="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-for="cat in promptPresets" :key="cat.id">
          <div class="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-2">{{ cat.name }}</div>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="item in cat.items"
              :key="item.id"
              @click="prompt = item.content; showPresetPopup = false"
              class="text-left p-3 rounded-xl border border-surface-3 hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <div class="text-xs font-medium text-text-primary mb-1">{{ item.label }}</div>
              <div class="text-[10px] text-text-tertiary line-clamp-2">{{ item.content }}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Image Preview -->
  <div v-if="previewImage" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="previewImage = null">
    <div class="relative max-w-[90vw] max-h-[90vh] rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.12)] overflow-hidden bg-surface-0">
      <img :src="previewImage" class="max-w-[90vw] max-h-[90vh] object-contain" />
      <button @click="previewImage = null" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-surface-0/80 hover:bg-surface-2 text-text-secondary transition-colors shadow-lg">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useImageGenStore } from '@/stores/image-gen'
import { useModelStore } from '@/stores/models'
import { usePromptPresetStore } from '@/stores/prompt-presets'

const route = useRoute()
const store = useImageGenStore()
const modelStore = useModelStore()
const presetStore = usePromptPresetStore()

const promptPresets = computed(() => presetStore.visibleGrouped('image_gen'))

const prompt = ref('')
function localFileUrl(path: string): string {
  // 兼容旧绝对路径数据：以盘符或 / 开头视为绝对路径
  const isAbsolute = /^[A-Za-z]:|^\//.test(path)
  const param = isAbsolute ? 'p' : 'rel'
  return 'local-file://img?' + param + '=' + encodeURIComponent(path)
}

const refImages = ref<string[]>([])
const selectedProviderId = ref('')
const selectedModelId = ref('')
const optimizeProviderId = ref('')
const optimizeModelId = ref('')
const selectedSize = ref('1:1')
const batchCount = ref(1)
const viewMode = ref<'grid' | 'list'>('grid')
const previewImage = ref<string | null>(null)
const optimizing = ref(false)
const showPresetPopup = ref(false)
const selectMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selectedIds.value = new Set()
}

function toggleSelect(id: string) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function toggleSelectAll() {
  if (selectedIds.value.size === recentGenerations.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(recentGenerations.value.map(g => g.id))
  }
}

async function deleteSelected() {
  if (!selectedIds.value.size) return
  const ids = [...selectedIds.value]
  await store.deleteGenerations(ids)
  selectedIds.value = new Set()
  if (!store.generations.length) selectMode.value = false
}

async function deleteSingle(id: string) {
  await store.deleteGeneration(id)
}

const IMAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx', 'kolors', 'gpt-image']
const LANGUAGE_KEYWORDS = ['gpt', 'claude', 'qwen', 'glm', 'kimi', 'deepseek', 'llama', 'mistral', 'gemma', 'yi-', 'baichuan', 'internlm', 'chat', 'turbo', 'lite', 'plus', 'pro', 'max', 'sonnet', 'opus', 'haiku']
const NON_LANGUAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx', 'kolors', 'embedding', 'embed', 'bge', 'e5-', 'text-embedding', 'tts', 'whisper', 'audio', 'speech', 'asr', 'rerank', 'reranker']

function isImageModel(m: string) {
  const lower = m.toLowerCase()
  return IMAGE_KEYWORDS.some(k => lower.includes(k))
}
function isLanguageModel(m: string) {
  const lower = m.toLowerCase()
  if (NON_LANGUAGE_KEYWORDS.some(k => lower.includes(k))) return false
  return LANGUAGE_KEYWORDS.some(k => lower.includes(k))
}

const imageProviders = computed(() =>
  modelStore.providers.filter(p => p.models.some(isImageModel) || !p.models.length)
)
const languageProviders = computed(() =>
  modelStore.providers.filter(p => p.models.some(isLanguageModel) || !p.models.length)
)

const sizeOptions = [
  { label: '1:1', value: '1:1' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' }
]

const qualityOptions = [
  { label: '自动', value: 'auto' },
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' }
]
const selectedQuality = ref('auto')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const recentGenerations = computed(() => {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()
  return store.generations.filter(g => g.created_at >= cutoff)
})

const selectedProviderModels = computed(() => {
  if (!selectedProviderId.value) return []
  const p = modelStore.providers.find((p) => p.id === selectedProviderId.value)
  if (!p) return []
  const filtered = p.models.filter(isImageModel)
  return filtered.length ? filtered : p.models
})

const optimizeProviderModels = computed(() => {
  if (!optimizeProviderId.value) return []
  const p = modelStore.providers.find((p) => p.id === optimizeProviderId.value)
  if (!p) return []
  const filtered = p.models.filter(isLanguageModel)
  return filtered.length ? filtered : p.models
})

const canGenerate = computed(() =>
  prompt.value.trim() && selectedProviderId.value && selectedModelId.value
)

const OPTIMIZE_CN_PROMPT = `你是一个专业的 AI 图片生成提示词工程师。请将以下描述优化为高质量的中文生图提示词。

优化要求：
1. 保持原始创意意图不变
2. 补充画面构图、光影、色调、风格等专业描述
3. 增加细节描述（材质、纹理、氛围等）
4. 结构清晰，主体描述在前，风格修饰在后
5. 控制在 200 字以内

请直接输出优化后的提示词，不要包含任何解释。`

const OPTIMIZE_EN_PROMPT = `You are a professional AI image generation prompt engineer. Optimize the following description into a high-quality English image generation prompt.

Requirements:
1. Preserve the original creative intent
2. Add composition, lighting, color tone, and style descriptors
3. Include detail descriptions (materials, textures, atmosphere)
4. Structure: subject first, then style modifiers
5. Keep within 200 words

Output only the optimized prompt, no explanations.`

async function optimizePrompt(lang: 'cn' | 'en') {
  if (!prompt.value.trim() || !optimizeProviderId.value || !optimizeModelId.value) return
  optimizing.value = true
  try {
    const systemPrompt = lang === 'cn' ? OPTIMIZE_CN_PROMPT : OPTIMIZE_EN_PROMPT
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt.value }
    ]
    const result = await (window as any).api.llm.invoke('call', optimizeProviderId.value, optimizeModelId.value, messages)
    if (result) prompt.value = result
  } catch (e: any) {
    console.error('Optimize failed:', e)
  } finally {
    optimizing.value = false
  }
}

function compressImage(dataUri: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUri
  })
}

async function pickRefImage() {
  try {
    const result = await (window as any).api.dialog.openFile({
      title: '选择参考图片',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || !result.filePaths.length) return

    for (const filePath of result.filePaths) {
      if (refImages.value.length >= 10) break
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const raw = await (window as any).api.chat.invoke('readFileBase64', filePath)
      const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${raw}`
      const compressed = await compressImage(dataUri, 1024, 0.8)
      refImages.value.push(compressed)
    }
  } catch (e) {
    console.error('Failed to pick ref image:', e)
  }
}

async function doGenerate() {
  if (!canGenerate.value || store.generating) return
  await store.generate({
    prompt: prompt.value,
    refImages: refImages.value.length ? refImages.value : undefined,
    modelProviderId: selectedProviderId.value,
    modelId: selectedModelId.value,
    size: selectedSize.value,
    quality: selectedQuality.value,
    batchCount: batchCount.value
  })
}

const copyToast = ref('')

async function copyImage(path: string) {
  try {
    const res = await window.api.clipboard.writeImage(path)
    if (res.success) {
      copyToast.value = '已复制到剪贴板'
    } else {
      copyToast.value = '复制失败: ' + (res.error || '')
    }
  } catch (e: any) {
    copyToast.value = '复制失败'
  }
  setTimeout(() => { copyToast.value = '' }, 2000)
}

function editImage() {
  copyToast.value = '图片编辑功能开发中'
  setTimeout(() => { copyToast.value = '' }, 2000)
}

function openFolder(path: string) {
  ;(window as any).api.shell.showItemInFolder(path)
}

// Handle inspiration data from route query
function applyInspirationFromQuery() {
  const q = route.query
  if (q.prompt) {
    prompt.value = q.prompt as string
  }
  if (q.hasRefImages) {
    try {
      const stored = sessionStorage.getItem('imageGen:refImages')
      if (stored) {
        refImages.value = JSON.parse(stored)
        sessionStorage.removeItem('imageGen:refImages')
      }
    } catch {}
  }
}

watch(selectedModelId, (v) => {
  if (v) {
    window.api.settings.invoke('set', 'imagegen_provider_id', selectedProviderId.value)
    window.api.settings.invoke('set', 'imagegen_model_id', v)
  }
})
watch(optimizeModelId, (v) => {
  if (v) {
    window.api.settings.invoke('set', 'imagegen_optimize_provider_id', optimizeProviderId.value)
    window.api.settings.invoke('set', 'imagegen_optimize_model_id', v)
  }
})

onMounted(async () => {
  store.listenProgress()
  await Promise.all([store.fetchGenerations(), modelStore.fetchProviders(), presetStore.fetchAll('image_gen')])

  const all = (await window.api.settings.invoke('getAll')) as Record<string, string>
  if (all['imagegen_provider_id']) selectedProviderId.value = all['imagegen_provider_id']
  if (all['imagegen_model_id']) selectedModelId.value = all['imagegen_model_id']
  if (all['imagegen_optimize_provider_id']) optimizeProviderId.value = all['imagegen_optimize_provider_id']
  if (all['imagegen_optimize_model_id']) optimizeModelId.value = all['imagegen_optimize_model_id']

  applyInspirationFromQuery()
})

onUnmounted(() => {
  store.stopListenProgress()
})
</script>
