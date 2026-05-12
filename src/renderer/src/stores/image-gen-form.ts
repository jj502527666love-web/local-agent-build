import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_TIER_ID, DEFAULT_QUALITY_ID } from '@shared/image-size'

/**
 * AI 生图（ImageGenView）的会话级表单草稿。
 *
 * 设计目标：在路由切换时不丢失用户已填写的输入。
 * 不写盘——重启 app 后回到默认值，符合"启动状态维持"的预期。
 */
export const useImageGenFormStore = defineStore('imageGenForm', () => {
  // 提示词
  const prompt = ref('')

  // 参考图（base64 dataURL 数组，单图最多 1MB 经 stripImageMetadata 压缩后）
  const refImages = ref<string[]>([])

  // 生图模型
  const selectedProviderId = ref('')
  const selectedModelId = ref('')

  // 提示词优化模型
  const optimizeProviderId = ref('')
  const optimizeModelId = ref('')

  // 尺寸 / 分辨率档位 / 画质
  const selectedSize = ref('1:1')
  const selectedTier = ref<string>(DEFAULT_TIER_ID)
  const selectedQuality = ref<string>(DEFAULT_QUALITY_ID)

  // 批量
  const batchCount = ref(1)

  // 视图模式
  const viewMode = ref<'grid' | 'list'>('grid')

  /** 重置全部草稿到默认值（清空按钮 / 测试用） */
  function reset() {
    prompt.value = ''
    refImages.value = []
    selectedProviderId.value = ''
    selectedModelId.value = ''
    optimizeProviderId.value = ''
    optimizeModelId.value = ''
    selectedSize.value = '1:1'
    selectedTier.value = DEFAULT_TIER_ID
    selectedQuality.value = DEFAULT_QUALITY_ID
    batchCount.value = 1
    viewMode.value = 'grid'
  }

  return {
    prompt,
    refImages,
    selectedProviderId,
    selectedModelId,
    optimizeProviderId,
    optimizeModelId,
    selectedSize,
    selectedTier,
    selectedQuality,
    batchCount,
    viewMode,
    reset,
  }
})
