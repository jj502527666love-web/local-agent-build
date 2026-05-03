export interface NodeTypeDef {
  type: string
  label: string
  color: string
  inputs: { handle: string; dataType: 'text' | 'image'; required: boolean }[]
  outputs: { handle: string; dataType: 'text' | 'image' }[]
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
  }
]

export function getNodeTypeDef(type: string): NodeTypeDef | undefined {
  return NODE_TYPE_DEFS.find((d) => d.type === type)
}

export function getHandleType(
  nodeType: string,
  handleId: string,
  direction: 'input' | 'output'
): 'text' | 'image' | null {
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
