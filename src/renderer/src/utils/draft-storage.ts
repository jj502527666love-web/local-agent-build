/**
 * 对话输入草稿的 localStorage 持久化（参考 OrbitOS composerDraft.ts）。
 *
 * 设计：
 *  - key 带账号前缀（读 cloud_user 的 id），防账号热切换后草稿串号泄漏；
 *  - 附件只存元数据（name/type），dataUri/文本内容不持久化（体积与敏感双重考虑），
 *    恢复时 attachments 置空数组、以 droppedAttachments 告知调用方丢弃数量；
 *  - 读取逐项校验（版本/字段类型/过期），任一不符整条丢弃——宁可丢草稿不可恢复出坏状态；
 *  - 7 天过期。
 */
export interface StoredChatDraft {
  v: 1
  updatedAt: number
  inputText: string
  tempKbIds: string[]
  tempSkillIds: string[]
  tempMcpIds: string[]
  tempPromptSkillDirs: string[]
  attachmentsMeta: { name: string; type: string }[]
}

export interface HydratedChatDraft {
  inputText: string
  attachments: any[]
  tempKbIds: string[]
  tempSkillIds: string[]
  tempMcpIds: string[]
  tempPromptSkillDirs: string[]
  /** 恢复时被丢弃的附件数量（>0 表示曾有附件未随草稿恢复） */
  droppedAttachments: number
}

const KEY_PREFIX = 'ladraft:v1:'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** 账号隔离前缀：未登录/读取失败一律 'anon' */
function accountScope(): string {
  try {
    const raw = localStorage.getItem('cloud_user')
    if (!raw) return 'anon'
    const u = JSON.parse(raw)
    return u && u.id != null ? String(u.id) : 'anon'
  } catch {
    return 'anon'
  }
}

function storageKey(convId: string): string {
  return `${KEY_PREFIX}${accountScope()}:${convId}`
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === 'string')
}

/** 读取并校验持久化草稿；不存在/过期/校验失败均返回 null（并顺手清掉坏条目） */
export function loadDraft(convId: string): HydratedChatDraft | null {
  const key = storageKey(convId)
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as StoredChatDraft
    const valid =
      d &&
      d.v === 1 &&
      typeof d.updatedAt === 'number' &&
      Date.now() - d.updatedAt <= MAX_AGE_MS &&
      typeof d.inputText === 'string' &&
      isStringArray(d.tempKbIds) &&
      isStringArray(d.tempSkillIds) &&
      isStringArray(d.tempMcpIds) &&
      isStringArray(d.tempPromptSkillDirs) &&
      Array.isArray(d.attachmentsMeta) &&
      d.attachmentsMeta.every((a) => a && typeof a.name === 'string' && typeof a.type === 'string')
    if (!valid) throw new Error('invalid draft shape')
    return {
      inputText: d.inputText,
      attachments: [],
      tempKbIds: [...d.tempKbIds],
      tempSkillIds: [...d.tempSkillIds],
      tempMcpIds: [...d.tempMcpIds],
      tempPromptSkillDirs: [...d.tempPromptSkillDirs],
      droppedAttachments: d.attachmentsMeta.length
    }
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {}
    return null
  }
}

/** 持久化草稿（调用方负责防抖）。空草稿（无文本无附件无 temp）直接删条目，免占存储。 */
export function saveDraft(
  convId: string,
  draft: {
    inputText: string
    attachments: any[]
    tempKbIds: string[]
    tempSkillIds: string[]
    tempMcpIds: string[]
    tempPromptSkillDirs: string[]
  }
): void {
  const isEmpty =
    !draft.inputText &&
    draft.attachments.length === 0 &&
    draft.tempKbIds.length === 0 &&
    draft.tempSkillIds.length === 0 &&
    draft.tempMcpIds.length === 0 &&
    draft.tempPromptSkillDirs.length === 0
  const key = storageKey(convId)
  try {
    if (isEmpty) {
      localStorage.removeItem(key)
      return
    }
    const stored: StoredChatDraft = {
      v: 1,
      updatedAt: Date.now(),
      inputText: draft.inputText,
      tempKbIds: [...draft.tempKbIds],
      tempSkillIds: [...draft.tempSkillIds],
      tempMcpIds: [...draft.tempMcpIds],
      tempPromptSkillDirs: [...draft.tempPromptSkillDirs],
      attachmentsMeta: draft.attachments.map((a) => ({ name: String(a?.name ?? ''), type: String(a?.type ?? '') }))
    }
    localStorage.setItem(key, JSON.stringify(stored))
  } catch {
    // localStorage 写失败（配额满等）：静默降级为纯内存草稿
  }
}

export function clearStoredDraft(convId: string): void {
  try {
    localStorage.removeItem(storageKey(convId))
  } catch {}
}

/** 清空当前账号前缀下的全部草稿（账号退出/数据重置时调用） */
export function clearAllStoredDrafts(): void {
  try {
    const prefix = `${KEY_PREFIX}${accountScope()}:`
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {}
}
