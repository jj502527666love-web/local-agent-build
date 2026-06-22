// 商城适配器注册表：按连接器 platform 分发到对应 MallAdapter。
// 新增第 N 个商城 = 这里加一行 + 写一个 xxx-adapter。
import type { MallAdapter } from './types'
import { eweiAdapter } from './ewei-adapter'
import { diandaAdapter } from './dianda-adapter'
import { qdyunAdapter } from './qdyun-adapter'

const adapters: Record<string, MallAdapter> = {
  ewei: eweiAdapter,
  dianda: diandaAdapter,
  qdyun: qdyunAdapter,
}

/** 已注册的平台 key 列表（renderer 平台选择器可据此渲染）。 */
export const MALL_PLATFORMS = Object.keys(adapters)

/** 按 platform 取适配器；未知/空回退 ewei（向后兼容旧连接器）。 */
export function getAdapter(platform: string | undefined | null): MallAdapter {
  const key = (platform || 'ewei').toString().toLowerCase()
  return adapters[key] || eweiAdapter
}

/** 取连接器对应适配器的能力位（renderer 据此显隐选门店/验证码等）。 */
export function getCapabilities(platform: string | undefined | null) {
  return getAdapter(platform).capabilities
}
