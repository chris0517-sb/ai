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
/** 手指撥轉：每移動 1px 轉幾弧度（撥過整顆球寬約轉半圈） */
const RAD_PER_PX = 0.01
/** 放手後的慣性：每秒剩 6%（照 JARVIS 面板捲動 Scroller 的衰減，jarvis_mouse_fx.py:117） */
const SPIN_DECAY = 0.06
/** 系統開了「減少動態效果」：球照轉，但放慢 */
const REDUCED_SPEED = 0.6

interface Props {
  state: OrbState
  /** 開機投影期間：停在第 0 格（跟投影幕上的快照同一格，交棒時才不會跳） */
  frozen: boolean
  /** 說話音量 0～1（字幕逐字出現推動） */
  getLevel: () => number
  /** 刻度環點亮格數（說話時＝字幕進度）；null＝均勻裝飾環 */
  getLit: () => number | null
  /** 點一下光球（不是拖曳）＝打斷她說話（JARVIS 本來就有：jarvis_ui.py:74 INTERRUPT_PATH） */
  onTap?: () => void
  /** 開機投影要拿它當「球體」：只有開場那顆是 true（結尾的小光球不參加開機） */
  holo?: boolean
  testId?: string
  className?: string
}

/**
 * JARVIS 狀態球（網頁版）。data-state 會跟著 standby／thinking／speaking 變，方便自動驗證。
 * - high：每個 rAF 都畫；lite：30fps（JARVIS 本尊 BlobCore 就是 33ms 一格）
 * - 畫布離開視窗或分頁隱藏 → 停畫（規格 §5）
 * - static：只畫一格；狀態變了才重畫那一格（顏色換掉），不跑動畫
 */
export function JarvisOrb({ state, frozen, getLevel, getLit, onTap, holo = true, testId = 'orb', className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fx = useFx()
  const tune = useTune()
  const live = useRef({ state, frozen, speed: tune.speed, getLevel, getLit })
  live.current = { state, frozen, speed: tune.speed, getLevel, getLit }
  const redraw = useRef<() => void>(() => {})
  const tRef = useRef(0) // 特效分級中途改變（FPS 降級）時，球的時間接著走，不會跳回第 0 格
  // 手指撥轉（第四輪）：spin＝額外角度、vel＝角速度（放手後慣性衰減）
  const spinRef = useRef({ spin: 0, vel: 0, dragging: false, deg: 0 })
  const tapRef = useRef(onTap)
  tapRef.current = onTap
  const motionRef = useRef(fx.motion)
  motionRef.current = fx.motion

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const painter = new OrbPainter()
    const isStatic = fx.level === 'static'
    const cap = dprCap(fx.level, fx.lowPower)
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
          spin: spinRef.current.spin,
        },
        lw,
      )
      drawnState = L.state
    }

    // 目前角度寫在 data-rot（度，0～359），方便驗證「拖得動」
    const writeRot = () => {
      const S = spinRef.current
      const deg = Math.round((((S.spin * 180) / Math.PI) % 360 + 360) % 360)
      if (deg !== S.deg) {
        S.deg = deg
        wrap.dataset.rot = String(deg)
      }
    }
    writeRot()
    wrap.dataset.rot = String(spinRef.current.deg)

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
        t += dtReal * L.speed * (motionRef.current === 'reduced' ? REDUCED_SPEED : 1)
        tRef.current = t
        const S = spinRef.current
        if (!S.dragging && S.vel) {
          S.spin += S.vel * dtReal
          S.vel *= Math.pow(SPIN_DECAY, dtReal)
          if (Math.abs(S.vel) < 0.02) S.vel = 0
          writeRot()
        }
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

    // ── 手指撥轉＋點一下打斷（pointer events：手機觸控、滑鼠都吃；直向滑動交給頁面捲動：CSS touch-action: pan-y）──
    let drag: { id: number; x0: number; y0: number; lastX: number; lastT: number; t0: number; moved: number } | null = null
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const now = performance.now()
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastT: now, t0: now, moved: 0 }
      spinRef.current.vel = 0
      try {
        wrap.setPointerCapture(e.pointerId)
      } catch {
        /* 有些瀏覽器在合成事件上會丟錯：不影響 */
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const now = performance.now()
      const dx = e.clientX - drag.lastX
      const dt = Math.max(8, now - drag.lastT) / 1000
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0))
      if (drag.moved > 6) {
        const S = spinRef.current
        S.dragging = true
        S.spin += dx * RAD_PER_PX
        S.vel = Math.max(-14, Math.min(14, (dx * RAD_PER_PX) / dt))
        writeRot()
        if (isStatic) draw(0)
      }
      drag.lastX = e.clientX
      drag.lastT = now
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const S = spinRef.current
      const tap = e.type === 'pointerup' && drag.moved <= 6 && performance.now() - drag.t0 < 450
      // 放手前停太久（>120ms 沒動）就不帶慣性
      if (performance.now() - drag.lastT > 120) S.vel = 0
      S.dragging = false
      drag = null
      if (tap) {
        S.vel = 0
        tapRef.current?.()
      }
    }
    wrap.addEventListener('pointerdown', onDown)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp)
    wrap.addEventListener('pointercancel', onUp)

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      wrap.removeEventListener('pointerdown', onDown)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp)
      wrap.removeEventListener('pointercancel', onUp)
      redraw.current = () => {}
    }
  }, [fx.level, fx.lowPower])

  // static 模式沒有迴圈：狀態變了就重畫那一格
  useEffect(() => {
    if (fx.level === 'static') redraw.current()
  }, [state, fx.level])

  return (
    <div ref={wrapRef} className={cn('orb', className)} data-holo={holo ? 'core' : undefined} data-state={state} data-testid={testId}>
      <canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" />
    </div>
  )
}
