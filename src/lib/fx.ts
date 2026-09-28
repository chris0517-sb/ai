import { useSyncExternalStore } from 'react'
import { searchParams } from './utils'

/**
 * 特效分級（規格 §6；2026-09-28 第四輪改規則——主人用手機看到「特效全部不見」）：
 * - high：桌機（非觸控、核心數 ≥4）。全部特效、畫布 DPR 上限 2、背景跟游標。
 * - lite：手機／觸控／低核心／deviceMemory ≤4。DPR 上限 1.5、粒子減半、背景只對點擊反應、同時動畫變少。
 * - static：★只有網址 ?static=1 或 ?fx=static 才會是 static（給截圖用）。任何自動判斷都不准掉到 static。
 *
 * 系統「減少動態效果」（prefers-reduced-motion）不再等於 static：級別照裝置判斷，另外設
 * <html data-motion="reduced">，只拿掉大幅位移／縮放（導覽改交叉淡入、開機改 1.2 秒淡入組裝），其餘特效照跑。
 *
 * 開場量 FPS：開機播完後再等 500ms、量 2 秒；只會 high→lite（<30fps）。lite 量到 <30 只把畫布 DPR 降到 1、
 * 背景點數再減半（lowPower），特效照跑、絕不關掉。
 */
export type FxLevel = 'high' | 'lite' | 'static'
export type Motion = 'full' | 'reduced'

export interface FxInfo {
  level: FxLevel
  forced: boolean
  reason: string
  motion: Motion
  /** lite 還是跑不動：畫布 DPR 1、背景點數再減半（特效不關） */
  lowPower: boolean
}

function mm(query: string) {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}

function detect(): FxInfo {
  const p = searchParams()
  const motion: Motion = mm('(prefers-reduced-motion: reduce)') ? 'reduced' : 'full'
  const q = p.get('fx')
  if (q === 'high' || q === 'lite' || q === 'static') return { level: q, forced: true, reason: 'param:fx', motion, lowPower: false }
  if (p.get('static') === '1') return { level: 'static', forced: true, reason: 'param:static', motion, lowPower: false }
  const touchPrimary = mm('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && mm('(hover: none)'))
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (touchPrimary || mobileUA) return { level: 'lite', forced: false, reason: 'touch', motion, lowPower: false }
  if (cores < 4) return { level: 'lite', forced: false, reason: 'cores', motion, lowPower: false }
  if (typeof mem === 'number' && mem <= 4) return { level: 'lite', forced: false, reason: 'memory', motion, lowPower: false }
  return { level: 'high', forced: false, reason: 'desktop', motion, lowPower: false }
}

let info: FxInfo = { level: 'high', forced: false, reason: 'init', motion: 'full', lowPower: false }
const listeners = new Set<() => void>()

function apply() {
  const html = document.documentElement
  html.dataset.fx = info.level
  html.dataset.fxReason = info.reason
  html.dataset.motion = info.motion
  html.dataset.lowPower = info.lowPower ? '1' : '0'
}

function emit() {
  apply()
  listeners.forEach((fn) => fn())
}

export function initFx(): FxInfo {
  info = detect()
  apply()
  // 使用者中途切換「減少動態效果」也跟著變（不會因此變 static）
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      info = { ...info, motion: e.matches ? 'reduced' : 'full' }
      emit()
    })
  } catch {
    /* 舊瀏覽器沒有 addEventListener：就不跟 */
  }
  return info
}

export function getFx(): FxInfo {
  return info
}

/** 只准 high→lite（自動降級）；static 只能由網址參數在一開始指定 */
export function setFxLevel(level: Exclude<FxLevel, 'static'>, reason: string) {
  if (info.level === level || info.level === 'static') return
  info = { ...info, level, reason }
  emit()
}

export function setLowPower(on: boolean, reason: string) {
  if (info.lowPower === on) return
  info = { ...info, lowPower: on, reason: on ? `${info.reason}+${reason}` : info.reason }
  emit()
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

/** 畫布 DPR 上限：high 2、lite 1.5、lite 還跑不動（lowPower）1 */
export function dprCap(level: FxLevel, lowPower = false) {
  if (lowPower) return 1
  return level === 'high' ? 2 : 1.5
}

/**
 * 量 FPS（requestAnimationFrame 回呼的頻率）。開機播完後呼叫：先等 500ms（字型、第一次捲動重算最忙的時候），再量 2 秒。
 * - high 且 <30fps → 降成 lite
 * - lite 且 <30fps → lowPower（DPR 1、背景點數再減半），特效照跑
 * 分頁被切走時 rAF 會停，量到的不算數 → 放棄這次（never-twice／web-testing：隱藏分頁 rAF 暫停＝假凍結）。
 */
export function startFpsProbe(delayMs = 500, durationMs = 2000) {
  const html = document.documentElement
  if (info.level === 'static') {
    html.dataset.fps = 'static'
    return
  }
  window.setTimeout(() => {
    let frames = 0
    let t0 = 0
    let aborted = document.visibilityState !== 'visible'
    const onVis = () => {
      if (document.visibilityState !== 'visible') aborted = true
    }
    document.addEventListener('visibilitychange', onVis)
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
      if (fps >= 30 || info.forced) return
      if (info.level === 'high') setFxLevel('lite', `fps:${fps.toFixed(0)}`)
      else if (info.level === 'lite') setLowPower(true, `fps:${fps.toFixed(0)}`)
    }
    requestAnimationFrame(tick)
  }, delayMs)
}
