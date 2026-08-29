<template>
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-0.5 min-w-0">
      <!-- 附件：图片 / 文档 / 图库（菜单组件内自包含） -->
      <div class="relative" ref="attachMenuRef">
        <button
          type="button"
          tabindex="-1"
          class="h-8 w-8 flex items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-all disabled:opacity-40 outline-none focus:outline-none focus:ring-0"
          title="添加附件"
          :disabled="disabled"
          @click="showAttachMenu = !showAttachMenu"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
          </svg>
        </button>
        <div
          v-if="showAttachMenu"
          class="absolute bottom-full left-0 mb-2 bg-surface-0 rounded-xl shadow-modal border border-surface-3 py-1 w-32 z-10"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 transition-colors"
            @click="emitAttach('image')"
          >
            <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
            图片
          </button>
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 transition-colors"
            @click="emitAttach('document')"
          >
            <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            文档
          </button>
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 transition-colors"
            @click="emitGallery"
          >
            <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="1.75"/><circle cx="8.5" cy="8.5" r="1.5" stroke-width="1.75"/><polyline points="21 15 16 10 5 21" stroke-width="1.75"/></svg>
            图库
          </button>
        </div>
      </div>
      <!-- 插入提示词 -->
      <button
        type="button"
        tabindex="-1"
        class="h-8 w-8 flex items-center justify-center rounded-full text-text-tertiary hover:text-text-secondary hover:bg-surface-2 transition-all disabled:opacity-40 outline-none focus:outline-none focus:ring-0"
        title="插入提示词"
        :disabled="disabled"
        @click="$emit('prompt')"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      </button>
      <!-- 工具（知识库/小工具/Skills/MCP 选择条开关） -->
      <button
        type="button"
        tabindex="-1"
        :class="['relative h-8 w-8 flex items-center justify-center rounded-full transition-all outline-none focus:outline-none focus:ring-0',
          toolsOpen ? 'text-primary-600 bg-primary-50' : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2']"
        title="工具"
        @click="$emit('tools')"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
        </svg>
        <span
          v-if="activeToolCount"
          class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-600 text-white text-[9px] rounded-full flex items-center justify-center font-medium"
        >{{ activeToolCount }}</span>
      </button>
      <!-- 会话级工具权限档（空串 = 继承智能体默认） -->
      <ChatPermissionSwitcher
        :mode="permissionMode"
        :bot-default="botDefault"
        @change="$emit('permission-change', $event)"
      />
    </div>

    <div class="flex items-center gap-1 flex-shrink-0">
      <ChatModelSwitcher
        type="chat"
        :provider-id="chatProviderId"
        :model-id="chatModelId"
        prefix=""
        align="end"
        chip
        @change="$emit('chat-model-change', $event)"
      />
      <ChatModelSwitcher
        v-if="showImageModel"
        type="image"
        :provider-id="imageProviderId"
        :model-id="imageModelId"
        prefix=""
        align="end"
        chip
        @change="$emit('image-model-change', $event)"
      />
      <!-- 发送 / 停止 / 中断中 -->
      <button
        v-if="streaming && !cancelling"
        type="button"
        tabindex="-1"
        class="h-8 w-8 flex items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-500 transition-all outline-none focus:outline-none focus:ring-0"
        title="停止"
        @click="$emit('cancel')"
      >
        <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" /></svg>
      </button>
      <button
        v-else-if="cancelling"
        type="button"
        tabindex="-1"
        disabled
        class="h-8 w-8 flex items-center justify-center rounded-full bg-surface-2 text-text-tertiary cursor-not-allowed outline-none"
        title="中断中"
      >
        <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
      </button>
      <button
        v-else
        type="button"
        tabindex="-1"
        :disabled="!canSend"
        :title="sendTitle"
        :class="[
          'h-8 w-8 flex items-center justify-center rounded-full transition-all outline-none focus:outline-none focus:ring-0',
          canSend
            ? 'bg-primary-600 text-white hover:bg-primary-500'
            : 'bg-surface-3 text-text-tertiary cursor-not-allowed'
        ]"
        @click="$emit('send')"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ChatModelSwitcher from '@/components/ChatModelSwitcher.vue'
import ChatPermissionSwitcher from '@/components/ChatPermissionSwitcher.vue'
import type { ToolApproval } from '@/stores/bots'

withDefaults(defineProps<{
  disabled?: boolean
  toolsOpen?: boolean
  activeToolCount?: number
  permissionMode?: string
  botDefault?: ToolApproval
  chatProviderId?: string
  chatModelId?: string
  showImageModel?: boolean
  imageProviderId?: string
  imageModelId?: string
  canSend?: boolean
  streaming?: boolean
  cancelling?: boolean
  sendTitle?: string
}>(), {
  disabled: false,
  toolsOpen: false,
  activeToolCount: 0,
  permissionMode: '',
  botDefault: 'destructive',
  chatProviderId: '',
  chatModelId: '',
  showImageModel: false,
  imageProviderId: '',
  imageModelId: '',
  canSend: false,
  streaming: false,
  cancelling: false,
  sendTitle: '发送'
})

const emit = defineEmits<{
  attach: ['image' | 'document']
  gallery: []
  prompt: []
  tools: []
  'permission-change': [ToolApproval]
  'chat-model-change': [{ provider_id: string; model_id: string }]
  'image-model-change': [{ provider_id: string; model_id: string }]
  send: []
  cancel: []
}>()

const showAttachMenu = ref(false)
const attachMenuRef = ref<HTMLElement | null>(null)

function emitAttach(kind: 'image' | 'document') {
  showAttachMenu.value = false
  emit('attach', kind)
}
function emitGallery() {
  showAttachMenu.value = false
  emit('gallery')
}

function onDocMouseDown(e: MouseEvent) {
  if (!showAttachMenu.value) return
  const el = attachMenuRef.value
  if (el && !el.contains(e.target as Node)) showAttachMenu.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>
