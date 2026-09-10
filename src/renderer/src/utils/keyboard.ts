/**
 * IME（输入法）组字判定。
 *
 * 组字会话进行中的 keydown 事件（含 Enter 上屏、Esc 取消候选、方向键选词）
 * 不应触发任何 UI 行为（提交表单 / 关闭弹窗 / 快捷键）。组字中按 Esc 时
 * isComposing 仍为 true（组字尚未结束），故整个 keydown 直接放行。
 *
 * keyCode 229 已 deprecated，但部分国产输入法组字期间 isComposing 不可靠，
 * 仍依赖 229 兜底。参考 OrbitOS keyboardEvent.ts 的做法：命中即 return 整个回调。
 */
export function isImeEvent(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229
}
