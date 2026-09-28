import { useSyncExternalStore } from 'react'

/**
 * 頂部導覽列那顆迷你光球的狀態（全站共用）。讓開場的光球「跟著人往下走」：
 * - standby：預設
 * - thinking：示範 A 終端機在打指令時（JARVIS 在想要不要執行）
 * - alert：每次「已攔截」閃一下紅（--alert）
 * - speaking：導覽字幕換字時（JARVIS 在講）
 * base＝持續狀態（例如終端機整段在跑＝thinking），pulse＝短暫閃一下再回到 base。
 */
export type MiniState = 'standby' | 'thinking' | 'speaking' | 'alert'

let base: MiniState = 'standby'
let pulse: MiniState | null = null
let timer = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function setMiniBase(s: MiniState) {
  if (base === s) return
  base = s
  emit()
}

export function pulseMini(s: MiniState, ms: number) {
  window.clearTimeout(timer)
  pulse = s
  emit()
  timer = window.setTimeout(() => {
    pulse = null
    emit()
  }, ms)
}

export function getMini(): MiniState {
  return pulse ?? base
}

export function useMiniState(): MiniState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getMini,
    getMini,
  )
}
