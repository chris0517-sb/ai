import { useSyncExternalStore } from 'react'
import type { FxLevel } from './fx'
import { storageGet, storageSet } from './utils'

/**
 * 開機動畫的進度（跨元件共用）：
 * - off：這次不播（同分頁已播過／static／reduced-motion／tune 關掉）→ 內容直接完整顯示
 * - running：投影幕在播；光球停在第 0 格、先不顯示
 * - core：球體已經在投影幕上實體化 → 真的光球接手、開始轉
 * - done：播完（或被點掉）→ JARVIS 開口講開場白
 * ★ JARVIS 本尊也是「開機動畫播完才說問候語」（jarvis_fx.py 寫 ui_fx.json 讓 agent 等）。
 */
export type BootPhase = 'off' | 'running' | 'core' | 'done'

export const BOOT_SESSION_KEY = 'ai-site:boot-played'

let phase: BootPhase = 'off'
const listeners = new Set<() => void>()

export function shouldPlayBoot(level: FxLevel, tuneBoot: boolean): boolean {
  if (level === 'static' || !tuneBoot) return false
  return storageGet('session', BOOT_SESSION_KEY) !== '1'
}

export function markBootPlayed() {
  storageSet('session', BOOT_SESSION_KEY, '1')
}

export function getBootPhase() {
  return phase
}

export function setBootPhase(p: BootPhase) {
  const html = document.documentElement
  if (phase === p && html.dataset.boot === p) return
  phase = p
  html.dataset.boot = p
  listeners.forEach((fn) => fn())
}

export function subscribeBoot(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useBootPhase(): BootPhase {
  return useSyncExternalStore(subscribeBoot, getBootPhase, getBootPhase)
}
