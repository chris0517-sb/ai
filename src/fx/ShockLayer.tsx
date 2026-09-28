import { useEffect, useRef } from 'react'
import { subscribeFx, useFx } from '../lib/fx'
import { shocks } from './shock'

/** 點到這些東西不打衝擊波（按鈕、連結、表單、光球自己有「打斷」、面板） */
const SKIP = 'a, button, input, textarea, select, label, summary, [role="button"], .orb, .tune, .tune-fab, .debug-panel, .debug-fab, .boot-overlay'

/**
 * 全站的能量衝擊波層：點畫面任何非按鈕處 → 觸點打出 JARVIS 的衝擊波（手機、桌機都有；lite 也有，只在波還在跑的 0.9 秒畫）。
 * static（?static=1，截圖用）不打。
 */
export function ShockLayer() {
  const fx = useFx()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    shocks.mount(canvas, host)
    const onResize = () => shocks.resize()
    window.addEventListener('resize', onResize)
    const unsub = subscribeFx(onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      unsub()
      shocks.unmount()
    }
  }, [])

  useEffect(() => {
    if (fx.level === 'static') return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t || t.closest(SKIP)) return
      if (e.button !== 0) return
      shocks.shock(e.clientX, e.clientY)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [fx.level])

  return (
    <div className="shock-layer" ref={hostRef} data-testid="shock-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="shock-canvas" />
    </div>
  )
}
