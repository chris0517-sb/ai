import { useSyncExternalStore } from 'react'
import { searchParams } from './utils'

/**
 * 特效分級（規格 §6）：寫在 <html data-fx="high|lite|static">。
 * - high：桌機（非觸控、核心數 ≥4）。全部特效、畫布 DPR 上限 2、背景可互動。
 * - lite：手機／觸控／低核心／deviceMemory ≤4。DPR 上限 1.5、粒子減半、背景不跟手、同時動畫變少。
 * - static：prefers-reduced-motion 或 ?static=1。不播任何動畫，內容直接完整顯示，光球畫一格靜態。
 * - ?fx=high|lite|static 強制指定（強制時不做自動降級）。
 * - 開場後量 3 秒實際 FPS，低於 40 自動降一級（high→lite→static）。
 */
export type FxLevel = 'high' | 'lite' | 'static'

export interface FxInfo {
  level: FxLevel
  forced: boolean
  reason: string
}

function detect(): FxInfo {
  const p = searchParams()
  const q = p.get('fx')
  if (q === 'high' || q === 'lite' || q === 'static') return { level: q, forced: true, reason: 'param:fx' }
  if (p.get('static') === '1') return { level: 'static', forced: true, reason: 'param:static' }
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return { level: 'static', forced: true, reason: 'reduced-motion' }
    }
  } catch {
    /* 沒有 matchMedia 就當沒設定 */
  }
  const mm = (query: string) => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  }
  const coarse = mm('(pointer: coarse)')
  const noHover = mm('(hover: none)')
  const touchPrimary = coarse || (navigator.maxTouchPoints > 0 && noHover)
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (touchPrimary || mobileUA) return { level: 'lite', forced: false, reason: 'touch' }
  if (cores < 4) return { level: 'lite', forced: false, reason: 'cores' }
  if (typeof mem === 'number' && mem <= 4) return { level: 'lite', forced: false, reason: 'memory' }
  return { level: 'high', forced: false, reason: 'desktop' }
}

let info: FxInfo = { level: 'high', forced: false, reason: 'init' }
const listeners = new Set<() => void>()

function apply() {
  const html = document.documentElement
  html.dataset.fx = info.level
  html.dataset.fxReason = info.reason
}

export function initFx(): FxInfo {
  info = detect()
  apply()
  return info
}

export function getFx(): FxInfo {
  return info
}

export function setFxLevel(level: FxLevel, reason: string) {
  if (info.level === level) return
  info = { ...info, level, reason }
  apply()
  listeners.forEach((fn) => fn())
}

export function subscribeFx(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useFx(): FxInfo {
  return useSyncExternalStore(subscribeFx, getFx, getFx)
}

/** 各級的畫布 DPR 上限 */
export function dprCap(level: FxLevel) {
  return level === 'high' ? 2 : 1.5
}

/**
 * 量 3 秒實際 FPS（requestAnimationFrame 的回呼頻率），低於 40 自動降一級。
 * 分頁被切走時 rAF 本來就會停，量到的數字不算數 → 直接放棄這次量測（never-twice／web-testing：隱藏分頁 rAF 暫停＝假凍結）。
 */
export function startFpsProbe(durationMs = 3000) {
  if (info.forced || info.level === 'static') return
  const html = document.documentElement
  let frames = 0
  let t0 = 0
  let aborted = false
  const onVis = () => {
    if (document.visibilityState !== 'visible') aborted = true
  }
  document.addEventListener('visibilitychange', onVis)
  if (document.visibilityState !== 'visible') aborted = true
  const tick = (now: number) => {
    if (aborted) {
      document.removeEventListener('visibilitychange', onVis)
      html.dataset.fps = 'skipped'
      return
    }
    if (!t0) t0 = now
    frames++
    if (now - t0 < durationMs) {
      requestAnimationFrame(tick)
      return
    }
    document.removeEventListener('visibilitychange', onVis)
    const fps = ((frames - 1) * 1000) / (now - t0)
    html.dataset.fps = fps.toFixed(1)
    if (fps < 40 && !info.forced) {
      setFxLevel(info.level === 'high' ? 'lite' : 'static', `fps:${fps.toFixed(0)}`)
    }
  }
  requestAnimationFrame(tick)
}
