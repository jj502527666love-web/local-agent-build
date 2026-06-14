/**
 * 主题主色 → Tailwind primary 色阶（CSS 变量）注入。
 *
 * 云控端只下发一个主色（hex），这里用 tint/shade 混合法派生 50~900 共 9 档：
 * 浅档与白色混合、深档与黑色混合、500 为主色本身。混合法对任意主色都稳定，
 * 不会出现 HSL 色相旋转导致的偏色。派生结果写入 documentElement 的
 * --color-primary-N 变量，tailwind.config.js 的 primary 各档引用这些变量
 * （并带品牌橙作为 fallback，未注入时外观不变）。
 */

/** 桌面端内置默认主色（与 tailwind fallback、品牌橙一致） */
export const DEFAULT_PRIMARY = '#F27638'

// 各档相对主色的混合系数：>0 与白混合（数值为白色占比），<0 与黑混合（绝对值为黑色占比），0 为主色本身
const MIX_RATIOS: Record<number, number> = {
  50: 0.95,
  100: 0.88,
  200: 0.73,
  300: 0.53,
  400: 0.28,
  500: 0,
  600: -0.12,
  700: -0.28,
  800: -0.44,
  900: -0.6,
}

interface Rgb {
  r: number
  g: number
  b: number
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const h = (v: number): string =>
    Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** 把 base 与 target 按 t（target 占比 0~1）线性混合 */
function mix(base: Rgb, target: Rgb, t: number): Rgb {
  return {
    r: base.r + (target.r - base.r) * t,
    g: base.g + (target.g - base.g) * t,
    b: base.b + (target.b - base.b) * t,
  }
}

/** 主色 hex → { 50: '#..', ..., 900: '#..' }；非法输入回退默认主色 */
export function derivePalette(hex: string): Record<number, string> {
  const base = hexToRgb(hex) || hexToRgb(DEFAULT_PRIMARY)!
  const out: Record<number, string> = {}
  for (const [level, ratio] of Object.entries(MIX_RATIOS)) {
    if (ratio > 0) {
      out[+level] = rgbToHex(mix(base, WHITE, ratio))
    } else if (ratio < 0) {
      out[+level] = rgbToHex(mix(base, BLACK, -ratio))
    } else {
      out[+level] = rgbToHex(base)
    }
  }
  return out
}

/**
 * 把派生色阶写入 documentElement 的 --color-primary-N 变量。
 * 应在应用启动尽早调用（用 localStorage 缓存值防闪烁），
 * 并在 site-config 拉到最新主色后再调一次（即时换肤）。
 */
export function applyPrimaryColor(hex: string): void {
  const palette = derivePalette(hex)
  const root = document.documentElement
  for (const [level, value] of Object.entries(palette)) {
    root.style.setProperty(`--color-primary-${level}`, value)
  }
}
