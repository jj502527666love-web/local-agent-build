import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface CanvasProject {
  id: string
  title: string
  text_provider_id: string
  text_model_id: string
  image_provider_id: string
  image_model_id: string
  concurrency: number
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
    concurrency?: number
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
    concurrency?: number
  }): Promise<CanvasProject | null> {
    const updated = await api().canvas.invoke('updateProject', id, data)
    const idx = projects.value.findIndex((p) => p.id === id)
    if (idx >= 0 && updated) projects.value[idx] = updated
    if (currentProject.value?.id === id && updated) currentProject.value = updated
    return updated
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
    nodes.value = await api().canvas.invoke('listNodes', id)
    edges.value = await api().canvas.invoke('listEdges', id)
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
      concurrency: source.concurrency
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
          return { image_data: data.image_data || '', image_path: data.image_path || '' }
        case 'aiText':
          return { text: data.text || '', result: '', status: 'idle' }
        case 'text2img':
          return { model_provider_id: data.model_provider_id || '', model_id: data.model_id || '', size: data.size || '1:1', quality: data.quality || 'auto', status: 'idle', generation_id: '', result_path: '' }
        case 'img2img':
          return { model_provider_id: data.model_provider_id || '', model_id: data.model_id || '', size: data.size || '1:1', quality: data.quality || 'auto', prompt: data.prompt || '', status: 'idle', generation_id: '', result_path: '' }
        case 'imageResult':
          return { generation_id: '', result_path: '', result_url: '' }
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
    addNode,
    updateNode,
    updateNodePositions,
    removeNode,
    addEdge,
    removeEdge,
    saveState,
    reset
  }
})
