/**
 * 工具审批的持久层：审计流水（tool_approval_records）+「总是允许」规则（tool_approval_rules）。
 *
 * 两表均为本机安全状态，刻意不注册进 sync/registry.ts——审批记录与他设备无关，
 * 授权规则跨设备自动生效也不符合「本机显式授权」的安全语义。
 *
 * 审计流水的生命周期：
 *   requestToolApproval 发起 → insertApprovalRecord（verdict='' 待定）
 *   裁决（用户/规则/决策器/超时/中止）→ resolveApprovalRecord 落定
 *   进程重启时残留的未裁决记录 → database/index.ts 的 expireStalePendingCards 内联标 interrupted
 *   （不从这里导出清理函数：本模块 import database 拿 getDatabase，database 不可反向 import 本模块）
 */
import { v4 as uuid } from 'uuid'
import { getDatabase } from '../database'

export type ApprovalVerdictDb =
  | 'approved'
  | 'rejected'
  | 'timeout'
  | 'aborted'
  | 'auto_approved'
  | 'interrupted'

export type ApprovalDecidedBy = 'user' | 'rule' | 'decider' | 'timeout' | 'system'

export interface ApprovalRuleRow {
  tool_key: string
  enabled: number
  created_at: string
}

/** args 入库前的体积上限（审计用途，截断即可） */
const ARGS_JSON_CAP = 8 * 1024

function argsToJson(args: unknown): string {
  try {
    const s = JSON.stringify(args ?? null)
    return s.length > ARGS_JSON_CAP ? s.slice(0, ARGS_JSON_CAP) + '…[truncated]' : s
  } catch {
    return '[unserializable]'
  }
}

export function insertApprovalRecord(rec: {
  requestId: string
  conversationId: string
  tool: string
  args: unknown
}): void {
  try {
    getDatabase()
      .prepare(
        `INSERT OR REPLACE INTO tool_approval_records (id, conversation_id, request_id, tool, args_json, verdict, decided_by, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, '', '', datetime('now'), '')`
      )
      .run(rec.requestId, rec.conversationId, rec.tool, argsToJson(rec.args))
  } catch (e: any) {
    console.warn('[approval-store] insertApprovalRecord failed:', e?.message)
  }
}

export function resolveApprovalRecord(requestId: string, verdict: ApprovalVerdictDb, decidedBy: ApprovalDecidedBy): void {
  try {
    getDatabase()
      .prepare(
        `UPDATE tool_approval_records SET verdict = ?, decided_by = ?, resolved_at = datetime('now')
         WHERE request_id = ? AND verdict = ''`
      )
      .run(verdict, decidedBy, requestId)
  } catch (e: any) {
    console.warn('[approval-store] resolveApprovalRecord failed:', e?.message)
  }
}

/** 实时查表（无缓存）：规则禁用即时生效 */
export function isRuleApproved(toolKey: string): boolean {
  try {
    const row = getDatabase()
      .prepare(`SELECT enabled FROM tool_approval_rules WHERE tool_key = ?`)
      .get(toolKey) as { enabled: number } | undefined
    return !!row && row.enabled === 1
  } catch {
    return false
  }
}

/** 规则命中免审的审计落库（insert+resolve 合一：发起即裁决，无等待期） */
export function recordAutoApproved(conversationId: string, toolKey: string, args: unknown): void {
  try {
    const id = uuid()
    getDatabase()
      .prepare(
        `INSERT INTO tool_approval_records (id, conversation_id, request_id, tool, args_json, verdict, decided_by, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, 'auto_approved', 'rule', datetime('now'), datetime('now'))`
      )
      .run(id, conversationId, id, toolKey, argsToJson(args))
  } catch (e: any) {
    console.warn('[approval-store] recordAutoApproved failed:', e?.message)
  }
}

export function enableApprovalRule(toolKey: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO tool_approval_rules (tool_key, enabled, created_at) VALUES (?, 1, datetime('now'))
       ON CONFLICT(tool_key) DO UPDATE SET enabled = 1`
    )
    .run(toolKey)
}

export function disableApprovalRule(toolKey: string): void {
  // 禁用=删行（不存在规则即不免审，语义最简）
  getDatabase().prepare(`DELETE FROM tool_approval_rules WHERE tool_key = ?`).run(toolKey)
}

export function listApprovalRules(): ApprovalRuleRow[] {
  try {
    return getDatabase()
      .prepare(`SELECT tool_key, enabled, created_at FROM tool_approval_rules ORDER BY created_at DESC`)
      .all() as ApprovalRuleRow[]
  } catch {
    return []
  }
}
