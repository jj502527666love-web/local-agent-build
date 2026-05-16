import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface CanvasProject {
  id: string
  title: string
  text_provider_id: string
  text_model_id: string
  image_provider_id: string
  image_model_id: string
  /** v0.6.9+ 「图片反推」节点默认视觉模型（节点可覆盖，可为空字符串） */
  vision_provider_id: string
  vision_model_id: string
  concurrency: number
  system_prompt: string
  /** 布局方向：'LR' 左到右（默认）/ 'TB' 上到下 */
  layout_direction: string
  created_at: string
  updated_at: string
}

export interface CanvasNode {
  id: string
  project_id: string
  type: string
  position_x: number
  position_y: number
  width: number
  height: number
  data: Record<string, any>
  created_at: string
}

export interface CanvasEdge {
  id: string
  project_id: string
  source_node_id: string
  source_handle: string
  target_node_id: string
  target_handle: string
  created_at: string
}

const api = () => (window as any).api

export const useCanvasStore = defineStore('canvas', () => {
  const projects = ref<CanvasProject[]>([])
  const currentProject = ref<CanvasProject | null>(null)
  const nodes = ref<CanvasNode[]>([])
  const edges = ref<CanvasEdge[]>([])

  async function fetchProjects() {
    projects.value = await api().canvas.invoke('listProjects')
  }

  async function createProject(data: {
    title: string
    text_provider_id?: string
    text_model_id?: string
    image_provider_id?: string
    image_model_id?: string
    vision_provider_id?: string
    vision_model_id?: string
    concurrency?: number
    system_prompt?: string
    layout_direction?: string
  }): Promise<CanvasProject> {
    const project = await api().canvas.invoke('createProject', JSON.parse(JSON.stringify(data)))
    projects.value.unshift(project)
    return project
  }

  async function updateProject(id: string, data: {
    title?: string
    text_provider_id?: string
    text_model_id?: string
    image_provider_id?: string
    image_model_id?: string
    vision_provider_id?: string
    vision_model_id?: string
    concurrency?: number
    system_prompt?: string
    layout_direction?: string
  }): Promise<CanvasProject | null> {
    const updated = await api().canvas.invoke('updateProject', id, data)
    const idx = projects.value.findIndex((p) => p.id === id)
    if (idx >= 0 && updated) projects.value[idx] = updated
    if (currentProject.value?.id === id && updated) currentProject.value = updated
    return updated
  }

  /**
   * v0.6.9+ 打开画布的独立图片目录（dataDir/canvas/{projectId}/）。
   * 主进程的 canvas:openProjectImageDir 会保证目录存在再调 shell.openPath，
   * 返回 { success, dir, error? } 让 UI 显示具体反馈。
   */
  async function openProjectImageDir(id: string): Promise<{ success: boolean; dir?: string; error?: string }> {
    return await api().canvas.invoke('openProjectImageDir', id)
  }

  async function deleteProject(id: string) {
    await api().canvas.invoke('deleteProject', id)
    projects.value = projects.value.filter((p) => p.id !== id)
    if (currentProject.value?.id === id) {
      currentProject.value = null
      nodes.value = []
      edges.value = []
    }
  }

  async function loadProject(id: string) {
    const project = await api().canvas.invoke('getProject', id)
    if (!project) return
    currentProject.value = project
    const loadedNodes: CanvasNode[] = await api().canvas.invoke('listNodes', id)
    // Reset stale running/blocked states from a previous (possibly crashed) session.
    // Keep 'error' so the user can see the last failure reason after reopening the canvas.
    const staleIds: string[] = []
    for (const n of loadedNodes) {
      const st = n.data?.status
      if (st === 'running' || st === 'blocked') {
        n.data = { ...n.data, status: 'idle', error: '' }
        staleIds.push(n.id)
      }
    }
    nodes.value = loadedNodes
    edges.value = await api().canvas.invoke('listEdges', id)
    // Persist the resets in the background; UI already reflects the cleaned state
    if (staleIds.length > 0) {
      for (const nodeId of staleIds) {
        const n = loadedNodes.find((x) => x.id === nodeId)
        if (!n) continue
        api().canvas.invoke('updateNode', nodeId, { data: JSON.parse(JSON.stringify(n.data)) }).catch(() => {})
      }
    }
  }

  async function addNode(projectId: string, data: {
    type: string
    position_x: number
    position_y: number
    width?: number
    height?: number
    data?: Record<string, any>
  }): Promise<CanvasNode> {
    const node = await api().canvas.invoke('createNode', projectId, JSON.parse(JSON.stringify(data)))
    nodes.value.push(node)
    return node
  }

  async function updateNode(id: string, data: Partial<{
    position_x: number
    position_y: number
    width: number
    height: number
    data: Record<string, any>
  }>) {
    const updated = await api().canvas.invoke('updateNode', id, JSON.parse(JSON.stringify(data)))
    const idx = nodes.value.findIndex((n) => n.id === id)
    if (idx >= 0 && updated) nodes.value[idx] = updated
  }

  async function updateNodePositions(updates: { id: string; position_x: number; position_y: number }[]) {
    await api().canvas.invoke('updateNodePositions', JSON.parse(JSON.stringify(updates)))
    for (const u of updates) {
      const node = nodes.value.find((n) => n.id === u.id)
      if (node) {
        node.position_x = u.position_x
        node.position_y = u.position_y
      }
    }
  }

  async function removeNode(id: string) {
    await api().canvas.invoke('deleteNode', id)
    nodes.value = nodes.value.filter((n) => n.id !== id)
    edges.value = edges.value.filter((e) => e.source_node_id !== id && e.target_node_id !== id)
  }

  async function addEdge(projectId: string, data: {
    source_node_id: string
    source_handle: string
    target_node_id: string
    target_handle: string
  }): Promise<CanvasEdge> {
    const edge = await api().canvas.invoke('createEdge', projectId, JSON.parse(JSON.stringify(data)))
    edges.value.push(edge)
    return edge
  }

  async function removeEdge(id: string) {
    await api().canvas.invoke('deleteEdge', id)
    edges.value = edges.value.filter((e) => e.id !== id)
  }

  async function removeEdgesByHandle(nodeId: string, handleId: string) {
    const toRemove = edges.value.filter(
      (e) => (e.source_node_id === nodeId && e.source_handle === handleId)
    )
    for (const edge of toRemove) {
      await api().canvas.invoke('deleteEdge', edge.id)
    }
    edges.value = edges.value.filter(
      (e) => !(e.source_node_id === nodeId && e.source_handle === handleId)
    )
  }

  async function saveState() {
    if (!currentProject.value) return
    const nodeStates = nodes.value.map((n) => ({
      id: n.id,
      position_x: n.position_x,
      position_y: n.position_y,
      data: n.data
    }))
    await api().canvas.invoke('saveProjectState', currentProject.value.id, JSON.parse(JSON.stringify(nodeStates)))
  }

  async function duplicateProject(sourceId: string): Promise<CanvasProject> {
    const source = projects.value.find((p) => p.id === sourceId)
      || await api().canvas.invoke('getProject', sourceId)
    if (!source) throw new Error('Project not found')

    // Create new project with same settings
    const newProject = await createProject({
      title: source.title + '-副本',
      text_provider_id: source.text_provider_id,
      text_model_id: source.text_model_id,
      image_provider_id: source.image_provider_id,
      image_model_id: source.image_model_id,
      vision_provider_id: source.vision_provider_id,
      vision_model_id: source.vision_model_id,
      concurrency: source.concurrency,
      system_prompt: source.system_prompt,
      layout_direction: source.layout_direction
    })

    // Load source nodes and edges
    const srcNodes: CanvasNode[] = await api().canvas.invoke('listNodes', sourceId)
    const srcEdges: CanvasEdge[] = await api().canvas.invoke('listEdges', sourceId)

    // Clean node data: keep user inputs, strip results and statuses
    function cleanNodeData(type: string, data: Record<string, any>): Record<string, any> {
      switch (type) {
        case 'textInput':
          return { text: data.text || '' }
        case 'refImage':
          // Intentionally start empty; the migration step below will populate image_path
          // after copying the underlying file into the new project directory.
          // If copy fails we leave the node empty rather than keeping a dangling path
          // that points into the old (possibly deleted) project dir.
          return { image_data: '', image_path: '' }
        case 'aiText':
          return { text: data.text || '', result: '', status: 'idle' }
        case 'text2img':
          return { model_provider_id: data.model_provider_id || '', model_id: data.model_id || '', size: data.size || '1:1', quality: data.quality || 'auto', status: 'idle', generation_id: '', result_path: '' }
        case 'img2img':
          return { model_provider_id: data.model_provider_id || '', model_id: data.model_id || '', size: data.size || '1:1', quality: data.quality || 'auto', prompt: data.prompt || '', status: 'idle', generation_id: '', result_path: '' }
        case 'imageResult':
          return { generation_id: '', result_path: '', result_url: '' }
        case 'promptSlice':
          return { rows: (data.rows || []).map((r: any) => ({ id: r.id, text: r.text || '' })) }
        case 'reverse':
          // 复制画布作为模板：保留用户配置（视觉模型 / 风格 / 语言 / 自定义提示词），
          // 清空运行态（result / status / error），让新画布从 idle 开始
          return {
            vision_provider_id: data.vision_provider_id || '',
            vision_model_id: data.vision_model_id || '',
            style_preset: data.style_preset || 'general',
            output_lang: data.output_lang || 'cn',
            custom_prompt: data.custom_prompt || '',
            result: '',
            status: 'idle',
            error: ''
          }
        default:
          return { ...data, status: undefined, error: undefined }
      }
    }

    // Copy nodes, build old→new ID map
    const idMap = new Map<string, string>()
    for (const n of srcNodes) {
      const created = await api().canvas.invoke('createNode', newProject.id, JSON.parse(JSON.stringify({
        type: n.type,
        position_x: n.position_x,
        position_y: n.position_y,
        width: n.width,
        height: n.height,
        data: cleanNodeData(n.type, n.data)
      })))
      idMap.set(n.id, created.id)

      // For refImage nodes, also copy the underlying image file into the new project's dir.
      // Otherwise the new project would reference files under the old project dir and break
      // when the source project is deleted. Also opportunistically migrate legacy
      // base64 image_data into on-disk storage.
      if (n.type === 'refImage') {
        const oldData = n.data || {}
        let dataUri = ''
        if (oldData.image_data) {
          dataUri = oldData.image_data
        } else if (oldData.image_path) {
          try {
            const dataDir = await api().dataDir.get()
            const fullPath = `${dataDir}/${oldData.image_path}`
            const b64 = await api().chat.invoke('readFileBase64', fullPath)
            const ext = String(oldData.image_path).split('.').pop()?.toLowerCase() || 'png'
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
              : ext === 'webp' ? 'image/webp'
              : ext === 'gif' ? 'image/gif'
              : 'image/png'
            dataUri = `data:${mime};base64,${b64}`
          } catch {
            dataUri = ''
          }
        }
        if (dataUri) {
          try {
            const saved = await api().canvas.invoke('saveNodeImage', newProject.id, created.id, dataUri)
            await api().canvas.invoke('updateNode', created.id, {
              data: { image_data: '', image_path: saved.image_path }
            })
          } catch {
            // Fall back silently — the duplicated node will just be empty
          }
        }
      }
    }

    // Copy edges with remapped node IDs
    for (const e of srcEdges) {
      const newSource = idMap.get(e.source_node_id)
      const newTarget = idMap.get(e.target_node_id)
      if (newSource && newTarget) {
        await api().canvas.invoke('createEdge', newProject.id, JSON.parse(JSON.stringify({
          source_node_id: newSource,
          source_handle: e.source_handle,
          target_node_id: newTarget,
          target_handle: e.target_handle
        })))
      }
    }

    return newProject
  }

  function reset() {
    currentProject.value = null
    nodes.value = []
    edges.value = []
  }

  return {
    projects,
    currentProject,
    nodes,
    edges,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    loadProject,
    openProjectImageDir,
    addNode,
    updateNode,
    updateNodePositions,
    removeNode,
    addEdge,
    removeEdge,
    removeEdgesByHandle,
    saveState,
    reset
  }
})
