import { useSyncExternalStore } from 'react'
import { TUNE_DEFAULTS, TUNE_LIMITS, TUNE_STORAGE_KEY, type TuneValues } from '../config/tune'
import { clamp, clearTokenCache, searchParams, storageGet, storageSet } from './utils'

/**
 * 調整面板的狀態。
 * ★ 只有網址帶 ?tune 時才讀／寫 localStorage 裡存的值——沒帶 ?tune 的訪客（HR）永遠看到 src/config/tune.ts 的預設值，
 *   主人在自己瀏覽器調過的東西不會「偷偷」留在正式畫面上。
 */
export function tuneEnabled() {
  return searchParams().has('tune')
}

let values: TuneValues = { ...TUNE_DEFAULTS }
const listeners = new Set<() => void>()

function sanitize(raw: unknown): TuneValues {
  const v = { ...TUNE_DEFAULTS }
  if (!raw || typeof raw !== 'object') return v
  const r = raw as Record<string, unknown>
  if (typeof r.intensity === 'number' && Number.isFinite(r.intensity)) {
    v.intensity = clamp(Math.round(r.intensity), TUNE_LIMITS.intensity.min, TUNE_LIMITS.intensity.max)
  }
  if (typeof r.speed === 'number' && Number.isFinite(r.speed)) {
    v.speed = clamp(Math.round(r.speed * 100) / 100, TUNE_LIMITS.speed.min, TUNE_LIMITS.speed.max)
  }
  if (r.accent === 'speak' || r.accent === 'active' || r.accent === 'think') v.accent = r.accent
  if (typeof r.scanlines === 'boolean') v.scanlines = r.scanlines
  if (typeof r.boot === 'boolean') v.boot = r.boot
  if (r.titleFont === 'serif' || r.titleFont === 'sans') v.titleFont = r.titleFont
  if (typeof r.bgInteractive === 'boolean') v.bgInteractive = r.bgInteractive
  return v
}

function applyToDocument() {
  const html = document.documentElement
  html.dataset.accent = values.accent
  html.dataset.titleFont = values.titleFont
  html.dataset.scan = values.scanlines ? 'on' : 'off'
  html.style.setProperty('--fx-intensity', String(values.intensity / 100))
  html.style.setProperty('--speed', String(values.speed))
  clearTokenCache()
}

export function initTune(): TuneValues {
  if (tuneEnabled()) {
    const raw = storageGet('local', TUNE_STORAGE_KEY)
    if (raw) {
      try {
        values = sanitize(JSON.parse(raw))
      } catch {
        values = { ...TUNE_DEFAULTS }
      }
    }
  }
  applyToDocument()
  return values
}

export function getTune(): TuneValues {
  return values
}

export function setTune(patch: Partial<TuneValues>) {
  values = sanitize({ ...values, ...patch })
  if (tuneEnabled()) storageSet('local', TUNE_STORAGE_KEY, JSON.stringify(values))
  applyToDocument()
  listeners.forEach((fn) => fn())
}

export function resetTune() {
  setTune({ ...TUNE_DEFAULTS })
}

export function subscribeTune(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useTune(): TuneValues {
  return useSyncExternalStore(subscribeTune, getTune, getTune)
}
