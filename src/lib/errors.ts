import { useSyncExternalStore } from 'react'

/** 最近 5 筆 window error／unhandledrejection（給 ?debug=1 的檢查面板看；主人手機上出事時截圖給我） */
export interface ErrItem {
  type: 'error' | 'rejection'
  msg: string
  at: string
}

let items: ErrItem[] = []
const listeners = new Set<() => void>()

function push(type: ErrItem['type'], msg: string) {
  const at = new Date().toLocaleTimeString('en-GB', { hour12: false })
  items = [...items, { type, msg: msg.slice(0, 200), at }].slice(-5)
  listeners.forEach((fn) => fn())
}

export function installErrorLog() {
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` @${e.filename.split('/').pop()}:${e.lineno}` : ''
    push('error', `${e.message || String(e.error)}${where}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    push('rejection', r instanceof Error ? `${r.name}: ${r.message}` : String(r))
  })
}

const getItems = () => items

export function useErrorLog(): ErrItem[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    getItems,
    getItems,
  )
}
