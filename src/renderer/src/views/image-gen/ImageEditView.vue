<template>
  <div class="h-full flex flex-col bg-surface-1 min-h-0">
    <!-- Header -->
    <header class="h-12 flex items-center justify-between px-4 bg-surface-0 border-b border-surface-3 flex-shrink-0">
      <div class="flex items-center gap-3">
        <button @click="goBack" class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors" title="返回">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
        </button>
        <span class="text-sm font-medium text-text-primary">图片编辑</span>
        <span v-if="generation" class="text-[11px] text-text-tertiary">{{ modelStore.formatModelLabel(generation.model_provider_id, generation.model_id) }} / {{ generation.size }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button @click="undo" :disabled="!canUndo" class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="撤销 (Ctrl+Z)">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
        </button>
        <button @click="redo" :disabled="!canRedo" class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="重做 (Ctrl+Y)">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" /></svg>
        </button>
        <div class="w-px h-4 bg-surface-3 mx-1"></div>
        <button @click="resetCanvas" class="px-3 py-1.5 text-xs text-text-tertiary hover:text-text-secondary border border-surface-3 rounded-lg hover:bg-surface-2 transition-colors">重置</button>
        <button @click="saveImage" :disabled="saving" class="px-3 py-1.5 text-xs text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50">
          {{ saving ? '保存中...' : '覆盖保存' }}
        </button>
        <button @click="prepareSaveToGallery" :disabled="saving" class="px-3 py-1.5 text-xs border border-primary-600 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50">另存到图库</button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden min-h-0">
      <!-- Left Toolbar -->
      <div class="w-14 flex flex-col items-center py-3 gap-1.5 bg-surface-0 border-r border-surface-3 flex-shrink-0">
        <button
          v-for="tool in tools"
          :key="tool.id"
          @click="selectTool(tool.id)"
          :class="['w-10 h-10 rounded-lg flex items-center justify-center transition-colors', activeTool === tool.id ? 'bg-primary-100 text-primary-700' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2']"
          :title="tool.label"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tool.icon" /></svg>
        </button>

        <div class="w-7 border-t border-surface-3 my-1"></div>

        <button
          @click="selectTool('inpaint')"
          :class="['w-10 h-10 rounded-lg flex items-center justify-center transition-colors', activeTool === 'inpaint' ? 'bg-orange-100 text-orange-700' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2']"
          title="AI 局部重绘"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" /></svg>
        </button>

        <button
          @click="regenerateWithRef"
          class="w-10 h-10 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-colors"
          title="用作参考图重新生成"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
        </button>

        <!-- O8: 生图模型设置 -->
        <div class="flex-1"></div>
        <button
          @click="modelDialogVisible = true"
          :class="['w-10 h-10 rounded-lg flex items-center justify-center transition-colors', editModelId ? 'text-primary-600 hover:bg-surface-2' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2']"
          :title="editModelId ? `生图模型：${modelStore.formatModelLabel(editProviderId, editModelId)}` : '设置生图模型'"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z" /></svg>
        </button>
      </div>

      <!-- Right Panel (contextual settings) -->
      <div v-if="showRightPanel" class="w-56 bg-surface-0 border-l border-surface-3 flex-shrink-0 overflow-y-auto p-3 order-3">
        <!-- Crop controls -->
        <div v-if="activeTool === 'crop'" class="space-y-3">
          <h4 class="text-xs font-medium text-text-secondary">裁剪</h4>
          <p class="text-[11px] text-text-tertiary">在画布上拖拽选择裁剪区域</p>
          <div class="flex gap-2">
            <button @click="applyCrop" class="flex-1 px-2 py-1.5 text-[11px] bg-primary-600 text-white rounded-lg hover:bg-primary-700">应用裁剪</button>
            <button @click="cancelCrop" class="flex-1 px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2">取消</button>
          </div>
        </div>

        <!-- Rotate/Flip controls -->
        <div v-if="activeTool === 'rotate'" class="space-y-3">
          <h4 class="text-xs font-medium text-text-secondary">旋转 / 翻转</h4>
          <div class="grid grid-cols-2 gap-2">
            <button @click="rotateImage(-90)" class="px-2 py-2 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">左转 90</button>
            <button @click="rotateImage(90)" class="px-2 py-2 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">右转 90</button>
            <button @click="flipImage('h')" class="px-2 py-2 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">水平翻转</button>
            <button @click="flipImage('v')" class="px-2 py-2 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">垂直翻转</button>
          </div>
        </div>

        <!-- Filter controls -->
        <div v-if="activeTool === 'filter'" class="space-y-3">
          <h4 class="text-xs font-medium text-text-secondary">滤镜</h4>
          <div v-for="f in filterControls" :key="f.key" class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-text-secondary">{{ f.label }}</span>
              <span class="text-[10px] text-text-tertiary w-8 text-right">{{ f.value }}</span>
            </div>
            <input type="range" :min="f.min" :max="f.max" :step="f.step" v-model.number="f.value" @input="applyFilters" class="w-full h-1 accent-primary-600" />
          </div>
          <div class="flex gap-2 pt-1">
            <button @click="applyPresetFilter('grayscale')" class="flex-1 px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">灰度</button>
            <button @click="applyPresetFilter('sepia')" class="flex-1 px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">复古</button>
            <button @click="applyPresetFilter('invert')" class="flex-1 px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-secondary">反色</button>
          </div>
          <button @click="resetFilters" class="w-full px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-tertiary">重置滤镜</button>
        </div>

        <!-- Text controls -->
        <div v-if="activeTool === 'text'" class="space-y-3">
          <h4 class="text-xs font-medium text-text-secondary">文字</h4>
          <div class="space-y-2">
            <input v-model="textContent" placeholder="输入文字内容" class="w-full px-2 py-1.5 text-xs border border-surface-3 rounded-lg bg-surface-0 outline-none focus:ring-1 focus:ring-primary-500" />
            <div class="flex gap-2">
              <select v-model="textFontSize" class="flex-1 px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg bg-surface-0 outline-none">
                <option :value="16">16px</option>
                <option :value="24">24px</option>
                <option :value="32">32px</option>
                <option :value="48">48px</option>
                <option :value="64">64px</option>
                <option :value="96">96px</option>
              </select>
              <input type="color" v-model="textColor" class="w-8 h-8 rounded border border-surface-3 cursor-pointer" />
            </div>
            <button @click="addText" class="w-full px-2 py-1.5 text-[11px] bg-primary-600 text-white rounded-lg hover:bg-primary-700">添加文字</button>
          </div>
        </div>

        <!-- Draw controls -->
        <div v-if="activeTool === 'draw'" class="space-y-3">
          <h4 class="text-xs font-medium text-text-secondary">画笔</h4>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-text-secondary">笔刷大小</span>
              <span class="text-[10px] text-text-tertiary">{{ drawBrushSize }}px</span>
            </div>
            <input type="range" min="1" max="50" v-model.number="drawBrushSize" @input="updateBrush" class="w-full h-1 accent-primary-600" />
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-text-secondary">颜色</span>
              <input type="color" v-model="drawColor" @input="updateBrush" class="w-6 h-6 rounded border border-surface-3 cursor-pointer" />
            </div>
          </div>
        </div>

        <!-- Inpaint controls -->
        <div v-if="activeTool === 'inpaint'" class="space-y-3">
          <h4 class="text-xs font-medium text-text-secondary">AI 局部重绘</h4>

          <!-- 涂抹方式 -->
          <div>
            <span class="text-[11px] text-text-secondary block mb-1">涂抹方式</span>
            <div class="grid grid-cols-4 gap-1">
              <button
                v-for="s in maskShapeOptions"
                :key="s.id"
                @click="setMaskShape(s.id)"
                :class="['px-1 py-1.5 text-[10px] rounded border transition-colors', maskShape === s.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-surface-3 text-text-tertiary hover:bg-surface-2']"
              >{{ s.label }}</button>
            </div>
          </div>

          <!-- 笔刷大小 -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-text-secondary">笔刷</span>
              <span class="text-[10px] text-text-tertiary">{{ maskBrushSize }}px</span>
            </div>
            <input type="range" min="5" max="100" v-model.number="maskBrushSize" @input="updateMaskBrush" class="w-full h-1 accent-orange-500" />
            <p class="text-[10px] text-text-tertiary mt-0.5">[ 缩小 ] 放大 · E 擦除 · I 反转 · Ctrl+Z 撤销笔触</p>
          </div>

          <!-- 羽化 -->
          <div>
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-text-secondary">边缘羽化</span>
              <span class="text-[10px] text-text-tertiary">{{ maskFeather }}px</span>
            </div>
            <input type="range" min="0" max="20" v-model.number="maskFeather" class="w-full h-1 accent-orange-500" />
          </div>

          <!-- Mask 操作 -->
          <div class="flex gap-1">
            <button @click="undoMaskStroke" :disabled="!canUndoMask" class="flex-1 px-1 py-1 text-[10px] border border-surface-3 rounded hover:bg-surface-2 text-text-tertiary disabled:opacity-40 disabled:cursor-not-allowed">撤销</button>
            <button @click="invertMask" class="flex-1 px-1 py-1 text-[10px] border border-surface-3 rounded hover:bg-surface-2 text-text-tertiary">反转</button>
            <button @click="clearMask" class="flex-1 px-1 py-1 text-[10px] border border-surface-3 rounded hover:bg-surface-2 text-text-tertiary">清除</button>
          </div>

          <div class="border-t border-surface-3 pt-3 space-y-2">
            <!-- 预设模板 -->
            <div>
              <label class="flex items-center gap-1.5 mb-1.5 cursor-pointer">
                <input type="checkbox" v-model="usePromptTemplate" class="w-3 h-3 accent-orange-500" />
                <span class="text-[11px] text-text-secondary">使用 prompt 模板</span>
              </label>
              <div v-if="usePromptTemplate" class="grid grid-cols-4 gap-1">
                <button
                  v-for="t in promptTemplates"
                  :key="t.id"
                  @click="activeTemplate = t.id"
                  :class="['px-1 py-1.5 text-[10px] rounded border transition-colors', activeTemplate === t.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-surface-3 text-text-tertiary hover:bg-surface-2']"
                >{{ t.label }}</button>
              </div>
            </div>

            <textarea
              v-model="inpaintPrompt"
              rows="3"
              :placeholder="usePromptTemplate ? currentTemplate().placeholder : '描述你想要重绘的内容...'"
              class="w-full px-2 py-1.5 text-xs border border-surface-3 rounded-lg bg-surface-0 outline-none focus:ring-1 focus:ring-primary-500 resize-none"
            ></textarea>

            <!-- 候选数 -->
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[11px] text-text-secondary">候选数</span>
                <span class="text-[10px] text-text-tertiary">{{ batchCount }} 张</span>
              </div>
              <input type="range" min="1" max="4" v-model.number="batchCount" class="w-full h-1 accent-orange-500" />
            </div>

            <div v-if="batchCount > 1">
              <div class="flex items-center justify-between">
                <span class="text-[11px] text-text-secondary" title="同时发起的请求数。过高可能触发服务商限流">并发数</span>
                <span class="text-[10px] text-text-tertiary">{{ concurrency }}</span>
              </div>
              <input type="range" :min="1" :max="batchCount" v-model.number="concurrency" class="w-full h-1 accent-orange-500" />
            </div>

            <!-- 高级选项 -->
            <div class="space-y-1.5">
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" v-model="compositeBlend" class="w-3 h-3 accent-orange-500" />
                <span class="text-[11px] text-text-secondary">合成模式（保留非遮罩区原像素）</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" v-model="keepEditLayers" class="w-3 h-3 accent-orange-500" />
                <span class="text-[11px] text-text-secondary">保留文字/画笔图层</span>
              </label>
            </div>

            <button
              @click="runInpaint"
              :disabled="inpainting"
              class="w-full px-2 py-2 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ inpainting ? (inpaintProgress.message || '重绘中...') : '开始重绘' }}
            </button>
            <button
              v-if="inpainting"
              @click="cancelInpaint"
              class="w-full px-2 py-1.5 text-[11px] border border-surface-3 rounded-lg hover:bg-surface-2 text-text-tertiary"
            >取消</button>
          </div>

          <!-- 历史 -->
          <div v-if="inpaintHistory.length > 0" class="border-t border-surface-3 pt-3">
            <h5 class="text-[11px] text-text-secondary mb-1.5">重绘历史</h5>
            <div class="space-y-1 max-h-48 overflow-y-auto">
              <div v-for="(h, i) in inpaintHistory" :key="i" class="flex gap-1.5 items-start p-1 rounded hover:bg-surface-2">
                <img :src="h.thumbnail" class="w-10 h-10 object-cover rounded border border-surface-3 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-[10px] text-text-secondary truncate" :title="h.prompt">{{ h.prompt }}</p>
                  <p class="text-[10px] text-text-tertiary">{{ formatTime(h.timestamp) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Canvas Area -->
      <div class="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0] relative" ref="canvasContainerRef">
        <div class="flex-1 flex items-center justify-center overflow-hidden p-6">
          <canvas ref="canvasRef"></canvas>
        </div>
        <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f0f0f0] z-10">
          <svg class="w-8 h-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
          <span class="text-xs text-text-tertiary">加载图片中...</span>
        </div>

        <!-- Compare overlay (candidate selection + split view) -->
        <div v-if="compareMode !== 'none'" class="absolute inset-0 z-20 flex flex-col bg-[#f0f0f0]">
          <!-- Toolbar -->
          <div class="bg-surface-0 border-b border-surface-3 px-3 py-2 flex items-center gap-2 flex-shrink-0">
            <span class="text-xs text-text-secondary">候选：</span>
            <button
              v-for="(_, i) in compareCandidates"
              :key="i"
              @click="compareSelectedIndex = i"
              :class="['w-7 h-7 text-xs rounded flex items-center justify-center transition-colors', compareSelectedIndex === i ? 'bg-orange-600 text-white' : 'border border-surface-3 text-text-tertiary hover:bg-surface-2']"
            >{{ i + 1 }}</button>
            <div class="flex-1"></div>
            <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" v-model="compareShowOriginal" class="w-3 h-3 accent-orange-500" />
              <span>对比原图</span>
            </label>
            <button @click="cancelCompare" class="px-3 py-1 text-xs border border-surface-3 rounded hover:bg-surface-2 text-text-tertiary">取消</button>
            <button @click="applyCompareResult" class="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700">应用</button>
          </div>

          <!-- Compare viewport -->
          <div class="flex-1 flex items-center justify-center overflow-hidden p-6 relative">
            <div class="relative inline-block">
              <!-- Candidate (bottom layer) -->
              <img
                :src="compareCandidates[compareSelectedIndex]"
                class="block max-w-full max-h-[calc(100vh-14rem)] object-contain"
              />
              <!-- Original overlay (clipped by split) -->
              <img
                v-if="compareShowOriginal && originalSnapshotDataUrl"
                :src="originalSnapshotDataUrl"
                class="absolute inset-0 w-full h-full object-contain pointer-events-none"
                :style="{ clipPath: 'inset(0 ' + (100 - compareSplit) + '% 0 0)' }"
              />
              <!-- Divider line -->
              <div
                v-if="compareShowOriginal && originalSnapshotDataUrl"
                class="absolute top-0 bottom-0 w-0.5 bg-orange-500 pointer-events-none"
                :style="{ left: compareSplit + '%' }"
              ></div>
            </div>
            <!-- Split slider -->
            <div v-if="compareShowOriginal && originalSnapshotDataUrl" class="absolute left-1/2 bottom-3 -translate-x-1/2 bg-surface-0 border border-surface-3 rounded-full px-3 py-1 shadow flex items-center gap-2 z-10">
              <span class="text-[10px] text-text-tertiary">原图</span>
              <input type="range" min="0" max="100" v-model.number="compareSplit" class="w-40 h-1 accent-orange-500" />
              <span class="text-[10px] text-text-tertiary">结果</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-surface-0 shadow-lg border border-surface-3 text-xs text-text-primary">{{ toast }}</div>

    <!-- O8: 生图模型设置弹窗 -->
    <ImageEditModelDialog
      v-model:visible="modelDialogVisible"
      :initial-provider-id="editProviderId"
      :initial-model-id="editModelId"
      @confirm="onModelConfirm"
    />

    <!-- O4-4: 另存到图库弹窗 -->
    <GallerySaveDialog
      v-model:visible="gallerySaveVisible"
      :preview-data-uri="gallerySaveDataUri"
      :default-name="gallerySaveDefaultName"
      @confirm="onGallerySaveConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Canvas, FabricImage, Rect, Ellipse, IText, PencilBrush, filters, Path, Point, Control, util } from 'fabric'
import type { FabricObject, TPointerEvent, Transform } from 'fabric'
import { recordUsage, warmHintsCache } from '@/utils/model-usage-hints'
import { translateError } from '@/utils/error-message'
import { useSiteConfigStore } from '@/stores/site-config'
import { useModelStore } from '@/stores/models'
import ImageEditModelDialog from '@/components/ImageEditModelDialog.vue'
import GallerySaveDialog from '@/components/GallerySaveDialog.vue'
import { useGalleryStore } from '@/stores/gallery'

const route = useRoute()
const router = useRouter()
const modelStore = useModelStore()
const siteConfig = useSiteConfigStore()
const api = () => (window as any).api

// ---- Refs ----
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasContainerRef = ref<HTMLElement | null>(null)

// Non-reactive Fabric state
let fabricCanvas: Canvas | null = null
let baseImage: FabricImage | null = null
let displayScale = 1
let originalW = 0
let originalH = 0

// ---- Reactive state ----
const loading = ref(true)
const saving = ref(false)
const inpainting = ref(false)
const toast = ref('')
const generation = ref<any>(null)
const activeTool = ref('select')

// O8: 用户在图片编辑里设置的生图模型（用 settings 持久化，跨打开记忆）
const editProviderId = ref('')
const editModelId = ref('')
const modelDialogVisible = ref(false)

// O4-4: 另存到图库弹窗
const galleryStore = useGalleryStore()
const gallerySaveVisible = ref(false)
const gallerySaveDataUri = ref('')
const gallerySaveDefaultName = ref('')

// Text tool
const textContent = ref('文字')
const textFontSize = ref(32)
const textColor = ref('#ffffff')

// Draw tool
const drawBrushSize = ref(5)
const drawColor = ref('#ff0000')

// Inpaint tool
type MaskShape = 'brush' | 'eraser' | 'rect' | 'ellipse'
interface InpaintHistoryEntry { thumbnail: string; prompt: string; timestamp: number }

const maskBrushSize = ref(30)
const inpaintPrompt = ref('')
const maskShape = ref<MaskShape>('brush')
const maskFeather = ref(3)
const usePromptTemplate = ref(true)
const activeTemplate = ref('replace')
const batchCount = ref(1)
const concurrency = ref(2)
const compositeBlend = ref(true)
const keepEditLayers = ref(false)
const inpaintProgress = ref({ completed: 0, total: 0, message: '' })
const inpaintHistory = ref<InpaintHistoryEntry[]>([])
let inpaintCancelled = false

// Mask-only stroke stack for in-paint undo (independent of global history)
// Initialize with an empty baseline snapshot so first stroke is immediately undoable
const maskStrokeStack = ref<any[][]>([[]])
const maskStrokeIndex = ref(0)
const canUndoMask = computed(() => maskStrokeIndex.value > 0)

// Compare / candidate review state
type CompareMode = 'none' | 'single' | 'multi'
const compareMode = ref<CompareMode>('none')
const compareCandidates = ref<string[]>([])
const compareSelectedIndex = ref(0)
const compareSplit = ref(50)
const compareShowOriginal = ref(true)
const originalSnapshotDataUrl = ref<string | null>(null)
const activeMaskDataUrl = ref<string | null>(null)

const maskShapeOptions: Array<{ id: MaskShape; label: string }> = [
  { id: 'brush', label: '画笔' },
  { id: 'eraser', label: '擦除' },
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '椭圆' }
]

const promptTemplates: Array<{ id: string; label: string; placeholder: string; allowEmpty?: boolean; wrap: (p: string) => string }> = [
  {
    id: 'replace',
    label: '替换',
    placeholder: '描述替换后的内容，例如：一只橘色的猫',
    wrap: (p) => `Replace the masked region with: ${p}. Preserve the original lighting, perspective, and style; keep the rest of the image unchanged.`
  },
  {
    id: 'remove',
    label: '移除',
    placeholder: '可留空，或描述要填补的背景',
    allowEmpty: true,
    wrap: (p) => p.trim()
      ? `Seamlessly remove the object in the masked region and fill with: ${p}. Match the surrounding texture, lighting, and style naturally.`
      : `Seamlessly remove the object in the masked region and fill it with the surrounding background content. Preserve lighting and style continuity.`
  },
  {
    id: 'fix',
    label: '修复',
    placeholder: '描述瑕疵，例如：去除划痕',
    wrap: (p) => `Restore and repair the masked region: ${p}. Keep the rest of the image untouched and match original style.`
  },
  {
    id: 'enhance',
    label: '增强',
    placeholder: '描述需要增强的细节',
    wrap: (p) => `Enhance and refine the masked region: ${p}. Preserve the original style and ensure consistent lighting across the image.`
  }
]

function currentTemplate() {
  return promptTemplates.find(t => t.id === activeTemplate.value) || promptTemplates[0]
}

function buildFinalPrompt(): string {
  const p = inpaintPrompt.value.trim()
  if (!usePromptTemplate.value) return p
  return currentTemplate().wrap(p)
}

// Filter state (Fabric filter values, non-destructive)
const filterControls = reactive([
  { key: 'brightness', label: '亮度', value: 0, min: -100, max: 100, step: 1 },
  { key: 'contrast', label: '对比度', value: 0, min: -100, max: 100, step: 1 },
  { key: 'saturation', label: '饱和度', value: 0, min: -100, max: 100, step: 1 },
  { key: 'blur', label: '模糊', value: 0, min: 0, max: 100, step: 1 },
])

// History (snapshot-based undo/redo)
const MAX_HISTORY = 20
const history = shallowRef<string[]>([])
const historyIndex = ref(-1)
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

// ---- Tools ----
const tools = [
  { id: 'select', label: '选择', icon: 'M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59' },
  { id: 'crop', label: '裁剪', icon: 'M7.848 8.25l1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.19.005.383 0 .575m0 0-1.647 1.647M15 3v18m6-6H3' },
  { id: 'rotate', label: '旋转/翻转', icon: 'M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3' },
  { id: 'filter', label: '滤镜', icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75' },
  { id: 'text', label: '文字', icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z' },
  { id: 'draw', label: '画笔', icon: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125' },
]

const showRightPanel = computed(() => ['crop', 'rotate', 'filter', 'text', 'draw', 'inpaint'].includes(activeTool.value))

// ---- Lifecycle ----
// Bug #6: 用 unsubscribe 模式，避免 offProgress() removeAllListeners 误清其他视图监听
let unsubscribeImageProgress: (() => void) | null = null

onMounted(async () => {
  const id = route.params.id as string
  if (!id) { router.back(); return }

  try {
    let absPath: string

    if (id === '_local') {
      // 本地图库编辑模式：从 query.path 加载文件，不查 image_generations 表。
      // generation.value 用 mock 对象，id='_local' 作 sentinel；保存时走 saveLocalEdited
      // 创建独立的新 image_generation 记录（不入图库 gallery_items，避免重复显示）。
      const localPath = route.query.path as string
      if (!localPath) {
        showToast('未指定图片路径')
        router.back()
        return
      }
      generation.value = {
        id: '_local',
        session_id: '',
        prompt: '',
        revised_prompt: '',
        ref_images: [],
        model_provider_id: '',
        model_id: '',
        size: '1:1',
        quality: 'auto',
        result_path: localPath,
        result_url: '',
        status: 'done',
        error: '',
        created_at: new Date().toISOString()
      } as any
      absPath = await api().imageGen.invoke('getAbsolutePath', localPath)
    } else {
      const gen = await api().imageGen.invoke('getGeneration', id)
      if (!gen || !gen.result_path) {
        showToast('图片数据不存在')
        router.back()
        return
      }
      generation.value = gen
      absPath = await api().imageGen.invoke('getAbsolutePath', gen.result_path)
    }

    await nextTick()
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    await initCanvas(absPath)

    // URL query 预设：从图像处理菜单 / 第三方入口跳过来时携带工具/模板/提示词，
    // 进入页面自动激活，让用户少点几下。仅当 canvas 就绪后调用 selectTool 才安全。
    applyEditPresetsFromQuery()

    // O8: 读出记忆的图片编辑生图模型；不存在则回退到当前 generation 的模型
    try {
      const all = (await api().settings.invoke('getAll')) as Record<string, string>
      if (all['imageedit_provider_id']) editProviderId.value = all['imageedit_provider_id']
      if (all['imageedit_model_id']) editModelId.value = all['imageedit_model_id']
      if (!editProviderId.value && generation.value?.model_provider_id) {
        editProviderId.value = generation.value.model_provider_id
        editModelId.value = generation.value.model_id || ''
      }
    } catch {
      // 设置读取失败不影响主流程
    }

    // 预热模型用法 LRU，让模型选择弹窗第一次打开时推荐顺序就是热的
    warmHintsCache().catch(() => {})

    window.addEventListener('keydown', handleKeyDown)
    unsubscribeImageProgress = api().imageGen.onProgress(handleImageGenProgress)
  } catch (e: any) {
    showToast('加载失败: ' + (e.message || ''))
    console.error(e)
  }
})

/**
 * 解析路由 query 上的预设并应用：
 *   - tool='inpaint' | 'crop' | 'rotate' | 'filter' | 'text' | 'draw'  → selectTool
 *   - template='replace' | 'remove' | 'fix' | 'enhance'                → 切 inpaint 模板
 *   - presetPrompt='...'                                                → 填入 inpaintPrompt
 *
 * 不在 query 里就保持默认（select 工具、空 prompt），不影响普通进入流程。
 */
function applyEditPresetsFromQuery() {
  const q = route.query
  const presetTool = typeof q.tool === 'string' ? q.tool : ''
  const presetTpl = typeof q.template === 'string' ? q.template : ''
  const presetPrompt = typeof q.presetPrompt === 'string' ? q.presetPrompt : ''

  if (presetTool && ['select', 'crop', 'rotate', 'filter', 'text', 'draw', 'inpaint'].includes(presetTool)) {
    selectTool(presetTool)
  }
  if (presetTpl && ['replace', 'remove', 'fix', 'enhance'].includes(presetTpl)) {
    activeTemplate.value = presetTpl
    usePromptTemplate.value = true
  }
  if (presetPrompt) {
    inpaintPrompt.value = presetPrompt
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (unsubscribeImageProgress) {
    try { unsubscribeImageProgress() } catch {}
    unsubscribeImageProgress = null
  }
  if (fabricCanvas) {
    fabricCanvas.dispose()
    fabricCanvas = null
  }
  baseImage = null
})

function handleImageGenProgress(data: any) {
  if (!inpainting.value || !data) return
  if (data.type === 'start') {
    inpaintProgress.value = { completed: 0, total: data.total || 1, message: `准备生成 ${data.total || 1} 张...` }
  } else if (data.type === 'generating') {
    inpaintProgress.value.message = `生成中 ${(data.completed || 0) + 1}/${data.total || 1}`
  } else if (data.type === 'completed') {
    inpaintProgress.value.completed = data.completed || 0
    inpaintProgress.value.message = `已完成 ${data.completed || 0}/${data.total || 1}`
  } else if (data.type === 'done') {
    inpaintProgress.value.message = '处理结果中...'
  } else if (data.type === 'error') {
    inpaintProgress.value.message = `第 ${(data.index || 0) + 1} 张失败`
  }
}

function handleKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return

  // Inpaint-only shortcuts
  if (activeTool.value === 'inpaint') {
    if (e.key === '[') {
      e.preventDefault()
      maskBrushSize.value = Math.max(5, maskBrushSize.value - 5)
      updateMaskBrush()
      return
    }
    if (e.key === ']') {
      e.preventDefault()
      maskBrushSize.value = Math.min(100, maskBrushSize.value + 5)
      updateMaskBrush()
      return
    }
    if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      setMaskShape(maskShape.value === 'eraser' ? 'brush' : 'eraser')
      return
    }
    if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (hasAnyMask()) invertMask()
      return
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault()
    // In inpaint mode, Ctrl+Z prefers mask-level undo if possible
    if (activeTool.value === 'inpaint' && canUndoMask.value) {
      undoMaskStroke()
    } else {
      undo()
    }
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteActiveObject()
  } else if (e.key === 'Escape' && compareMode.value !== 'none') {
    e.preventDefault()
    cancelCompare()
  }
}

// ---- Canvas Init ----
async function initCanvas(imagePath: string) {
  if (!canvasRef.value || !canvasContainerRef.value) return

  // Load image via HTMLImageElement (handles local-file:// protocol), then convert to dataURL
  const imgEl = new Image()
  await new Promise<void>((resolve, reject) => {
    imgEl.onload = () => resolve()
    imgEl.onerror = () => reject(new Error('Failed to load image'))
    imgEl.src = 'local-file://img?p=' + encodeURIComponent(imagePath)
  })

  originalW = imgEl.naturalWidth
  originalH = imgEl.naturalHeight

  // Convert to dataURL for serializable FabricImage
  const dataUrl = imageToDataURL(imgEl)

  // Compute display dimensions
  const { canvasW, canvasH, scale } = computeFitSize(originalW, originalH)
  displayScale = scale

  // Create Fabric Canvas
  fabricCanvas = new Canvas(canvasRef.value, {
    width: canvasW,
    height: canvasH,
    backgroundColor: '#ffffff',
  })

  // Load base image
  await setBaseImage(dataUrl, canvasW, canvasH)

  // O7：滚轮缩放（以画布中心为锚点）；min 0.2x ~ max 5x，缩放同时刷新画笔圆圈光标尺寸
  fabricCanvas.on('mouse:wheel', (opt: any) => {
    if (!fabricCanvas) return
    const delta = opt.e.deltaY
    let zoom = fabricCanvas.getZoom()
    zoom *= 0.999 ** delta
    if (zoom > 5) zoom = 5
    if (zoom < 0.2) zoom = 0.2
    const cx = fabricCanvas.getWidth() / 2
    const cy = fabricCanvas.getHeight() / 2
    fabricCanvas.zoomToPoint(new Point(cx, cy), zoom)
    opt.e.preventDefault()
    opt.e.stopPropagation()
    refreshBrushCursor()
  })

  // Hook path:created to tag brush strokes by role and ensure visibility
  fabricCanvas.on('path:created', (e: any) => {
    const path = e.path as Path
    if (!path) return
    let role: string
    if (activeTool.value === 'inpaint') {
      role = maskShape.value === 'eraser' ? 'mask-erase' : 'mask'
      ;(path as any).data = { role }
      // mask/mask-erase paths are non-interactive; they should not show selection controls
      ;(path as any).selectable = false
      ;(path as any).evented = false
      fabricCanvas!.bringObjectToFront(path)
      fabricCanvas!.requestRenderAll()
      pushMaskHistory()
    } else {
      ;(path as any).data = { role: 'draw' }
      attachDeleteControl(path)
      fabricCanvas!.bringObjectToFront(path)
      fabricCanvas!.requestRenderAll()
      saveHistory()
    }
  })

  // Initial history snapshot
  saveHistory()

  loading.value = false

  // Recalculate mouse offset after canvas becomes visible
  await nextTick()
  await new Promise<void>(r => requestAnimationFrame(() => r()))
  fabricCanvas.calcOffset()
}

function imageToDataURL(img: HTMLImageElement): string {
  const tmp = document.createElement('canvas')
  tmp.width = img.naturalWidth
  tmp.height = img.naturalHeight
  tmp.getContext('2d')!.drawImage(img, 0, 0)
  return tmp.toDataURL('image/png')
}

function computeFitSize(origW: number, origH: number): { canvasW: number; canvasH: number; scale: number } {
  const container = canvasContainerRef.value!
  const rect = container.getBoundingClientRect()
  const containerW = Math.max(rect.width - 48, 200)
  const containerH = Math.max(rect.height - 48, 200)
  const scale = Math.min(containerW / origW, containerH / origH, 1)
  return {
    canvasW: Math.round(origW * scale),
    canvasH: Math.round(origH * scale),
    scale,
  }
}

async function setBaseImage(dataUrl: string, canvasW: number, canvasH: number) {
  if (!fabricCanvas) return

  // Remove existing base image
  if (baseImage) {
    fabricCanvas.remove(baseImage)
    baseImage = null
  }

  const img = await FabricImage.fromURL(dataUrl)
  img.set({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    scaleX: canvasW / img.width!,
    scaleY: canvasH / img.height!,
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
  })
  ;(img as any).data = { role: 'base' }

  baseImage = img
  fabricCanvas.add(img)
  fabricCanvas.sendObjectToBack(img)
  fabricCanvas.renderAll()
}

// ---- History ----
function saveHistory() {
  if (!fabricCanvas) return
  const snapshot = serializeCanvas()
  const trimmed = history.value.slice(0, historyIndex.value + 1)
  trimmed.push(snapshot)
  if (trimmed.length > MAX_HISTORY) trimmed.shift()
  history.value = trimmed
  historyIndex.value = trimmed.length - 1
}

function serializeCanvas(): string {
  if (!fabricCanvas) return ''
  return JSON.stringify({
    canvas: (fabricCanvas as any).toJSON(['data']),
    meta: {
      displayScale,
      originalW,
      originalH,
      width: fabricCanvas.width,
      height: fabricCanvas.height,
      filters: {
        brightness: filterControls[0].value,
        contrast: filterControls[1].value,
        saturation: filterControls[2].value,
        blur: filterControls[3].value,
      },
    },
  })
}

async function restoreSnapshot(snapshot: string) {
  if (!fabricCanvas) return
  const parsed = JSON.parse(snapshot)
  const meta = parsed.meta

  displayScale = meta.displayScale
  originalW = meta.originalW
  originalH = meta.originalH

  filterControls[0].value = meta.filters.brightness
  filterControls[1].value = meta.filters.contrast
  filterControls[2].value = meta.filters.saturation
  filterControls[3].value = meta.filters.blur

  fabricCanvas.setDimensions({ width: meta.width, height: meta.height })
  await fabricCanvas.loadFromJSON(parsed.canvas)

  // Find base image after reload
  baseImage = fabricCanvas.getObjects().find((o: any) => o.data?.role === 'base') as FabricImage | null
  if (baseImage) {
    baseImage.set({
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    })
    fabricCanvas.sendObjectToBack(baseImage)
  }

  fabricCanvas.renderAll()
}

async function undo() {
  if (!canUndo.value) return
  historyIndex.value--
  await restoreSnapshot(history.value[historyIndex.value])
}

async function redo() {
  if (!canRedo.value) return
  historyIndex.value++
  await restoreSnapshot(history.value[historyIndex.value])
}

// ---- Tool Selection ----
function selectTool(toolId: string) {
  if (!fabricCanvas) return

  // Always exit drawing mode and reset cursor
  fabricCanvas.isDrawingMode = false
  fabricCanvas.defaultCursor = 'default'
  fabricCanvas.freeDrawingCursor = 'crosshair'
  removeCropRect()

  activeTool.value = toolId

  const isDrawing = toolId === 'draw' || toolId === 'inpaint'

  // Enable marquee selection and per-object interaction for all non-drawing modes
  fabricCanvas.selection = !isDrawing
  fabricCanvas.forEachObject(obj => {
    if ((obj as any).data?.role === 'base') return
    obj.selectable = !isDrawing
    obj.evented = !isDrawing
  })

  if (toolId === 'draw') {
    fabricCanvas.isDrawingMode = true
    const brush = new PencilBrush(fabricCanvas)
    brush.width = drawBrushSize.value
    brush.color = drawColor.value
    fabricCanvas.freeDrawingBrush = brush
    removeShapeListeners()
    refreshBrushCursor()
  } else if (toolId === 'inpaint') {
    applyMaskShapeMode()
  } else if (toolId === 'crop') {
    initCrop()
    removeShapeListeners()
  } else {
    removeShapeListeners()
  }

  fabricCanvas.requestRenderAll()
}

function setMaskShape(shape: MaskShape) {
  maskShape.value = shape
  if (activeTool.value !== 'inpaint') return
  applyMaskShapeMode()
}

function applyMaskShapeMode() {
  if (!fabricCanvas) return
  removeShapeListeners()
  if (maskShape.value === 'brush' || maskShape.value === 'eraser') {
    fabricCanvas.isDrawingMode = true
    const brush = new PencilBrush(fabricCanvas)
    brush.width = maskBrushSize.value
    brush.color = maskShape.value === 'eraser' ? 'rgba(80, 80, 80, 0.55)' : 'rgba(255, 0, 0, 0.4)'
    fabricCanvas.freeDrawingBrush = brush
    refreshBrushCursor()
  } else {
    fabricCanvas.isDrawingMode = false
    fabricCanvas.defaultCursor = 'crosshair'
    addShapeListeners()
  }
}

/**
 * O6: 构造圆圈画笔光标的 SVG data URI。
 * 圆形 + 中心十字辅助点（双色描边，浅色背景与深色背景都能看清）。
 */
function buildBrushCursor(diameter: number, ringColor: string): string {
  const d = Math.max(6, Math.min(256, diameter))
  const r = d / 2
  const pad = 2
  const size = d + pad * 2
  const cx = r + pad
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="white" stroke-width="2.5"/>` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${ringColor}" stroke-width="1.2"/>` +
    `<circle cx="${cx}" cy="${cx}" r="1.5" fill="${ringColor}"/>` +
    `</svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  return `url("${url}") ${cx} ${cx}, crosshair`
}

/**
 * O6 + O7: 根据当前激活工具计算画笔光标 px 大小（含 zoom 比例），并更新 fabric.
 * 当工具/笔刷尺寸/zoom 变化时都应调用此函数。
 */
function refreshBrushCursor() {
  if (!fabricCanvas) return
  const zoom = fabricCanvas.getZoom() || 1
  if (activeTool.value === 'draw') {
    const px = drawBrushSize.value * zoom
    const cursor = buildBrushCursor(px, drawColor.value)
    fabricCanvas.freeDrawingCursor = cursor
    fabricCanvas.defaultCursor = cursor
  } else if (activeTool.value === 'inpaint' && (maskShape.value === 'brush' || maskShape.value === 'eraser')) {
    const px = maskBrushSize.value * zoom
    const ring = maskShape.value === 'eraser' ? '#888888' : '#f97316'
    const cursor = buildBrushCursor(px, ring)
    fabricCanvas.freeDrawingCursor = cursor
    fabricCanvas.defaultCursor = cursor
  }
}

// ---- Shape drag drawing (rect / ellipse mask) ----
let shapeStart: { x: number; y: number } | null = null
let shapePreview: FabricObject | null = null

function onShapeMouseDown(opt: any) {
  if (!fabricCanvas) return
  const pointer = fabricCanvas.getScenePoint(opt.e)
  shapeStart = { x: pointer.x, y: pointer.y }
  if (maskShape.value === 'rect') {
    shapePreview = new Rect({
      left: pointer.x,
      top: pointer.y,
      originX: 'left',
      originY: 'top',
      width: 1,
      height: 1,
      fill: 'rgba(255, 0, 0, 0.4)',
      stroke: '#ef4444',
      strokeWidth: 1,
      selectable: false,
      evented: false
    })
  } else if (maskShape.value === 'ellipse') {
    shapePreview = new Ellipse({
      left: pointer.x,
      top: pointer.y,
      originX: 'left',
      originY: 'top',
      rx: 1,
      ry: 1,
      fill: 'rgba(255, 0, 0, 0.4)',
      stroke: '#ef4444',
      strokeWidth: 1,
      selectable: false,
      evented: false
    })
  } else {
    return
  }
  ;(shapePreview as any).data = { role: 'mask-shape-preview' }
  fabricCanvas.add(shapePreview)
}

function onShapeMouseMove(opt: any) {
  if (!fabricCanvas || !shapeStart || !shapePreview) return
  const pointer = fabricCanvas.getScenePoint(opt.e)
  const left = Math.min(shapeStart.x, pointer.x)
  const top = Math.min(shapeStart.y, pointer.y)
  const w = Math.abs(pointer.x - shapeStart.x)
  const h = Math.abs(pointer.y - shapeStart.y)
  if (maskShape.value === 'rect') {
    shapePreview.set({ left, top, width: w, height: h })
  } else if (maskShape.value === 'ellipse') {
    ;(shapePreview as any).set({ left, top, rx: w / 2, ry: h / 2, width: w, height: h })
  }
  shapePreview.setCoords()
  fabricCanvas.requestRenderAll()
}

function onShapeMouseUp() {
  if (!fabricCanvas || !shapePreview) {
    shapeStart = null
    shapePreview = null
    return
  }
  const w = (shapePreview as any).width || 0
  const h = (shapePreview as any).height || 0
  if (w < 4 || h < 4) {
    fabricCanvas.remove(shapePreview)
  } else {
    ;(shapePreview as any).set({ stroke: '', strokeWidth: 0 })
    ;(shapePreview as any).data = { role: 'mask-shape' }
    pushMaskHistory()
  }
  fabricCanvas.requestRenderAll()
  shapeStart = null
  shapePreview = null
}

function addShapeListeners() {
  if (!fabricCanvas) return
  fabricCanvas.on('mouse:down', onShapeMouseDown)
  fabricCanvas.on('mouse:move', onShapeMouseMove)
  fabricCanvas.on('mouse:up', onShapeMouseUp)
}

function removeShapeListeners() {
  if (!fabricCanvas) return
  fabricCanvas.off('mouse:down', onShapeMouseDown)
  fabricCanvas.off('mouse:move', onShapeMouseMove)
  fabricCanvas.off('mouse:up', onShapeMouseUp)
  if (shapePreview) {
    fabricCanvas.remove(shapePreview)
    shapePreview = null
  }
  shapeStart = null
}

function deleteActiveObject() {
  if (!fabricCanvas) return
  const active = fabricCanvas.getActiveObject()
  if (!active) return
  if ((active as any).data?.role === 'base') return
  fabricCanvas.remove(active)
  fabricCanvas.discardActiveObject()
  fabricCanvas.renderAll()
  saveHistory()
}

// ---- Crop ----
let cropRect: Rect | null = null

function initCrop() {
  if (!fabricCanvas) return
  const w = fabricCanvas.width!
  const h = fabricCanvas.height!
  cropRect = new Rect({
    left: w * 0.1,
    top: h * 0.1,
    originX: 'left',
    originY: 'top',
    width: w * 0.8,
    height: h * 0.8,
    fill: 'rgba(0,0,0,0)',
    stroke: '#3b82f6',
    strokeWidth: 2,
    strokeDashArray: [5, 5],
    cornerColor: '#3b82f6',
    cornerSize: 8,
    transparentCorners: false,
    selectable: true,
    evented: true,
  })
  ;(cropRect as any).data = { role: 'crop-rect' }
  fabricCanvas.add(cropRect)
  fabricCanvas.setActiveObject(cropRect)
  fabricCanvas.renderAll()
}

function removeCropRect() {
  if (cropRect && fabricCanvas) {
    fabricCanvas.remove(cropRect)
    cropRect = null
  }
}

async function applyCrop() {
  if (!fabricCanvas || !cropRect || !baseImage) return

  // Compute crop in original image coordinates
  const left = ((cropRect.left || 0) - (baseImage.left || 0)) / displayScale
  const top = ((cropRect.top || 0) - (baseImage.top || 0)) / displayScale
  const width = ((cropRect.width || 0) * (cropRect.scaleX || 1)) / displayScale
  const height = ((cropRect.height || 0) * (cropRect.scaleY || 1)) / displayScale

  // Flatten the entire canvas (including text, brush, filters) into a single image
  const flat = await flattenToImage()
  if (!flat) return

  const tmp = document.createElement('canvas')
  tmp.width = Math.round(width)
  tmp.height = Math.round(height)
  const ctx = tmp.getContext('2d')!
  ctx.drawImage(flat, left, top, width, height, 0, 0, tmp.width, tmp.height)

  const newDataUrl = tmp.toDataURL('image/png')
  resetFilterValues()
  await replaceBaseImage(newDataUrl, tmp.width, tmp.height)

  removeCropRect()
  activeTool.value = 'select'
  showToast('裁剪已应用')
  saveHistory()
}

// Bake the current canvas (excluding masks and cropRect) into a single HTMLImageElement at original resolution
async function flattenToImage(): Promise<HTMLImageElement | null> {
  if (!fabricCanvas) return null
  const hidden: FabricObject[] = []
  fabricCanvas.getObjects().forEach((o) => {
    const role = (o as any).data?.role
    if (role === 'mask' || role === 'crop-rect') {
      if (o.visible !== false) {
        hidden.push(o)
        o.visible = false
      }
    }
  })
  fabricCanvas.discardActiveObject()
  fabricCanvas.requestRenderAll()
  try {
    const dataUrl = await getCanvasDataUrl()
    if (!dataUrl) return null
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('flatten failed'))
      img.src = dataUrl
    })
  } finally {
    hidden.forEach((o) => { o.visible = true })
    fabricCanvas.requestRenderAll()
  }
}

function cancelCrop() {
  removeCropRect()
  activeTool.value = 'select'
}

// Replace base image and refit canvas to new dimensions
async function replaceBaseImage(dataUrl: string, newOrigW: number, newOrigH: number) {
  if (!fabricCanvas) return
  originalW = newOrigW
  originalH = newOrigH

  const { canvasW, canvasH, scale } = computeFitSize(newOrigW, newOrigH)
  displayScale = scale

  // Remove non-base objects if dimensions change significantly (they may be out of bounds)
  const nonBase = fabricCanvas.getObjects().filter(o => (o as any).data?.role !== 'base')
  nonBase.forEach(o => fabricCanvas!.remove(o))

  fabricCanvas.setDimensions({ width: canvasW, height: canvasH })

  await setBaseImage(dataUrl, canvasW, canvasH)
  // Re-apply filters to the new base image
  reapplyFilters(false)

  await nextTick()
  fabricCanvas.calcOffset()
}

// ---- Rotate / Flip ----
async function rotateImage(degrees: number) {
  if (!baseImage) return
  const flat = await flattenToImage()
  if (!flat) return
  const w = flat.naturalWidth
  const h = flat.naturalHeight

  const tmp = document.createElement('canvas')
  const ctx = tmp.getContext('2d')!

  if (Math.abs(degrees) === 90) {
    tmp.width = h
    tmp.height = w
    ctx.translate(tmp.width / 2, tmp.height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(flat, -w / 2, -h / 2)
  } else {
    tmp.width = w
    tmp.height = h
    ctx.translate(w / 2, h / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(flat, -w / 2, -h / 2)
  }

  const newDataUrl = tmp.toDataURL('image/png')
  resetFilterValues()
  await replaceBaseImage(newDataUrl, tmp.width, tmp.height)
  saveHistory()
}

async function flipImage(direction: 'h' | 'v') {
  if (!baseImage) return
  const flat = await flattenToImage()
  if (!flat) return
  const w = flat.naturalWidth
  const h = flat.naturalHeight

  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const ctx = tmp.getContext('2d')!

  if (direction === 'h') {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  } else {
    ctx.translate(0, h)
    ctx.scale(1, -1)
  }
  ctx.drawImage(flat, 0, 0)

  const newDataUrl = tmp.toDataURL('image/png')
  resetFilterValues()
  await replaceBaseImage(newDataUrl, tmp.width, tmp.height)
  saveHistory()
}

// ---- Filters (non-destructive, Fabric built-in) ----
function buildFilterPipeline() {
  const list: any[] = []
  const brightness = filterControls[0].value / 100
  const contrast = filterControls[1].value / 100
  const saturation = filterControls[2].value / 100
  const blur = filterControls[3].value / 100

  if (brightness !== 0) list.push(new filters.Brightness({ brightness }))
  if (contrast !== 0) list.push(new filters.Contrast({ contrast }))
  if (saturation !== 0) list.push(new filters.Saturation({ saturation }))
  if (blur > 0) list.push(new filters.Blur({ blur: blur * 0.5 }))
  return list
}

function applyFilters() {
  reapplyFilters(true)
}

function reapplyFilters(record: boolean) {
  if (!baseImage || !fabricCanvas) return
  baseImage.filters = buildFilterPipeline()
  baseImage.applyFilters()
  fabricCanvas.renderAll()
  if (record) saveHistoryDebounced()
}

// Debounce saveHistory for rapid slider events
let historyTimer: number | null = null
function saveHistoryDebounced() {
  if (historyTimer !== null) window.clearTimeout(historyTimer)
  historyTimer = window.setTimeout(() => {
    saveHistory()
    historyTimer = null
  }, 400)
}

function applyPresetFilter(preset: 'grayscale' | 'sepia' | 'invert') {
  if (!baseImage || !fabricCanvas) return
  const existing = baseImage.filters || []
  const filterMap = { grayscale: filters.Grayscale, sepia: filters.Sepia, invert: filters.Invert }
  existing.push(new (filterMap[preset])())
  baseImage.filters = existing
  baseImage.applyFilters()
  fabricCanvas.renderAll()
  saveHistory()
}

function resetFilters() {
  resetFilterValues()
  if (!baseImage || !fabricCanvas) return
  baseImage.filters = []
  baseImage.applyFilters()
  fabricCanvas.renderAll()
  saveHistory()
}

function resetFilterValues() {
  filterControls[0].value = 0
  filterControls[1].value = 0
  filterControls[2].value = 0
  filterControls[3].value = 0
}

// ---- Text ----
function addText() {
  if (!fabricCanvas) return
  const text = new IText(textContent.value, {
    left: (fabricCanvas.width || 200) / 2 - 50,
    top: (fabricCanvas.height || 200) / 2 - 20,
    originX: 'left',
    originY: 'top',
    fontSize: textFontSize.value,
    fill: textColor.value,
    fontFamily: 'sans-serif',
    selectable: true,
    editable: true,
  } as any)
  ;(text as any).data = { role: 'text' }

  // On scaling, convert scale to fontSize so text does not distort
  text.on('scaling', function (this: IText) {
    const newFontSize = Math.max(8, Math.round((this.fontSize || 16) * (this.scaleX || 1)))
    this.set({ fontSize: newFontSize, scaleX: 1, scaleY: 1 })
  })

  attachDeleteControl(text as unknown as FabricObject)
  fabricCanvas.add(text)
  fabricCanvas.bringObjectToFront(text)
  fabricCanvas.setActiveObject(text)
  fabricCanvas.renderAll()
  saveHistory()
}

// ---- Delete control (X button on selected objects) ----
function attachDeleteControl(obj: FabricObject) {
  ;(obj as any).controls = {
    ...(obj as any).controls,
    deleteControl: new Control({
      x: 0.5,
      y: -0.5,
      offsetX: 16,
      offsetY: -16,
      cursorStyle: 'pointer',
      mouseUpHandler: onDeleteControlClick,
      render: renderDeleteIcon,
      sizeX: 22,
      sizeY: 22,
    }),
  }
}

function onDeleteControlClick(_e: TPointerEvent, transform: Transform): boolean {
  const target = transform.target
  const canvas = target.canvas
  if (!canvas) return false
  canvas.remove(target)
  canvas.discardActiveObject()
  canvas.requestRenderAll()
  saveHistory()
  return true
}

function renderDeleteIcon(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: any,
  fabricObject: FabricObject,
) {
  const size = 22
  ctx.save()
  ctx.translate(left, top)
  ctx.rotate(util.degreesToRadians(fabricObject.angle || 0))
  // Red filled circle
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
  ctx.fill()
  // White X
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-5, -5)
  ctx.lineTo(5, 5)
  ctx.moveTo(5, -5)
  ctx.lineTo(-5, 5)
  ctx.stroke()
  ctx.restore()
}

// ---- Draw ----
function updateBrush() {
  if (!fabricCanvas || !fabricCanvas.freeDrawingBrush) return
  fabricCanvas.freeDrawingBrush.width = drawBrushSize.value
  fabricCanvas.freeDrawingBrush.color = drawColor.value
  refreshBrushCursor()
}

// ---- Inpaint Mask ----
function updateMaskBrush() {
  if (!fabricCanvas || !fabricCanvas.freeDrawingBrush || activeTool.value !== 'inpaint') return
  fabricCanvas.freeDrawingBrush.width = maskBrushSize.value
  refreshBrushCursor()
}

function clearMask() {
  if (!fabricCanvas) return
  // Remove paths with role 'mask' or 'mask-erase' plus any mask shapes
  const masks = fabricCanvas.getObjects().filter(o => {
    const role = (o as any).data?.role
    return role === 'mask' || role === 'mask-erase' || role === 'mask-shape'
  })
  masks.forEach(p => fabricCanvas!.remove(p))
  fabricCanvas.renderAll()
  resetMaskHistory()
}

function resetMaskHistory() {
  // Keep an empty baseline so the first stroke after reset can still be undone
  maskStrokeStack.value = [[]]
  maskStrokeIndex.value = 0
}

function pushMaskHistory() {
  if (!fabricCanvas) return
  const snapshot = fabricCanvas.getObjects()
    .filter(o => {
      const role = (o as any).data?.role
      return role === 'mask' || role === 'mask-erase' || role === 'mask-shape'
    })
    .map(o => (o as any).toObject(['data']))
  const trimmed = maskStrokeStack.value.slice(0, maskStrokeIndex.value + 1)
  trimmed.push(snapshot)
  if (trimmed.length > 30) trimmed.shift()
  maskStrokeStack.value = trimmed
  maskStrokeIndex.value = trimmed.length - 1
}

async function undoMaskStroke() {
  if (!canUndoMask.value || !fabricCanvas) return
  maskStrokeIndex.value--
  // Remove all current mask objects
  const existing = fabricCanvas.getObjects().filter(o => {
    const role = (o as any).data?.role
    return role === 'mask' || role === 'mask-erase' || role === 'mask-shape'
  })
  existing.forEach(o => fabricCanvas!.remove(o))

  // Restore from snapshot
  const snapshot = maskStrokeStack.value[maskStrokeIndex.value] || []
  for (const obj of snapshot) {
    const enlivened = await util.enlivenObjects([obj]) as FabricObject[]
    for (const e of enlivened) {
      fabricCanvas.add(e)
    }
  }
  fabricCanvas.renderAll()
}

function invertMask() {
  if (!fabricCanvas) return
  const hasAny = fabricCanvas.getObjects().some(o => {
    const role = (o as any).data?.role
    return role === 'mask' || role === 'mask-erase' || role === 'mask-shape'
  })
  if (!hasAny) {
    showToast('请先涂抹区域再反转')
    return
  }
  // Add a full-canvas mask rect with role 'mask-shape' and toggle existing masks to mask-erase
  const w = fabricCanvas.width!
  const h = fabricCanvas.height!
  const fullRect = new Rect({
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    width: w,
    height: h,
    fill: 'rgba(255, 0, 0, 0.4)',
    stroke: '',
    strokeWidth: 0,
    selectable: false,
    evented: false
  })
  ;(fullRect as any).data = { role: 'mask-shape', invertFull: true }

  // Switch existing role 'mask' to 'mask-erase' (and vice versa) for the paths
  fabricCanvas.getObjects().forEach(o => {
    const role = (o as any).data?.role
    if (role === 'mask') {
      ;(o as any).data = { ...(o as any).data, role: 'mask-erase' }
    } else if (role === 'mask-erase') {
      ;(o as any).data = { ...(o as any).data, role: 'mask' }
    } else if (role === 'mask-shape' && !(o as any).data?.invertFull) {
      ;(o as any).data = { ...(o as any).data, role: 'mask-shape-erase' }
    } else if (role === 'mask-shape-erase') {
      ;(o as any).data = { ...(o as any).data, role: 'mask-shape' }
    }
  })

  fabricCanvas.add(fullRect)
  fabricCanvas.renderAll()
  pushMaskHistory()
}

function generateMaskDataURL(): string | null {
  if (!fabricCanvas) return null
  const objects = fabricCanvas.getObjects()
  const maskObjects = objects.filter(o => {
    const role = (o as any).data?.role
    return role === 'mask' || role === 'mask-erase' || role === 'mask-shape' || role === 'mask-shape-erase'
  })
  if (maskObjects.length === 0) return null

  // Ordered draw: reproduce canvas add order, white (paint) vs black (erase) by role
  const tmp = document.createElement('canvas')
  tmp.width = originalW
  tmp.height = originalH
  const ctx = tmp.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, originalW, originalH)

  const scaleRatio = originalW / fabricCanvas.width!
  ctx.save()
  ctx.scale(scaleRatio, scaleRatio)

  maskObjects.forEach((obj: any) => {
    const role = obj.data?.role
    const isErase = role === 'mask-erase' || role === 'mask-shape-erase'
    const color = isErase ? '#000000' : '#ffffff'

    if (role === 'mask' || role === 'mask-erase') {
      // Path
      const pathData = obj.path
      if (!pathData) return
      const left = obj.left || 0
      const top = obj.top || 0
      ctx.save()
      ctx.translate(left, top)
      ctx.strokeStyle = color
      ctx.lineWidth = obj.strokeWidth || maskBrushSize.value
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const p2d = new Path2D()
      for (const seg of pathData) {
        if (seg[0] === 'M') p2d.moveTo(seg[1], seg[2])
        else if (seg[0] === 'Q') p2d.quadraticCurveTo(seg[1], seg[2], seg[3], seg[4])
        else if (seg[0] === 'L') p2d.lineTo(seg[1], seg[2])
      }
      ctx.stroke(p2d)
      ctx.restore()
    } else if (role === 'mask-shape' || role === 'mask-shape-erase') {
      // Rect or Ellipse shape
      ctx.save()
      ctx.fillStyle = color
      const left = obj.left || 0
      const top = obj.top || 0
      const scaleX = obj.scaleX || 1
      const scaleY = obj.scaleY || 1
      const width = (obj.width || 0) * scaleX
      const height = (obj.height || 0) * scaleY
      // Fabric 7 uses PascalCase type strings ('Ellipse', 'Rect'); also fall back to rx/ry detection
      const isEllipse = obj.type === 'Ellipse' || obj.type === 'ellipse' || (typeof obj.rx === 'number' && typeof obj.ry === 'number')
      if (isEllipse) {
        const rx = ((obj.rx || 0) * scaleX)
        const ry = ((obj.ry || 0) * scaleY)
        const cx = left + rx
        const cy = top + ry
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(left, top, width, height)
      }
      ctx.restore()
    }
  })

  ctx.restore()

  // Apply feather (gaussian blur on mask edges)
  if (maskFeather.value > 0) {
    const feathered = document.createElement('canvas')
    feathered.width = tmp.width
    feathered.height = tmp.height
    const fctx = feathered.getContext('2d')!
    fctx.fillStyle = '#000000'
    fctx.fillRect(0, 0, feathered.width, feathered.height)
    // Scale feather with image dimensions for consistent visual effect
    const featherPx = Math.max(1, Math.round(maskFeather.value * scaleRatio))
    fctx.filter = `blur(${featherPx}px)`
    fctx.drawImage(tmp, 0, 0)
    return feathered.toDataURL('image/png')
  }

  return tmp.toDataURL('image/png')
}

function hasAnyMask(): boolean {
  if (!fabricCanvas) return false
  return fabricCanvas.getObjects().some(o => {
    const role = (o as any).data?.role
    return role === 'mask' || role === 'mask-erase' || role === 'mask-shape' || role === 'mask-shape-erase'
  })
}

// ---- Size inference ----
const SIZE_RATIOS: Array<{ key: string; ratio: number }> = [
  { key: '1:1', ratio: 1 },
  { key: '3:2', ratio: 1.5 },
  { key: '2:3', ratio: 2 / 3 },
  { key: '3:4', ratio: 0.75 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '4:5', ratio: 0.8 },
  { key: '5:4', ratio: 1.25 },
  { key: '16:9', ratio: 16 / 9 },
  { key: '9:16', ratio: 9 / 16 },
  { key: '21:9', ratio: 21 / 9 }
]

function inferSizeKey(w: number, h: number, fallback: string): string {
  const ratio = w / h
  let best = fallback
  let bestDiff = Infinity
  for (const s of SIZE_RATIOS) {
    const diff = Math.abs(s.ratio - ratio)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s.key
    }
  }
  return best
}

// ---- Error classifier ----
function classifyError(rawMsg: string): string {
  const m = (rawMsg || '').toLowerCase()
  if (m.includes('401') || m.includes('unauthorized') || m.includes('api key')) {
    return '鉴权失败：请检查 API Key 或云端登录状态'
  }
  if (m.includes('402') || m.includes('insufficient') || m.includes('balance') || m.includes('payment')) {
    return `${siteConfig.labels.token}不足或付费失败`
  }
  if (m.includes('429') || m.includes('rate limit') || m.includes('too many')) {
    return '请求过于频繁，稍后重试'
  }
  if (m.includes('not support') || m.includes('unsupported') || m.includes('not found') && m.includes('model')) {
    return '当前模型不支持局部重绘，请切换支持 /images/edits 的模型'
  }
  if (m.includes('mask')) {
    return 'mask 参数无效或模型不支持 mask'
  }
  if (m.includes('size') || m.includes('dimension') || m.includes('resolution')) {
    return '尺寸不被模型支持，请尝试调整尺寸或先裁剪'
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    return '请求超时，请重试或检查网络'
  }
  if (m.includes('network') || m.includes('fetch failed') || m.includes('econnrefused') || m.includes('enotfound')) {
    return '网络错误，请检查连接'
  }
  if (m.includes('cloud login')) {
    return '未登录云端服务'
  }
  // 兜底：复用统一错误翻译表（覆盖 Upstream/503/Bad Gateway/限流/多米/鉴权等常见英文错误）
  return translateError(rawMsg) || '重绘失败'
}

// ---- Image utility ----
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

async function blendWithMask(originalDataUrl: string, newDataUrl: string, maskDataUrl: string): Promise<string> {
  const [origImg, newImg, maskImg] = await Promise.all([
    loadImageEl(originalDataUrl),
    loadImageEl(newDataUrl),
    loadImageEl(maskDataUrl)
  ])
  const w = origImg.naturalWidth
  const h = origImg.naturalHeight

  const result = document.createElement('canvas')
  result.width = w
  result.height = h
  const ctx = result.getContext('2d')!
  ctx.drawImage(origImg, 0, 0, w, h)

  const layer = document.createElement('canvas')
  layer.width = w
  layer.height = h
  const lctx = layer.getContext('2d')!
  lctx.drawImage(newImg, 0, 0, w, h)
  lctx.globalCompositeOperation = 'destination-in'
  lctx.drawImage(maskImg, 0, 0, w, h)

  ctx.drawImage(layer, 0, 0)
  return result.toDataURL('image/png')
}

// ---- Source exporter variants ----
async function getSourceForInpaint(): Promise<string | null> {
  if (!fabricCanvas) return null
  const hidden: FabricObject[] = []
  fabricCanvas.getObjects().forEach(o => {
    const role = (o as any).data?.role
    let shouldHide = role === 'mask' || role === 'mask-erase' || role === 'mask-shape' || role === 'mask-shape-erase' || role === 'crop-rect'
    if (keepEditLayers.value && (role === 'text' || role === 'draw')) shouldHide = true
    if (shouldHide && o.visible !== false) {
      hidden.push(o)
      o.visible = false
    }
  })
  fabricCanvas.discardActiveObject()
  fabricCanvas.requestRenderAll()
  try {
    return await getCanvasDataUrl()
  } finally {
    hidden.forEach(o => { o.visible = true })
    fabricCanvas.requestRenderAll()
  }
}

// ---- Cancel inpaint ----
function cancelInpaint() {
  if (!inpainting.value) return
  inpaintCancelled = true
  inpaintProgress.value.message = '取消中...'
  showToast('已请求取消，等待当前批次完成后停止')
}

// O8: 模型选择弹窗确认回调，保存到 settings 持久化
function onModelConfirm(payload: { providerId: string; modelId: string }) {
  editProviderId.value = payload.providerId
  editModelId.value = payload.modelId
  api().settings.invoke('set', 'imageedit_provider_id', payload.providerId).catch(() => {})
  api().settings.invoke('set', 'imageedit_model_id', payload.modelId).catch(() => {})
  showToast(`已设置：${modelStore.formatModelLabel(payload.providerId, payload.modelId)}`)
}

// 校验生图模型是否已配置；未配置时自动打开模型选择弹窗并提示，返回 false 阻断后续动作
function ensureEditModelConfigured(): boolean {
  const provider = editProviderId.value || generation.value?.model_provider_id
  const model = editModelId.value || generation.value?.model_id
  if (!provider || !model) {
    showToast('请先选择生图模型')
    modelDialogVisible.value = true
    return false
  }
  return true
}

// ---- Main inpaint function ----
async function runInpaint() {
  if (!generation.value) return
  if (!ensureEditModelConfigured()) return
  // 模板允许留空时跳过提示词校验（如「移除」模板会自动用背景填补）
  const allowEmpty = usePromptTemplate.value && currentTemplate().allowEmpty === true
  if (!allowEmpty && !inpaintPrompt.value.trim()) {
    showToast('请输入重绘提示词')
    return
  }
  if (compareMode.value !== 'none') {
    showToast('请先确认或取消当前对比')
    return
  }

  const maskDataUrl = generateMaskDataURL()
  if (!maskDataUrl) {
    showToast('请先涂抹需要重绘的区域')
    return
  }

  inpainting.value = true
  inpaintCancelled = false
  inpaintProgress.value = { completed: 0, total: batchCount.value, message: '准备中...' }

  try {
    const sourceDataUrl = await getSourceForInpaint()
    if (!sourceDataUrl) throw new Error('Failed to export canvas')

    const sourceBase64 = sourceDataUrl.split(',')[1]
    const maskBase64 = maskDataUrl.split(',')[1]

    const finalPrompt = buildFinalPrompt()
    const finalSize = inferSizeKey(originalW, originalH, generation.value.size || '1:1')

    // O8: 优先使用用户在工具栏「生图模型」按钮设置的模型；未设置回退到 generation
    const effectiveProvider = editProviderId.value || generation.value.model_provider_id
    const effectiveModel = editModelId.value || generation.value.model_id
    if (!effectiveProvider || !effectiveModel) {
      throw new Error('未设置生图模型，请先点左下角「设置生图模型」选择')
    }

    const results: any[] = await api().imageGen.invoke('generate', {
      prompt: finalPrompt,
      refImages: [sourceBase64],
      mask: maskBase64,
      modelProviderId: effectiveProvider,
      modelId: effectiveModel,
      size: finalSize,
      quality: generation.value.quality || 'auto',
      batchCount: batchCount.value,
      concurrency: concurrency.value
    })

    if (inpaintCancelled) {
      showToast('已取消重绘')
      return
    }

    const succeeded = (results || []).filter(r => r && r.status === 'done' && r.result_path)
    const failed = (results || []).filter(r => r && r.status !== 'done')

    if (succeeded.length === 0) {
      const firstErr = failed[0]?.error || '所有候选均失败'
      throw new Error(firstErr)
    }

    // Record successful image-model usage for the shared hints LRU
    // 用本次实际重绘所用的模型（effectiveProvider/effectiveModel），不是 generation 创建时的模型
    if (effectiveProvider && effectiveModel) {
      await recordUsage('image', effectiveProvider, effectiveModel)
    }

    // Load candidate data URLs
    const candidateUrls: string[] = []
    for (const r of succeeded) {
      const absPath = await api().imageGen.invoke('getAbsolutePath', r.result_path)
      const imgEl = await loadImageEl('local-file://img?p=' + encodeURIComponent(absPath))
      candidateUrls.push(imageToDataURL(imgEl))
    }

    // Snapshot current canvas (pre-inpaint) for compare
    const snapshot = await getSourceForInpaint()
    originalSnapshotDataUrl.value = snapshot
    activeMaskDataUrl.value = maskDataUrl

    compareCandidates.value = candidateUrls
    compareSelectedIndex.value = 0
    compareSplit.value = 50
    compareShowOriginal.value = candidateUrls.length === 1
    compareMode.value = candidateUrls.length > 1 ? 'multi' : 'single'

    if (failed.length > 0) {
      showToast(`生成 ${succeeded.length}/${results.length} 张成功，${failed.length} 张失败`)
    }
  } catch (e: any) {
    const friendly = classifyError(e?.message || '')
    showToast('重绘失败：' + friendly)
    console.error('[Inpaint]', e)
  } finally {
    inpainting.value = false
    inpaintProgress.value = { completed: 0, total: 0, message: '' }
  }
}

// ---- Compare mode actions ----
async function applyCompareResult() {
  if (compareMode.value === 'none') return
  const chosen = compareCandidates.value[compareSelectedIndex.value]
  if (!chosen) return

  loading.value = true
  try {
    let finalDataUrl = chosen

    // Apply composite blending if enabled
    if (compositeBlend.value && originalSnapshotDataUrl.value && activeMaskDataUrl.value) {
      finalDataUrl = await blendWithMask(originalSnapshotDataUrl.value, chosen, activeMaskDataUrl.value)
    }

    const newImgEl = await loadImageEl(finalDataUrl)

    // Record in history
    const thumb = await makeThumbnail(finalDataUrl, 64)
    inpaintHistory.value.unshift({
      thumbnail: thumb,
      prompt: inpaintPrompt.value,
      timestamp: Date.now()
    })
    if (inpaintHistory.value.length > 12) inpaintHistory.value.length = 12

    if (keepEditLayers.value) {
      // Only swap base image, keep text/draw layers
      await swapBaseImageKeepLayers(finalDataUrl, newImgEl.naturalWidth, newImgEl.naturalHeight)
    } else {
      await replaceBaseImage(finalDataUrl, newImgEl.naturalWidth, newImgEl.naturalHeight)
    }

    clearMask()
    saveHistory()
    exitCompareMode()
    showToast('已应用重绘结果')
  } catch (e: any) {
    showToast('应用失败：' + (e.message || ''))
    console.error('[Compare apply]', e)
  } finally {
    loading.value = false
  }
}

function exitCompareMode() {
  compareMode.value = 'none'
  compareCandidates.value = []
  compareSelectedIndex.value = 0
  originalSnapshotDataUrl.value = null
  activeMaskDataUrl.value = null
}

function cancelCompare() {
  exitCompareMode()
  showToast('已取消应用')
}

async function swapBaseImageKeepLayers(dataUrl: string, newOrigW: number, newOrigH: number) {
  if (!fabricCanvas) return
  originalW = newOrigW
  originalH = newOrigH

  const { canvasW, canvasH, scale } = computeFitSize(newOrigW, newOrigH)
  const oldCanvasW = fabricCanvas.width!
  const oldCanvasH = fabricCanvas.height!
  displayScale = scale

  // Remove only mask objects; keep text/draw objects
  const toRemove = fabricCanvas.getObjects().filter(o => {
    const role = (o as any).data?.role
    return role === 'mask' || role === 'mask-erase' || role === 'mask-shape' || role === 'mask-shape-erase' || role === 'crop-rect'
  })
  toRemove.forEach(o => fabricCanvas!.remove(o))

  // Rescale existing non-base objects proportionally
  const rx = canvasW / oldCanvasW
  const ry = canvasH / oldCanvasH
  fabricCanvas.getObjects().forEach(o => {
    if ((o as any).data?.role === 'base') return
    o.set({
      left: (o.left || 0) * rx,
      top: (o.top || 0) * ry,
      scaleX: (o.scaleX || 1) * rx,
      scaleY: (o.scaleY || 1) * ry
    })
    o.setCoords()
  })

  fabricCanvas.setDimensions({ width: canvasW, height: canvasH })
  await setBaseImage(dataUrl, canvasW, canvasH)
  reapplyFilters(false)

  await nextTick()
  fabricCanvas.calcOffset()
}

async function makeThumbnail(dataUrl: string, size: number): Promise<string> {
  const img = await loadImageEl(dataUrl)
  const tmp = document.createElement('canvas')
  const ratio = img.naturalWidth / img.naturalHeight
  if (ratio >= 1) {
    tmp.width = size
    tmp.height = Math.max(1, Math.round(size / ratio))
  } else {
    tmp.height = size
    tmp.width = Math.max(1, Math.round(size * ratio))
  }
  tmp.getContext('2d')!.drawImage(img, 0, 0, tmp.width, tmp.height)
  return tmp.toDataURL('image/png')
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---- Save / Export ----
async function getCanvasDataUrl(): Promise<string | null> {
  if (!fabricCanvas) return null
  const multiplier = originalW / fabricCanvas.width!
  return fabricCanvas.toDataURL({ format: 'png', multiplier })
}

async function saveImage() {
  if (!generation.value) return
  saving.value = true
  try {
    const dataUrl = await getCanvasDataUrl()
    if (!dataUrl) throw new Error('Failed to export canvas')
    if (generation.value.id === '_local') {
      // 本地图库编辑模式：创建独立的新 image_generation 记录
      // sourcePath 仅作元数据保留，方便用户追溯；不会覆盖原图，也不会自动加入图库
      const newGen = await api().imageGen.invoke('saveLocalEdited', generation.value.result_path, dataUrl)
      showToast('已保存到「我的创作」')
      // 把当前页指向新生成的记录，让后续 inpaint/saveAsNew/reset 都基于新记录运行
      if (newGen?.id) {
        generation.value = newGen
        router.replace({ path: `/image-edit/${newGen.id}` })
      }
    } else {
      await api().imageGen.invoke('saveEditedImage', generation.value.id, dataUrl)
      showToast('已保存')
    }
  } catch (e: any) {
    showToast('保存失败: ' + (e.message || ''))
  } finally {
    saving.value = false
  }
}

// O4-4: 另存到图库
async function prepareSaveToGallery() {
  if (!generation.value) return
  try {
    const dataUrl = await getCanvasDataUrl()
    if (!dataUrl) throw new Error('Failed to export canvas')
    gallerySaveDataUri.value = dataUrl
    gallerySaveDefaultName.value = generation.value.id === '_local'
      ? `编辑_${new Date().toISOString().slice(0, 10)}`
      : `edited_${generation.value.id}`
    gallerySaveVisible.value = true
  } catch (e: any) {
    showToast('准备保存失败: ' + (e.message || ''))
  }
}

async function onGallerySaveConfirm(payload: { categoryId: string; filename: string }) {
  if (!gallerySaveDataUri.value) return
  saving.value = true
  try {
    const name = payload.filename || gallerySaveDefaultName.value
    const item = await galleryStore.addFromDataUri(payload.categoryId, gallerySaveDataUri.value, name)
    if (item) showToast('已保存到图库')
    else throw new Error('写盘失败')
  } catch (e: any) {
    showToast('保存失败: ' + (e.message || ''))
  } finally {
    saving.value = false
    gallerySaveDataUri.value = ''
  }
}

// ---- Reset ----
async function resetCanvas() {
  if (!generation.value) return
  loading.value = true
  try {
    const absPath = await api().imageGen.invoke('getAbsolutePath', generation.value.result_path)
    const imgEl = new Image()
    await new Promise<void>((resolve, reject) => {
      imgEl.onload = () => resolve()
      imgEl.onerror = () => reject(new Error('load failed'))
      imgEl.src = 'local-file://img?p=' + encodeURIComponent(absPath)
    })
    const newDataUrl = imageToDataURL(imgEl)
    resetFilterValues()
    await replaceBaseImage(newDataUrl, imgEl.naturalWidth, imgEl.naturalHeight)
    history.value = []
    historyIndex.value = -1
    saveHistory()
    activeTool.value = 'select'
    showToast('已重置')
  } catch (e: any) {
    showToast('重置失败: ' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

// ---- Navigate ----
function goBack() {
  router.back()
}

async function regenerateWithRef() {
  if (!generation.value || !fabricCanvas) return
  // Temporarily hide masks and crop rect so the exported image only contains real edits
  const hidden: FabricObject[] = []
  fabricCanvas.getObjects().forEach((o) => {
    const role = (o as any).data?.role
    if (role === 'mask' || role === 'crop-rect') {
      if (o.visible !== false) {
        hidden.push(o)
        o.visible = false
      }
    }
  })
  fabricCanvas.discardActiveObject()
  fabricCanvas.requestRenderAll()
  try {
    const dataUrl = await getCanvasDataUrl()
    if (!dataUrl) return
    sessionStorage.setItem('imageGen:refImages', JSON.stringify([dataUrl]))
    router.push({ path: '/image-gen', query: { prompt: generation.value.prompt, hasRefImages: '1' } })
  } finally {
    hidden.forEach((o) => { o.visible = true })
    fabricCanvas.requestRenderAll()
  }
}

// ---- Utility ----
function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2500)
}
</script>
