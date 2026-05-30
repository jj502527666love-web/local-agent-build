export interface NodeTypeDef {
  type: string
  label: string
  color: string
  inputs: { handle: string; dataType: 'text' | 'image' | 'video'; required: boolean }[]
  outputs: { handle: string; dataType: 'text' | 'image' | 'video' }[]
  dynamicOutputs?: boolean
}

export const NODE_TYPE_DEFS: NodeTypeDef[] = [
  {
    type: 'textInput',
    label: '文本输入',
    color: '#6366f1',
    inputs: [],
    outputs: [{ handle: 'output', dataType: 'text' }]
  },
  {
    type: 'aiText',
    label: 'AI 文本',
    color: '#8b5cf6',
    inputs: [{ handle: 'input', dataType: 'text', required: true }],
    outputs: [{ handle: 'output', dataType: 'text' }]
  },
  {
    type: 'quickOrchestrator',
    label: '快捷编排',
    color: '#7c3aed',
    inputs: [
      { handle: 'text-input', dataType: 'text', required: false },
      { handle: 'image-input', dataType: 'image', required: false }
    ],
    outputs: [{ handle: 'output', dataType: 'text' }]
  },
  {
    type: 'text2img',
    label: '文生图',
    color: '#f59e0b',
    inputs: [
      { handle: 'text-input', dataType: 'text', required: true },
      { handle: 'image-input', dataType: 'image', required: false }
    ],
    outputs: [{ handle: 'output', dataType: 'image' }]
  },
  {
    type: 'img2img',
    label: '图生图',
    color: '#ef4444',
    inputs: [
      { handle: 'image-input', dataType: 'image', required: true },
      { handle: 'text-input', dataType: 'text', required: false }
    ],
    outputs: [{ handle: 'output', dataType: 'image' }]
  },
  {
    type: 'refImage',
    label: '参考图',
    color: '#10b981',
    inputs: [],
    outputs: [{ handle: 'output', dataType: 'image' }]
  },
  {
    type: 'imageResult',
    label: '图片结果',
    color: '#06b6d4',
    inputs: [{ handle: 'input', dataType: 'image', required: true }],
    outputs: []
  },
  {
    type: 'promptSlice',
    label: '提示词切片',
    color: '#ec4899',
    inputs: [],
    outputs: [{ handle: 'output-0', dataType: 'text' }],
    dynamicOutputs: true
  },
  // v0.6.9+：图片反推。把上游 image 反推为可直接用于生图模型的 prompt 文本。
  // 输入 image → 输出 text，是画布上唯一的 image→text 桥；解锁「参考图风格迁移」「多图融合」等工作流。
  // 视觉模型优先级：node.data.vision_provider_id > project.vision_provider_id；都为空时报错。
  {
    type: 'reverse',
    label: '图片反推',
    color: '#14b8a6',
    inputs: [{ handle: 'image-input', dataType: 'image', required: true }],
    outputs: [{ handle: 'output', dataType: 'text' }]
  },
  {
    type: 'imageRecognition',
    label: '识图',
    color: '#0ea5e9',
    inputs: [{ handle: 'image-input', dataType: 'image', required: true }],
    outputs: [{ handle: 'output', dataType: 'text' }]
  },
  // v0.6.9+：AI 抠图。上游 image → 透明 PNG image。基于阿里 viapi SegmentHDCommonImage。
  // 模式：node.data.matting_source = 'cloud' | 'custom'；custom 时 node.data.matting_provider_id 指向本地 provider
  {
    type: 'matting',
    label: 'AI 抠图',
    color: '#a855f7',
    inputs: [{ handle: 'image-input', dataType: 'image', required: true }],
    outputs: [{ handle: 'output', dataType: 'image' }]
  },
  // v0.7.14+ AI 视频：上游文本/图片 → 视频（dataType 'video'）。
  // 图片输入按模式分槽：image-input=参考图（图生视频，可多连）；first/last-frame-input=首尾帧（各 1 张）。
  // 规格/计费走 L2 catalog；异步任务由 useVideoTaskPolling 轮询、完成后落盘到 canvas/{projectId}/。
  {
    type: 'aiVideo',
    label: 'AI 视频',
    color: '#d946ef',
    inputs: [
      { handle: 'text-input', dataType: 'text', required: false },
      { handle: 'image-input', dataType: 'image', required: false },
      { handle: 'first-frame-input', dataType: 'image', required: false },
      { handle: 'last-frame-input', dataType: 'image', required: false }
    ],
    outputs: [{ handle: 'output', dataType: 'video' }]
  },
  {
    type: 'videoResult',
    label: '视频结果',
    color: '#c026d3',
    inputs: [{ handle: 'input', dataType: 'video', required: true }],
    outputs: []
  },
  // v0.7.14+ 视频创作链：视频源 → 关键帧/反推 → 回喂 aiVideo；小说 → 智能分镜
  {
    type: 'videoInput',
    label: '视频输入',
    color: '#0ea5e9',
    inputs: [],
    outputs: [{ handle: 'output', dataType: 'video' }]
  },
  // 关键帧抽取：video → 多张 image（动态输出，每帧一个 output-{frameId}）
  {
    type: 'videoFrames',
    label: '关键帧抽取',
    color: '#0891b2',
    inputs: [{ handle: 'video-input', dataType: 'video', required: true }],
    outputs: [{ handle: 'output-0', dataType: 'image' }],
    dynamicOutputs: true
  },
  // 视频反推：video → text（抽代表帧 + 多模态拆解为提示词/分镜）
  {
    type: 'videoReverse',
    label: '视频反推',
    color: '#0d9488',
    inputs: [{ handle: 'video-input', dataType: 'video', required: true }],
    outputs: [{ handle: 'output', dataType: 'text' }]
  },
  // 智能分镜：text(小说/剧情) → 多条镜头提示词 text（动态输出，每镜头一个 output-{shotId}）
  {
    type: 'storyboard',
    label: '智能分镜',
    color: '#7c3aed',
    inputs: [{ handle: 'text-input', dataType: 'text', required: false }],
    outputs: [{ handle: 'output-0', dataType: 'text' }],
    dynamicOutputs: true
  },
  // 角色一致性：创建角色（生成定妆图 + 入库）/ 角色引用（选库中角色输出参考图）
  {
    type: 'createCharacter',
    label: '创建角色',
    color: '#db2777',
    inputs: [{ handle: 'text-input', dataType: 'text', required: false }],
    outputs: [{ handle: 'output', dataType: 'image' }]
  },
  {
    type: 'characterRef',
    label: '角色引用',
    color: '#e11d48',
    inputs: [],
    outputs: [{ handle: 'output', dataType: 'image' }]
  }
]

export function getNodeTypeDef(type: string): NodeTypeDef | undefined {
  return NODE_TYPE_DEFS.find((d) => d.type === type)
}

export function getHandleType(
  nodeType: string,
  handleId: string,
  direction: 'input' | 'output'
): 'text' | 'image' | 'video' | null {
  const def = getNodeTypeDef(nodeType)
  if (!def) return null

  if (direction === 'input') {
    const input = def.inputs.find((i) => i.handle === handleId)
    return input?.dataType || null
  } else {
    // Dynamic outputs: match any handle with the same prefix pattern
    if (def.dynamicOutputs && handleId.startsWith('output-')) {
      return def.outputs[0]?.dataType || null
    }
    const output = def.outputs.find((o) => o.handle === handleId)
    return output?.dataType || null
  }
}
