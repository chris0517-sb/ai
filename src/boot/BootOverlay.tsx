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
/** 減少動態效果版的開機：≤1.2 秒的「組裝淡入」——黑幕淡掉、光球先亮、各區塊依投影順序一塊塊淡入；
 *  沒有飛行粒子、沒有閃爍、沒有色散、沒有大幅縮放（不閃白）。 */
const FADE_BOOT_SECONDS = 1.1 // 量到的會多一格（約 16ms），留餘裕守住 ≤1.2 秒
const smooth01 = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x
  return c * c * (3 - 2 * c)
}

function runFadeBoot(overlay: HTMLDivElement, speed: number, done: () => void) {
  const seconds = FADE_BOOT_SECONDS / Math.max(1, speed)
  const core = document.querySelector<HTMLElement>('[data-holo="core"]')
  const corners = document.querySelector<HTMLElement>('[data-holo="corners"]')
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-holo]'))
    .filter((el) => el !== core && el !== corners)
    .sort((a, b) => Number(a.dataset.holoOrder ?? 99) - Number(b.dataset.holoOrder ?? 99))
  const start = performance.now()
  let raf = 0
  let finished = false
  overlay.style.background = 'var(--ink)'
  const release = () => {
    for (const el of [core, corners, ...panels]) if (el) el.style.opacity = ''
  }
  const finish = () => {
    if (finished) return
    finished = true
    if (raf) cancelAnimationFrame(raf)
    detach()
    if (getBootPhase() === 'running') setBootPhase('core')
    document.documentElement.dataset.bootMs = String(Math.round(performance.now() - start))
    setBootPhase('done')
    release()
    done()
  }
  const tick = (now: number) => {
    raf = 0
    const t = (now - start) / 1000 / seconds // 0→1
    overlay.style.opacity = String(1 - smooth01(t / 0.4))
    if (core) core.style.opacity = smooth01((t - 0.05) / 0.35).toFixed(3)
    if (t >= 0.05 && getBootPhase() === 'running') setBootPhase('core') // 光球一出現就開始轉（沒有凍結的快照要對齊）
    if (corners) corners.style.opacity = smooth01((t - 0.2) / 0.3).toFixed(3)
    panels.forEach((el, k) => {
      el.style.opacity = smooth01((t - (0.25 + k * 0.09)) / 0.3).toFixed(3)
    })
    if (t >= 1) {
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
  function detach() {
    window.removeEventListener('pointerdown', skip, opts)
    window.removeEventListener('keydown', skip, opts)
    window.removeEventListener('wheel', skip, { capture: true })
    window.removeEventListener('touchstart', skip, { capture: true })
  }
  tick(start)
  return () => {
    if (raf) cancelAnimationFrame(raf)
    detach()
    if (!finished) release()
  }
}

export default function BootOverlay({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return
    markBootPlayed()
    const fx = getFx()
    const tune = getTune()
    if (fx.motion === 'reduced') return runFadeBoot(overlay, tune.speed, () => doneRef.current())
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap(fx.level, fx.lowPower))
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
    <div className="boot-overlay" ref={overlayRef} aria-hidden="true" data-testid="boot">
      <canvas ref={canvasRef} className="boot-canvas" />
      <span className="boot-skip">{hero.skipHint}</span>
    </div>
  )
}
