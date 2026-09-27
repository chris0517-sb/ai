import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn / Magic UI 慣用的 className 合併工具 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** localStorage／sessionStorage 讀寫一律包 try/catch：無痕視窗、封鎖網站資料、預覽環境都可能直接丟錯 */
export function storageGet(kind: 'local' | 'session', key: string): string | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    return s.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(kind: 'local' | 'session', key: string, value: string): boolean {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    s.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function clamp(x: number, a = 0, b = 1) {
  return x < a ? a : x > b ? b : x
}

export function searchParams(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search)
  } catch {
    return new URLSearchParams()
  }
}

/** 把 CSS 變數（token）解析成實際的 rgba 數字，給 canvas／SVG 用——元件裡不寫色碼，顏色一律從 token 來 */
export type RGBA = [number, number, number, number]
const colorCache = new Map<string, RGBA>()

export function tokenRGBA(token: string, el: Element = document.documentElement): RGBA {
  const key = token + '|' + (el === document.documentElement ? 'root' : 'el')
  const hit = el === document.documentElement ? colorCache.get(key) : undefined
  if (hit) return hit
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  probe.style.display = 'none'
  el.appendChild(probe)
  const c = getComputedStyle(probe).color
  probe.remove()
  const m = c.match(/rgba?\(([^)]+)\)/)
  let out: RGBA = [255, 255, 255, 1]
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    out = [parts[0] ?? 255, parts[1] ?? 255, parts[2] ?? 255, parts[3] ?? 1]
  }
  if (el === document.documentElement) colorCache.set(key, out)
  return out
}

export function clearTokenCache() {
  colorCache.clear()
}

export function rgba(c: RGBA | [number, number, number], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`
}
