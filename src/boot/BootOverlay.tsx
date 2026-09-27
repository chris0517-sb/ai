import { useLayoutEffect, useRef } from 'react'
import { hero } from '../content'
import { getBootPhase, markBootPlayed, setBootPhase } from '../lib/boot'
import { dprCap, getFx } from '../lib/fx'
import { getTune } from '../lib/tune'
import { tokenRGBA } from '../lib/utils'
import type { RGB } from '../orb/orbCore'
import { HoloBoot } from './holoBoot'
import * as TL from './holoTimeline'

const rgb = (token: string): RGB => {
  const c = tokenRGBA(token)
  return [c[0], c[1], c[2]]
}

/**
 * 開機投影幕（全螢幕 canvas）。≤1.8 秒；點一下／觸控／任意鍵／滾輪都立刻跳過。
 * 同一個分頁工作階段只播一次（sessionStorage，讀寫包 try/catch）；static、reduced-motion、tune 關掉時根本不會掛上來。
 */
export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    markBootPlayed()
    const fx = getFx()
    const tune = getTune()
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap(fx.level))
    let boot: HoloBoot
    try {
      boot = new HoloBoot(canvas, {
        lite: fx.level !== 'high',
        intensity: tune.intensity / 100,
        dpr,
        colors: {
          holo: rgb('--holo'),
          holoCore: rgb('--holo-core'),
          ink: rgb('--ink'),
          standby: rgb('--standby'),
          white: rgb('--orb-white'),
          spark: rgb('--orb-spark'),
        },
      })
    } catch (err) {
      // 投影幕建不起來 → 直接收幕、內容照常顯示（JARVIS 本尊也是：出錯就退回淡入淡出，不讓動畫拖垮本體）
      console.warn('[boot] 開機投影略過：', err)
      setBootPhase('done')
      doneRef.current()
      return
    }

    // 開機動畫只准變快、不准變慢（≤1.8 秒是硬線）
    const seconds = TL.WEB_BOOT_SECONDS / Math.max(1, tune.speed)
    const toOrig = TL.BOOT_END / seconds
    const start = performance.now()
    let raf = 0
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      if (raf) cancelAnimationFrame(raf)
      detach()
      if (getBootPhase() === 'running') setBootPhase('core')
      // 實際播了多久（驗收用：≤1.8 秒；被點掉的話會更短）
      document.documentElement.dataset.bootMs = String(Math.round(performance.now() - start))
      setBootPhase('done')
      boot.release()
      doneRef.current()
    }
    const tick = (now: number) => {
      raf = 0
      const t = ((now - start) / 1000) * toOrig
      const handed = boot.draw(Math.min(t, TL.BOOT_END))
      if (handed && getBootPhase() === 'running') setBootPhase('core')
      canvas.style.opacity = String(1 - TL.smooth(TL.prog(t, TL.T_LIFT0, TL.T_LIFT1)))
      if (t >= TL.BOOT_END) {
        finish()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const skip = () => finish()
    const opts = { capture: true } as const
    window.addEventListener('pointerdown', skip, opts)
    window.addEventListener('keydown', skip, opts)
    window.addEventListener('wheel', skip, { capture: true, passive: true })
    window.addEventListener('touchstart', skip, { capture: true, passive: true })
    window.addEventListener('resize', skip)
    function detach() {
      window.removeEventListener('pointerdown', skip, opts)
      window.removeEventListener('keydown', skip, opts)
      window.removeEventListener('wheel', skip, { capture: true })
      window.removeEventListener('touchstart', skip, { capture: true })
      window.removeEventListener('resize', skip)
    }

    boot.draw(0) // 第一格同步畫（瀏覽器上色之前）：一出現就是黑幕，不會先閃一下網頁
    raf = requestAnimationFrame(tick)

    return () => {
      // StrictMode／卸載：只停迴圈與監聽，不動 boot phase（真的播完才由 finish 處理）
      if (raf) cancelAnimationFrame(raf)
      detach()
      if (!finished) boot.release()
    }
  }, [])

  return (
    <div className="boot-overlay" aria-hidden="true" data-testid="boot">
      <canvas ref={canvasRef} className="boot-canvas" />
      <span className="boot-skip">{hero.skipHint}</span>
    </div>
  )
}
