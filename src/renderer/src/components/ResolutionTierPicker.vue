<template>
  <div class="inline-flex items-center gap-1.5" role="radiogroup" aria-label="分辨率档位">
    <button
      v-for="tier in tiers"
      :key="tier.id"
      type="button"
      role="radio"
      :aria-checked="tier.id === modelValue"
      :disabled="disabled"
      :class="buttonClass(tier.id === modelValue)"
      :title="tier.note ? `${tier.label}（${tier.note}）` : tier.label"
      @click="onPick(tier.id)"
    >
      <span class="font-medium leading-none">{{ tier.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { getAvailableResolutionTiers, ensureValidTierIdForSize } from '@shared/image-size'

interface Props {
  /** 当前选中的档位 id（1k/2k/4k） */
  modelValue: string
  /** 模型 id，决定可选档位列表 */
  modelId?: string
  sizeValue?: string
  disabled?: boolean
  /** 按钮尺寸：sm = 节点内紧凑，md = 生图页标准 */
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  size: 'md'
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const tiers = computed(() => getAvailableResolutionTiers(props.modelId, props.sizeValue))

/**
 * 模型切换后当前选中档位可能不再合法（如从 gpt-image-2 的 4K 切到只支持 1K/2K 的模型），
 * 自动降级到 DEFAULT_TIER_ID（2K）或首档。
 */
watch(
  () => [props.modelId, props.modelValue, props.sizeValue] as const,
  ([modelId, current, sizeValue]) => {
    const valid = ensureValidTierIdForSize(modelId, current, sizeValue)
    if (valid !== current) emit('update:modelValue', valid)
  },
  { immediate: true }
)

function onPick(id: string): void {
  if (props.disabled || id === props.modelValue) return
  emit('update:modelValue', id)
}

function buttonClass(active: boolean): string[] {
  const base = [
    'rounded-lg',
    'border',
    'transition-colors',
    'inline-flex',
    'items-center',
    'justify-center',
    'disabled:opacity-40',
    'disabled:cursor-not-allowed'
  ]
  if (props.size === 'sm') {
    base.push('px-2', 'py-1', 'text-[10px]', 'min-w-[40px]')
  } else {
    base.push('px-3', 'py-1.5', 'text-xs', 'min-w-[48px]')
  }
  if (active) {
    base.push('border-primary-500', 'bg-primary-50', 'text-primary-700', 'font-medium')
  } else {
    base.push('border-surface-3', 'bg-surface-1', 'text-text-secondary', 'hover:bg-surface-2')
  }
  return base
}
</script>
