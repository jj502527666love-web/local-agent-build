import { ref, computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { recordUsage } from '@/utils/model-usage-hints'
import { getNodeTypeDef } from './useNodeTypes'

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'blocked'

export interface WorkflowTask {
  nodeId: string
  status: TaskStatus
  error?: string
}

const api = () => (window as any).api

/** aiText 节点未设置自定义 system_prompt 时使用的默认模板（中文，扩写为生图提示词）。
 * 用户可在节点 UI 上清空（空字符串）以让 LLM 按用户输入自由响应。 */
const AI_TEXT_DEFAULT_SYSTEM_PROMPT =
  '你是文本助手。请将给定文本改写、扩写或润色，使其适合作为 AI 图像生成的提示词。仅输出改写后的文本，不要其他内容。'

/** 按相对/绝对路径的扩展名推断真实 MIME。后端会按 MIME 决定 stripJpeg/stripPng 分支，
 * 错误的 MIME 会导致 EXIF/ICC 未被剥离，触发上游严格服务（如带微信 ICC 的图片）拒绝。 */
function inferImageMime(path: string): string {
  const lastDot = path.lastIndexOf('.')
  if (lastDot < 0) return 'image/png'
  const ext = path.slice(lastDot + 1).toLowerCase().replace(/[?#].*$/, '')
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

/** 把上游 images 列表（可能是 data URI、相对路径、或空字符串）统一解析为可直接
 * 上传的 data URI 数组。读取失败的图片会被跳过并 console.warn——避免把相对路径
 * 字符串当作 base64 推到上游导致请求乱码失败。 */
async function resolveRefImages(images: string[]): Promise<string[]> {
  const result: string[] = []
  let failed = 0
  for (const img of images) {
    if (!img) continue
    if (img.startsWith('data:')) {
      result.push(img)
      continue
    }
    try {
      const dataDir = await api().dataDir.get()
      const fullPath = `${dataDir}/${img}`
      const b64 = await api().chat.invoke('readFileBase64', fullPath)
      const mime = inferImageMime(img)
      result.push(`data:${mime};base64,${b64}`)
    } catch (e) {
      failed++
      console.warn('[Canvas] 读取参考图失败，已跳过:', img, e)
    }
  }
  // 把失败计数挂到数组上（不改 return type 兼容现有调用方），上层可读取并提示
  ;(result as any).__failedCount = failed
  return result
}

// Module-level singletons so all composable consumers share the same state.
// - workflowRunning: true while runWorkflow owns the canvas
// - activeSingleRuns: tracks node IDs currently running via executeSingleNode
// - cancelRequested: soft-cancel flag; runWorkflow loop won't launch new tasks once true,
//   but already-inflight tasks are allowed to finish so DB/state stays consistent.
// - runningProjectId: which project the current workflow belongs to (for global badge)
const workflowRunning = ref(false)
const tasks = ref<WorkflowTask[]>([])
const nodeStatuses = ref<Map<string, TaskStatus>>(new Map())
const activeSingleRuns = ref<Set<string>>(new Set())
const cancelRequested = ref(false)
const runningProjectId = ref<string | null>(null)
// 参考图读取失败聚合：每次 runWorkflow / executeSingleNode 开始时清空，
// 上游 UI（CanvasEditorView）可在执行完成后读取并 toast 提示，避免静默吞掉部分失败
const refImageWarnings = ref<Array<{ nodeId: string; failed: number; total: number }>>([])

// Legacy alias kept for existing bindings (`workflowRunning` in view)
const running = workflowRunning

// Derived flag: any execution in flight (workflow or any single node)
const anyRunning = computed(() => workflowRunning.value || activeSingleRuns.value.size > 0)

export function useWorkflowEngine() {

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

      let outputDef = def.outputs.find((o) => o.handle === edge.source_handle)
      // Dynamic outputs: match any output-* handle to the base output type
      if (!outputDef && def.dynamicOutputs && edge.source_handle.startsWith('output-')) {
        outputDef = def.outputs[0]
      }
      if (!outputDef) continue

      if (outputDef.dataType === 'text') {
        if (sourceNode.type === 'promptSlice') {
          // For promptSlice, get text from the specific row matching the handle
          const handleId = edge.source_handle
          const rowId = handleId.replace('output-', '')
          const row = (sourceNode.data.rows || []).find((r: any) => r.id === rowId)
          if (row?.text) texts.push(row.text)
        } else {
          const text = sourceNode.data.result || sourceNode.data.text || ''
          if (text) texts.push(text)
        }
      } else if (outputDef.dataType === 'image') {
        // 读取优先级：result_path（生图节点产出，相对路径） > image_path（refImage
        // 节点落盘后的相对路径） > image_data（refImage 落盘失败时的内存 base64 兜底）。
        // 旧实现漏读 image_path，导致 refImage 节点持久化成功后参考图 100% 丢失。
        const img =
          sourceNode.data.result_path ||
          sourceNode.data.image_path ||
          sourceNode.data.image_data ||
          ''
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

      case 'promptSlice':
        // Prompt slice nodes don't need execution, they already have data
        break

      case 'aiText': {
        const inputText = upstream.texts.join('\n') || node.data.text || ''
        if (!inputText) throw new Error('AI 文本节点需要输入：请连接上游文本或在节点中填写')

        const project = canvasStore.currentProject
        if (!project?.text_provider_id || !project?.text_model_id) {
          throw new Error('请先在画布设置中配置文本模型')
        }

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, status: 'running' }
        })

        // node.data.system_prompt 行为：
        //   未定义（旧节点 / 新建节点）→ 使用默认中文模板（扩写为图像 prompt）
        //   空字符串                  → 不传 system 角色，让 LLM 按用户输入自由响应
        //   非空字符串                → 使用用户自定义系统提示词
        const customSystemPrompt = node.data.system_prompt
        const systemPrompt =
          customSystemPrompt === undefined ? AI_TEXT_DEFAULT_SYSTEM_PROMPT : customSystemPrompt

        const messages: Array<{ role: 'system' | 'user'; content: string }> = systemPrompt
          ? [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: inputText }
            ]
          : [{ role: 'user', content: inputText }]

        const result = await api().llm.invoke(
          'call',
          project.text_provider_id,
          project.text_model_id,
          messages,
          { notifyStream: false }
        )

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, text: inputText, result: result || inputText, status: 'done' }
        })
        await recordUsage('chat', project.text_provider_id, project.text_model_id)
        break
      }

      case 'text2img': {
        const project = canvasStore.currentProject
        if (!project?.image_provider_id || !project?.image_model_id) {
          throw new Error('请先在画布设置中配置生图模型')
        }

        const globalPrompt = project.system_prompt || ''
        const rawPrompt = upstream.texts.join('\n') || ''
        if (!rawPrompt) throw new Error('文生图节点需要提示词：请连接文本输入或 AI 文本节点')
        // 用 "\n\n---\n\n" 分隔全局风格前缀与本次主题，便于模型区分约束与主题
        const prompt = globalPrompt ? `${globalPrompt}\n\n---\n\n${rawPrompt}` : rawPrompt

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, status: 'running' }
        })

        const refImageData =
          upstream.images.length > 0 ? await resolveRefImages(upstream.images) : []
        const failedRef = (refImageData as any).__failedCount || 0
        if (failedRef > 0) {
          refImageWarnings.value = [
            ...refImageWarnings.value,
            { nodeId, failed: failedRef, total: upstream.images.length }
          ]
        }

        const genOptions: Record<string, any> = {
          prompt,
          modelProviderId: project.image_provider_id,
          modelId: project.image_model_id,
          size: node.data.size || '1:1',
          tierId: node.data.tier_id || '2k',
          quality: node.data.quality || 'auto'
        }
        if (refImageData.length > 0) {
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
              revised_prompt: gen.revised_prompt || '',
              ref_image_count: refImageData.length
            }
          })
          await recordUsage('image', project.image_provider_id, project.image_model_id)
        } else {
          throw new Error(gen?.error || '图像生成失败')
        }
        break
      }

      case 'img2img': {
        if (!upstream.images.length) {
          throw new Error('图生图节点需要参考图：请连接参考图节点或上游图像节点')
        }

        const project = canvasStore.currentProject
        if (!project?.image_provider_id || !project?.image_model_id) {
          throw new Error('请先在画布设置中配置生图模型')
        }

        const globalPromptImg = project?.system_prompt || ''
        const rawPromptImg = upstream.texts.join('\n') || node.data.prompt || ''
        if (!rawPromptImg && !globalPromptImg) {
          throw new Error('图生图节点需要提示词：请连接文本输入、在节点中填写描述或在画布全局提示词中配置')
        }
        const prompt =
          globalPromptImg && rawPromptImg
            ? `${globalPromptImg}\n\n---\n\n${rawPromptImg}`
            : globalPromptImg || rawPromptImg

        await canvasStore.updateNode(nodeId, {
          data: { ...node.data, status: 'running' }
        })

        const refImageData = await resolveRefImages(upstream.images)
        const failedRefImg = (refImageData as any).__failedCount || 0
        if (refImageData.length === 0) {
          throw new Error('参考图读取失败：请检查上游参考图节点是否有效')
        }
        if (failedRefImg > 0) {
          refImageWarnings.value = [
            ...refImageWarnings.value,
            { nodeId, failed: failedRefImg, total: upstream.images.length }
          ]
        }

        const genResults = await api().imageGen.invoke('generate', {
          prompt,
          refImages: refImageData,
          modelProviderId: project.image_provider_id,
          modelId: project.image_model_id,
          size: node.data.size || '1:1',
          tierId: node.data.tier_id || '2k',
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
              revised_prompt: gen.revised_prompt || '',
              ref_image_count: refImageData.length
            }
          })
          await recordUsage('image', project.image_provider_id, project.image_model_id)
        } else {
          throw new Error(gen?.error || '图像生成失败')
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
          errors.push(`${def.label} 节点缺少必需输入：${input.handle}`)
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
    if (workflowRunning.value) return { ok: false, message: '工作流正在运行中' }
    if (activeSingleRuns.value.size > 0) {
      return { ok: false, message: '有节点正在单独执行，请稍候' }
    }
    workflowRunning.value = true
    cancelRequested.value = false
    runningProjectId.value = projectId
    refImageWarnings.value = []
    const canvasStore = useCanvasStore()

    try {
      // Validate connectivity first
      const { valid, errors } = validateConnectivity(projectId)
      if (!valid) {
        throw new Error(errors.join('; '))
      }

      const concurrency = Math.max(1, canvasStore.currentProject?.concurrency || 1)
      const projectNodes = canvasStore.nodes.filter((n) => n.project_id === projectId)
      const sorted = topologicalSort(projectId)
      if (sorted.length === 0) throw new Error('没有可执行的节点')

      // Cycle detection: Kahn's algorithm drops cycle nodes; compare lengths
      if (sorted.length !== projectNodes.length) {
        const inCycle = projectNodes
          .filter((n) => !sorted.includes(n.id))
          .map((n) => {
            const def = getNodeTypeDef(n.type)
            return def?.label || n.type
          })
        throw new Error(`检测到循环依赖：${inCycle.join('、')}`)
      }

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
        if (node.type === 'promptSlice' && node.data.rows?.length > 0) {
          statusMap.set(nodeId, 'done')
        }
      }

      // Sliding-window concurrency: keep up to `concurrency` tasks in flight.
      // Finished slots are refilled as soon as a task completes, not after a batch barrier.
      const allNodes = new Set(sorted)
      const inflight = new Map<string, Promise<void>>()

      const launchTask = (nodeId: string): Promise<void> => {
        const node = canvasStore.nodes.find((n) => n.id === nodeId)
        if (!node) {
          statusMap.set(nodeId, 'skipped')
          return Promise.resolve()
        }

        const { ok, missing } = checkRequiredInputs(nodeId, projectId)
        const def = getNodeTypeDef(node.type)
        if (!ok && def && def.inputs.some((i) => i.required)) {
          statusMap.set(nodeId, 'blocked')
          return canvasStore
            .updateNode(nodeId, {
              data: { ...node.data, status: 'blocked', error: `缺少必需输入：${missing.join('、')}` }
            })
            .then(() => {})
        }

        statusMap.set(nodeId, 'running')
        return executeNode(nodeId, projectId)
          .then(() => {
            statusMap.set(nodeId, 'done')
          })
          .catch(async (e: any) => {
            statusMap.set(nodeId, 'error')
            await canvasStore.updateNode(nodeId, {
              data: { ...node.data, status: 'error', error: e?.message || '未知错误' }
            })
          })
      }

      const findReady = (): { ready: string[]; blocked: string[] } => {
        const ready: string[] = []
        const blocked: string[] = []
        for (const nodeId of allNodes) {
          if (statusMap.get(nodeId) !== 'pending') continue
          if (inflight.has(nodeId)) continue
          const preds = getPredecessors(nodeId, projectId)
          const allPredsFinished = preds.every((p) => {
            const s = statusMap.get(p)
            return s !== 'pending' && s !== 'running'
          })
          if (!allPredsFinished) continue
          const anyPredFailed = preds.some((p) => {
            const s = statusMap.get(p)
            return s === 'error' || s === 'blocked'
          })
          if (anyPredFailed) blocked.push(nodeId)
          else ready.push(nodeId)
        }
        return { ready, blocked }
      }

      while (true) {
        // 软取消：不再启动新任务，但已 inflight 的让它跑完（保证 DB/state 一致）。
        // pending 状态的节点统一打 skipped 并写库，避免切回画布看到僵尸 pending。
        if (cancelRequested.value) {
          for (const nodeId of allNodes) {
            if (statusMap.get(nodeId) === 'pending' && !inflight.has(nodeId)) {
              statusMap.set(nodeId, 'skipped')
              const node = canvasStore.nodes.find((n) => n.id === nodeId)
              if (node) {
                await canvasStore.updateNode(nodeId, {
                  data: { ...node.data, status: 'skipped', error: '已取消' }
                })
              }
            }
          }
          if (inflight.size === 0) break
          await Promise.race(inflight.values())
          continue
        }

        const { ready, blocked } = findReady()

        // Propagate failure to blocked nodes immediately
        for (const nodeId of blocked) {
          statusMap.set(nodeId, 'blocked')
          const node = canvasStore.nodes.find((n) => n.id === nodeId)
          if (node) {
            await canvasStore.updateNode(nodeId, {
              data: { ...node.data, status: 'blocked', error: '上游节点执行失败' }
            })
          }
        }

        // Fill up any free slots with ready tasks
        while (inflight.size < concurrency && ready.length > 0) {
          const nodeId = ready.shift()!
          const task = launchTask(nodeId).finally(() => {
            inflight.delete(nodeId)
          })
          inflight.set(nodeId, task)
        }

        if (inflight.size === 0) {
          // Nothing running, nothing runnable: we're either done or only 'blocked' propagation remains
          const { ready: r2, blocked: b2 } = findReady()
          if (r2.length === 0 && b2.length === 0) break
          continue
        }

        // Wait for any task to finish, then re-evaluate readiness
        await Promise.race(inflight.values())
      }

      nodeStatuses.value = statusMap

      // Summarize results
      const doneCount = [...statusMap.values()].filter((s) => s === 'done').length
      const errorCount = [...statusMap.values()].filter((s) => s === 'error').length
      const blockedCount = [...statusMap.values()].filter((s) => s === 'blocked').length
      if (errorCount > 0 || blockedCount > 0) {
        return { ok: false, message: `${doneCount} 个完成，${errorCount} 个失败，${blockedCount} 个阻塞` }
      }
      return { ok: true, message: `${doneCount} 个节点完成` }
    } catch (e: any) {
      // Global workflow error — surface it on all pending nodes
      const canvasStore2 = useCanvasStore()
      for (const node of canvasStore2.nodes.filter((n) => n.project_id === projectId)) {
        if (!node.data.status || node.data.status === 'pending') {
          await canvasStore2.updateNode(node.id, {
            data: { ...node.data, status: 'error', error: e?.message || '工作流执行失败' }
          })
        }
      }
      return { ok: false, message: e?.message || '工作流执行失败' }
    } finally {
      workflowRunning.value = false
      cancelRequested.value = false
      runningProjectId.value = null
    }
  }

  /** 软取消当前工作流：不再启动新节点，已 inflight 让它跑完保证 DB/state 一致。
   * 仅对 runWorkflow 生效；executeSingleNode 没有循环结构，无法中途打断（fetch 已发） */
  function cancelWorkflow(): boolean {
    if (!workflowRunning.value) return false
    cancelRequested.value = true
    return true
  }

  async function executeSingleNode(nodeId: string, projectId: string) {
    // Block if workflow is running, or this node is already running via single-execution
    if (workflowRunning.value) return
    if (activeSingleRuns.value.has(nodeId)) return
    // 单节点执行入口也清空一次警告聚合，避免与上一次工作流的 warnings 混淆
    refImageWarnings.value = []
    const canvasStore = useCanvasStore()
    const node = canvasStore.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const { ok, missing } = checkRequiredInputs(nodeId, projectId)
    const def = getNodeTypeDef(node.type)
    if (!ok && def && def.inputs.some((i) => i.required)) {
      await canvasStore.updateNode(nodeId, {
        data: { ...node.data, status: 'error', error: `缺少必需输入：${missing.join('、')}` }
      })
      return
    }

    // Track in the module-level singleton so the workflow button and sibling nodes can observe it
    const next = new Set(activeSingleRuns.value)
    next.add(nodeId)
    activeSingleRuns.value = next
    try {
      await executeNode(nodeId, projectId)
    } catch (e: any) {
      await canvasStore.updateNode(nodeId, {
        data: { ...node.data, status: 'error', error: e?.message || '未知错误' }
      })
    } finally {
      const cleared = new Set(activeSingleRuns.value)
      cleared.delete(nodeId)
      activeSingleRuns.value = cleared
    }
  }

  return {
    running,
    workflowRunning,
    activeSingleRuns,
    anyRunning,
    cancelRequested,
    runningProjectId,
    refImageWarnings,
    tasks,
    nodeStatuses,
    runWorkflow,
    cancelWorkflow,
    executeSingleNode
  }
}
