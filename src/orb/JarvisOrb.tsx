import { useEffect, useRef } from 'react'
import type { OrbState } from '../content'
import { dprCap, useFx } from '../lib/fx'
import { useTune } from '../lib/tune'
import { cn, tokenRGBA } from '../lib/utils'
import { CORE, OrbPainter, lineScale, type RGB } from './orbCore'

const STATE_TOKEN: Record<OrbState, string> = {
  standby: '--standby',
  thinking: '--think',
  speaking: '--speak',
}

const rgb = (token: string): RGB => {
  const c = tokenRGBA(token)
  return [c[0], c[1], c[2]]
}

/** static 模式畫的那一格：掃描弧停在好看的角度 */
const STATIC_T = 1.2

interface Props {
  state: OrbState
  /** 開機投影期間：停在第 0 格（跟投影幕上的快照同一格，交棒時才不會跳） */
  frozen: boolean
  /** 說話音量 0～1（字幕逐字出現推動） */
  getLevel: () => number
  /** 刻度環點亮格數（說話時＝字幕進度）；null＝均勻裝飾環 */
  getLit: () => number | null
  className?: string
}

/**
 * JARVIS 狀態球（網頁版）。data-state 會跟著 standby／thinking／speaking 變，方便自動驗證。
 * - high：每個 rAF 都畫；lite：30fps（JARVIS 本尊 BlobCore 就是 33ms 一格）
 * - 畫布離開視窗或分頁隱藏 → 停畫（規格 §5）
 * - static：只畫一格；狀態變了才重畫那一格（顏色換掉），不跑動畫
 */
export function JarvisOrb({ state, frozen, getLevel, getLit, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fx = useFx()
  const tune = useTune()
  const live = useRef({ state, frozen, speed: tune.speed, getLevel, getLit })
  live.current = { state, frozen, speed: tune.speed, getLevel, getLit }
  const redraw = useRef<() => void>(() => {})
  const tRef = useRef(0) // 特效分級中途改變（FPS 降級）時，球的時間接著走，不會跳回第 0 格

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const painter = new OrbPainter()
    const isStatic = fx.level === 'static'
    const cap = dprCap(fx.level)
    const frameMs = fx.level === 'lite' ? 1000 / 30 : 0
    const colors: Record<OrbState, RGB> = {
      standby: rgb(STATE_TOKEN.standby),
      thinking: rgb(STATE_TOKEN.thinking),
      speaking: rgb(STATE_TOKEN.speaking),
    }
    const white = rgb('--orb-white')
    const spark = rgb('--orb-spark')
    let dev = 0
    let lw = 1
    let t = isStatic ? STATIC_T : tRef.current
    let last = 0
    let lastDraw = 0
    let raf = 0
    let visible = document.visibilityState === 'visible'
    let inView = true
    let drawnState: OrbState | null = null

    const draw = (dt: number) => {
      if (!dev) return
      const L = live.current
      const k = dev / CORE
      ctx.setTransform(k, 0, 0, k, 0, 0)
      const speaking = L.state === 'speaking'
      painter.paint(
        ctx,
        {
          t,
          state: L.state,
          color: colors[L.state],
          white,
          spark,
          level: speaking ? L.getLevel() : 0,
          lit: speaking ? L.getLit() : null,
          dt,
        },
        lw,
      )
      drawnState = L.state
    }

    const resize = () => {
      const w = wrap.clientWidth
      if (!w) return
      const dpr = Math.min(window.devicePixelRatio || 1, cap)
      const d = Math.max(1, Math.round(w * dpr))
      if (d === dev) return
      dev = d
      canvas.width = d
      canvas.height = d
      lw = lineScale(d)
      draw(0)
    }

    const loop = (now: number) => {
      raf = 0
      if (!visible || !inView) return
      const L = live.current
      const dtReal = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      if (L.frozen) {
        // 開機中：停在第 0 格；只有狀態變了才重畫
        if (drawnState !== L.state) draw(0)
      } else {
        t += dtReal * L.speed
        tRef.current = t
        const since = now - lastDraw
        if (!frameMs || since >= frameMs - 2) {
          draw(lastDraw ? Math.min(0.1, since / 1000) : 0.016)
          lastDraw = now
        }
      }
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (isStatic) return
      if (!raf && visible && inView) {
        last = 0
        lastDraw = 0
        raf = requestAnimationFrame(loop)
      }
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    redraw.current = () => draw(0)
    resize()

    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting)
        if (inView) start()
        else stop()
      },
      { rootMargin: '80px' },
    )
    io.observe(wrap)
    const onVis = () => {
      visible = document.visibilityState === 'visible'
      if (visible) start()
      else stop()
    }
    document.addEventListener('visibilitychange', onVis)
    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      redraw.current = () => {}
    }
  }, [fx.level])

  // static 模式沒有迴圈：狀態變了就重畫那一格
  useEffect(() => {
    if (fx.level === 'static') redraw.current()
  }, [state, fx.level])

  return (
    <div ref={wrapRef} className={cn('orb', className)} data-holo="core" data-state={state} data-testid="orb">
      <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />
    </div>
  )
}
