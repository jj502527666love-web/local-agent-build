import { ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { getNodeTypeDef } from './useNodeTypes'

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'blocked'

export interface WorkflowTask {
  nodeId: string
  status: TaskStatus
  error?: string
}

const api = () => (window as any).api

export function useWorkflowEngine() {
  const running = ref(false)
  const tasks = ref<WorkflowTask[]>([])
  const nodeStatuses = ref<Map<string, TaskStatus>>(new Map())

  function topologicalSort(projectId: string): string[] {
    const canvasStore = useCanvasStore()
    const nodes = canvasStore.nodes.filter((n) => n.project_id === projectId)
    const edges = canvasStore.edges.filter((e) => e.project_id === projectId)

    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    for (const node of nodes) {
      inDegree.set(node.id, 0)
      adj.set(node.id, [])
    }

    for (const edge of edges) {
      const targets = adj.get(edge.source_node_id)
      if (targets) targets.push(edge.target_node_id)
      inDegree.set(edge.target_node_id, (inDegree.get(edge.target_node_id) || 0) + 1)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const sorted: string[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      sorted.push(id)
      for (const target of adj.get(id) || []) {
        const newDeg = (inDegree.get(target) || 1) - 1
        inDegree.set(target, newDeg)
        if (newDeg === 0) queue.push(target)
      }
    }

    return sorted
  }

  function getUpstreamData(nodeId: string, projectId: string): { texts: string[]; images: string[] } {
    const canvasStore = useCanvasStore()
    const edges = canvasStore.edges.filter((e) => e.project_id === projectId && e.target_node_id === nodeId)
    const texts: string[] = []
    const images: string[] = []

    for (const edge of edges) {
      const sourceNode = canvasStore.nodes.find((n) => n.id === edge.source_node_id)
      if (!sourceNode) continue

      const def = getNodeTypeDef(sourceNode.type)
      if (!def) continue

      const outputDef = def.outputs.find((o) => o.handle === edge.source_handle)
      if (!outputDef) continue

      if (outputDef.dataType === 'text') {
        const text = sourceNode.data.result || sourceNode.data.text || ''
        if (text) texts.push(text)
      } else if (outputDef.dataType === 'image') {
        const img = sourceNode.data.result_path || sourceNode.data.image_data || ''
        if (img) images.push(img)
      }
    }

    return { texts, images }
  }

  function checkRequiredInputs(nodeId: string, projectId: string): { ok: boolean; missing: string[] } {
    const canvasStore = useCanvasStore()
    const node = canvasStore.nodes.find((n) => n.id === nodeId)
    if (!node) return { ok: false, missing: ['node not found'] }

    const def = getNodeTypeDef(node.type)
    if (!def) return { ok: true, missing: [] }

    const edges = canvasStore.edges.filter((e) => e.project_id === projectId && e.target_node_id === nodeId)
    const missing: string[] = []

    for (const input of def.inputs) {
      if (!input.required) continue
      const hasConnection = edges.some((e) => e.target_handle === input.handle)
      if (!hasConnection) {
        missing.push(input.handle)
        continue
      }
      // Check if upstream has data
      const upstream = getUpstreamData(nodeId, projectId)
      if (input.dataType === 'text' && upstream.texts.length === 0) {
        missing.push(input.handle)
      }
      if (input.dataType === 'image' && upstream.images.length === 0) {
        missing.push(input.handle)
      }
    }

    return { ok: missing.length === 0, missing }
  }

  async function executeNode(nodeId: string, projectId: string): Promise<void> {
    const canvasStore = useCanvasStore()
    const node = canvasStore.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const upstream = getUpstreamData(nodeId, projectId)

    switch (node.type) {
      case 'textInput':
        // Text input nodes don't need execution, they already have data
        break

      case 'refImage':
        // Ref image nodes don't need execution
        break

      case 'aiText': {
        const inputText = upstream.texts.join('\n') || node.data.text || ''
        if (!inputText) throw new Error('No text input')

        const project = canvasStore.currentProject
        if (!project?.text_provider_id || !project?.text_model_id) {
          throw new Error('Please configure text provider in canvas settings')
        }

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, status: 'running' }
        })

        const result = await api().llm.invoke('call', project.text_provider_id, project.text_model_id, [
          { role: 'system', content: 'You are a helpful text assistant. Improve, expand, or refine the given text for use as an AI image generation prompt. Output only the improved text, nothing else.' },
          { role: 'user', content: inputText }
        ])

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, text: inputText, result: result || inputText, status: 'done' }
        })
        break
      }

      case 'text2img': {
        const prompt = upstream.texts.join('\n') || ''
        if (!prompt) throw new Error('No prompt text connected')

        const project = canvasStore.currentProject
        if (!project?.image_provider_id || !project?.image_model_id) {
          throw new Error('Please configure image provider in canvas settings')
        }

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, status: 'running' }
        })

        // Optional: convert upstream reference images to base64
        const genOptions: Record<string, any> = {
          prompt,
          modelProviderId: project.image_provider_id,
          modelId: project.image_model_id,
          size: node.data.size || '1:1',
          quality: node.data.quality || 'auto'
        }

        if (upstream.images.length > 0) {
          const refImageData: string[] = []
          for (const img of upstream.images) {
            if (img.startsWith('data:')) {
              refImageData.push(img)
            } else {
              try {
                const dataDir = await api().dataDir.get()
                const fullPath = `${dataDir}/${img}`
                const b64 = await api().chat.invoke('readFileBase64', fullPath)
                refImageData.push(`data:image/png;base64,${b64}`)
              } catch {
                refImageData.push(img)
              }
            }
          }
          genOptions.refImages = refImageData
        }

        const genResults = await api().imageGen.invoke('generate', genOptions)

        const gen = genResults?.[0]
        if (gen && gen.status === 'done') {
          await canvasStore.updateNode(nodeId, {
            data: {
              ...node.data,
              status: 'done',
              generation_id: gen.id,
              result_path: gen.result_path,
              revised_prompt: gen.revised_prompt || ''
            }
          })
        } else {
          throw new Error(gen?.error || 'Image generation failed')
        }
        break
      }

      case 'img2img': {
        const refImages = upstream.images
        if (!refImages.length) throw new Error('No reference image connected')

        const project = canvasStore.currentProject
        if (!project?.image_provider_id || !project?.image_model_id) {
          throw new Error('Please configure image provider in canvas settings')
        }

        const prompt = upstream.texts.join('\n') || node.data.prompt || 'Generate a variation of this image'

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, status: 'running' }
        })

        // Convert file paths to base64 for ref images
        const refImageData: string[] = []
        for (const img of refImages) {
          if (img.startsWith('data:')) {
            refImageData.push(img)
          } else {
            // It's a relative path, read as base64
            try {
              const dataDir = await api().dataDir.get()
              const fullPath = `${dataDir}/${img}`
              const b64 = await api().chat.invoke('readFileBase64', fullPath)
              refImageData.push(`data:image/png;base64,${b64}`)
            } catch {
              refImageData.push(img)
            }
          }
        }

        const genResults = await api().imageGen.invoke('generate', {
          prompt,
          refImages: refImageData,
          modelProviderId: project.image_provider_id,
          modelId: project.image_model_id,
          size: node.data.size || '1:1',
          quality: node.data.quality || 'auto'
        })

        const gen = genResults?.[0]
        if (gen && gen.status === 'done') {
          await canvasStore.updateNode(nodeId, {
            data: {
              ...node.data,
              status: 'done',
              generation_id: gen.id,
              result_path: gen.result_path,
              revised_prompt: gen.revised_prompt || ''
            }
          })
        } else {
          throw new Error(gen?.error || 'Image generation failed')
        }
        break
      }

      case 'imageResult': {
        // Pull result from upstream image
        if (upstream.images.length > 0) {
          await canvasStore.updateNode(nodeId, {
            data: { ...node.data, result_path: upstream.images[0] }
          })
        }
        break
      }
    }
  }

  // Validate that all nodes with required inputs are properly connected
  function validateConnectivity(projectId: string): { valid: boolean; errors: string[] } {
    const canvasStore = useCanvasStore()
    const nodes = canvasStore.nodes.filter((n) => n.project_id === projectId)
    const edges = canvasStore.edges.filter((e) => e.project_id === projectId)
    const errors: string[] = []

    for (const node of nodes) {
      const def = getNodeTypeDef(node.type)
      if (!def) continue
      for (const input of def.inputs) {
        if (!input.required) continue
        const hasConn = edges.some((e) => e.target_node_id === node.id && e.target_handle === input.handle)
        if (!hasConn) {
          // Source nodes with data are exempt
          if (node.type === 'textInput' && node.data.text) continue
          if (node.type === 'refImage' && (node.data.image_data || node.data.image_path)) continue
          errors.push(`${def.label} node missing required input: ${input.handle}`)
        }
      }
    }
    return { valid: errors.length === 0, errors }
  }

  // Get predecessor node IDs for a given node
  function getPredecessors(nodeId: string, projectId: string): string[] {
    const canvasStore = useCanvasStore()
    return canvasStore.edges
      .filter((e) => e.project_id === projectId && e.target_node_id === nodeId)
      .map((e) => e.source_node_id)
  }

  async function runWorkflow(projectId: string): Promise<{ ok: boolean; message: string }> {
    if (running.value) return { ok: false, message: 'Workflow already running' }
    running.value = true
    const canvasStore = useCanvasStore()

    try {
      // Validate connectivity first
      const { valid, errors } = validateConnectivity(projectId)
      if (!valid) {
        throw new Error(errors.join('; '))
      }

      const concurrency = canvasStore.currentProject?.concurrency || 1
      const sorted = topologicalSort(projectId)
      if (sorted.length === 0) throw new Error('No nodes to execute')

      // Initialize statuses
      const statusMap = new Map<string, TaskStatus>()
      for (const id of sorted) statusMap.set(id, 'pending')
      tasks.value = sorted.map((id) => ({ nodeId: id, status: 'pending' as TaskStatus }))
      nodeStatuses.value = statusMap

      // Mark source nodes as done immediately
      for (const nodeId of sorted) {
        const node = canvasStore.nodes.find((n) => n.id === nodeId)
        if (!node) continue
        if (node.type === 'textInput' && node.data.text) {
          statusMap.set(nodeId, 'done')
        }
        if (node.type === 'refImage' && (node.data.image_data || node.data.image_path)) {
          statusMap.set(nodeId, 'done')
        }
      }

      // Concurrent execution loop: pick ready nodes, execute up to concurrency limit
      const allNodes = new Set(sorted)
      while (true) {
        // Find nodes that are ready: pending + all predecessors finished
        const ready: string[] = []
        const blocked: string[] = []
        for (const nodeId of allNodes) {
          if (statusMap.get(nodeId) !== 'pending') continue
          const preds = getPredecessors(nodeId, projectId)
          const allPredsFinished = preds.every((p) => {
            const s = statusMap.get(p)
            return s !== 'pending' && s !== 'running'
          })
          if (!allPredsFinished) continue
          // If any predecessor errored/blocked, this node is blocked
          const anyPredFailed = preds.some((p) => {
            const s = statusMap.get(p)
            return s === 'error' || s === 'blocked'
          })
          if (anyPredFailed) {
            blocked.push(nodeId)
          } else {
            ready.push(nodeId)
          }
        }

        // Mark blocked nodes
        for (const nodeId of blocked) {
          statusMap.set(nodeId, 'blocked')
          const node = canvasStore.nodes.find((n) => n.id === nodeId)
          if (node) {
            await canvasStore.updateNode(nodeId, {
              data: { ...node.data, status: 'blocked', error: 'Upstream node failed' }
            })
          }
        }

        if (ready.length === 0 && blocked.length === 0) break // All done

        if (ready.length === 0) continue // Only blocked found, loop to propagate

        // Take up to concurrency limit
        const batch = ready.slice(0, concurrency)

        // Execute batch in parallel
        await Promise.all(batch.map(async (nodeId) => {
          const node = canvasStore.nodes.find((n) => n.id === nodeId)
          if (!node) { statusMap.set(nodeId, 'skipped'); return }

          // Check required inputs have data
          const { ok, missing } = checkRequiredInputs(nodeId, projectId)
          const def = getNodeTypeDef(node.type)
          if (!ok && def && def.inputs.some((i) => i.required)) {
            statusMap.set(nodeId, 'blocked')
            await canvasStore.updateNode(nodeId, {
              data: { ...node.data, status: 'blocked', error: `Missing inputs: ${missing.join(', ')}` }
            })
            return
          }

          statusMap.set(nodeId, 'running')
          try {
            await executeNode(nodeId, projectId)
            statusMap.set(nodeId, 'done')
          } catch (e: any) {
            statusMap.set(nodeId, 'error')
            await canvasStore.updateNode(nodeId, {
              data: { ...node.data, status: 'error', error: e?.message || 'Unknown error' }
            })
          }
        }))
      }

      nodeStatuses.value = statusMap

      // Summarize results
      const doneCount = [...statusMap.values()].filter((s) => s === 'done').length
      const errorCount = [...statusMap.values()].filter((s) => s === 'error').length
      const blockedCount = [...statusMap.values()].filter((s) => s === 'blocked').length
      if (errorCount > 0 || blockedCount > 0) {
        return { ok: false, message: `${doneCount} done, ${errorCount} error, ${blockedCount} blocked` }
      }
      return { ok: true, message: `${doneCount} nodes done` }
    } catch (e: any) {
      // Global workflow error — surface it on all pending nodes
      const canvasStore2 = useCanvasStore()
      for (const node of canvasStore2.nodes.filter((n) => n.project_id === projectId)) {
        if (!node.data.status || node.data.status === 'pending') {
          await canvasStore2.updateNode(node.id, {
            data: { ...node.data, status: 'error', error: e?.message || 'Workflow failed' }
          })
        }
      }
      return { ok: false, message: e?.message || 'Workflow failed' }
    } finally {
      running.value = false
    }
  }

  async function executeSingleNode(nodeId: string, projectId: string) {
    if (running.value) return // Block during workflow execution
    const canvasStore = useCanvasStore()
    const node = canvasStore.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const { ok, missing } = checkRequiredInputs(nodeId, projectId)
    const def = getNodeTypeDef(node.type)
    if (!ok && def && def.inputs.some((i) => i.required)) {
      await canvasStore.updateNode(nodeId, {
        data: { ...node.data, status: 'error', error: `Missing required inputs: ${missing.join(', ')}` }
      })
      return
    }

    try {
      await executeNode(nodeId, projectId)
    } catch (e: any) {
      await canvasStore.updateNode(nodeId, {
        data: { ...node.data, status: 'error', error: e?.message || 'Unknown error' }
      })
    }
  }

  return {
    running,
    tasks,
    nodeStatuses,
    runWorkflow,
    executeSingleNode
  }
}
