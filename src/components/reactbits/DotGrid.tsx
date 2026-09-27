/**
 * Dot Grid — React Bits（DavidHDev/react-bits，MIT + Commons Clause）
 * 來源：https://reactbits.dev/r/DotGrid-TS-TW.json（2026-09-28 取得的當下版本，shadcn registry 原始碼）
 *
 * 本站的改動（原始結構與互動公式保留：proximity 顏色內插、快速劃過用 InertiaPlugin 推開、點擊衝擊波、elastic 彈回）：
 * 1. 顏色改吃 token（--line-soft 系的點、--accent 的亮點），不留庫的預設紫色；內插多算 alpha。
 * 2. 不再每格都重畫：沒有游標／沒有點在動的時候迴圈會停（原版 rAF 永遠在跑，手機很耗電）。
 * 3. interactive=false（lite 級、tune 關掉）時完全不掛滑鼠事件，只在尺寸變了時畫一次靜態點陣。
 * 4. 同色的點合成一條 path 一次填（原版每顆點 save/translate/fill/restore）。
 * 5. 畫布 DPR 依特效分級封頂（high 2、lite 1.5）。
 * 這層背景＝JARVIS 桌面「滑鼠互動特效」（2026-09-17 主人選的 B 能量場：游標光暈、點擊衝擊波）在網頁上的對應。
 */
import { useCallback, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { tokenRGBA, type RGBA } from '../../lib/utils'

gsap.registerPlugin(InertiaPlugin)

const throttle = <A extends unknown[]>(func: (...args: A) => void, limit: number) => {
  let lastCall = 0
  return (...args: A) => {
    const now = performance.now()
    if (now - lastCall >= limit) {
      lastCall = now
      func(...args)
    }
  }
}

interface Dot {
  cx: number
  cy: number
  xOffset: number
  yOffset: number
  _inertiaApplied: boolean
}

export interface DotGridProps {
  dotSize?: number
  gap?: number
  /** 點的顏色 token（CSS 變數名） */
  baseToken?: string
  baseAlpha?: number
  /** 靠近游標時的顏色 token */
  activeToken?: string
  proximity?: number
  speedTrigger?: number
  shockRadius?: number
  shockStrength?: number
  maxSpeed?: number
  resistance?: number
  returnDuration?: number
  interactive?: boolean
  dprCap?: number
  /** tune 的強調色換了要重新解析顏色 */
  colorKey?: string
  className?: string
}

export default function DotGrid({
  dotSize = 2,
  gap = 26,
  baseToken = '--text-3',
  baseAlpha = 0.22,
  activeToken = '--accent',
  proximity = 130,
  speedTrigger = 100,
  shockRadius = 220,
  shockStrength = 4,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  interactive = true,
  dprCap = 2,
  colorKey = '',
  className = '',
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const pointerRef = useRef({ x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, lastTime: 0, lastX: 0, lastY: 0 })
  const activeUntil = useRef(0)
  const rafRef = useRef(0)
  const colorsRef = useRef<{ base: RGBA; active: RGBA }>({ base: [0, 0, 0, 0], active: [0, 0, 0, 0] })
  const drawRef = useRef<() => void>(() => {})

  useEffect(() => {
    const b = tokenRGBA(baseToken)
    const a = tokenRGBA(activeToken)
    colorsRef.current = { base: [b[0], b[1], b[2], baseAlpha], active: [a[0], a[1], a[2], 0.85] }
    drawRef.current()
  }, [baseToken, activeToken, baseAlpha, colorKey])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Number(canvas.dataset.dpr) || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    const { x: px, y: py } = pointerRef.current
    const { base, active } = colorsRef.current
    const proxSq = proximity * proximity
    const r = dotSize / 2
    ctx.beginPath()
    const near: [number, number, number][] = []
    for (const dot of dotsRef.current) {
      const ox = dot.cx + dot.xOffset
      const oy = dot.cy + dot.yOffset
      const dx = dot.cx - px
      const dy = dot.cy - py
      const dsq = dx * dx + dy * dy
      if (interactive && dsq <= proxSq) {
        near.push([ox, oy, 1 - Math.sqrt(dsq) / proximity])
        continue
      }
      ctx.moveTo(ox + r, oy)
      ctx.arc(ox, oy, r, 0, Math.PI * 2)
    }
    ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${base[3]})`
    ctx.fill()
    for (const [ox, oy, t] of near) {
      const c = [0, 1, 2, 3].map((i) => base[i] + (active[i] - base[i]) * t)
      ctx.fillStyle = `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(3)})`
      ctx.beginPath()
      ctx.arc(ox, oy, r * (1 + 0.6 * t), 0, Math.PI * 2)
      ctx.fill()
    }
  }, [dotSize, proximity, interactive])

  // 只在有動靜時跑迴圈
  const kick = useCallback(
    (ms: number) => {
      activeUntil.current = Math.max(activeUntil.current, performance.now() + ms)
      if (rafRef.current) return
      const loop = () => {
        draw()
        if (performance.now() < activeUntil.current) rafRef.current = requestAnimationFrame(loop)
        else rafRef.current = 0
      }
      rafRef.current = requestAnimationFrame(loop)
    },
    [draw],
  )

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const { width, height } = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.dataset.dpr = String(dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const cols = Math.floor((width + gap) / (dotSize + gap))
    const rows = Math.floor((height + gap) / (dotSize + gap))
    const cell = dotSize + gap
    const gridW = cell * cols - gap
    const gridH = cell * rows - gap
    const startX = (width - gridW) / 2 + dotSize / 2
    const startY = (height - gridH) / 2 + dotSize / 2
    const dots: Dot[] = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        dots.push({ cx: startX + x * cell, cy: startY + y * cell, xOffset: 0, yOffset: 0, _inertiaApplied: false })
      }
    }
    dotsRef.current = dots
    draw()
  }, [dotSize, gap, dprCap, draw])

  useEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw])

  useEffect(() => {
    buildGrid()
    const ro = new ResizeObserver(buildGrid)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [buildGrid])

  useEffect(() => {
    if (!interactive) {
      pointerRef.current.x = -9999
      pointerRef.current.y = -9999
      draw()
      return
    }
    const onMove = (e: MouseEvent) => {
      const now = performance.now()
      const pr = pointerRef.current
      const dt = pr.lastTime ? now - pr.lastTime : 16
      const dx = e.clientX - pr.lastX
      const dy = e.clientY - pr.lastY
      let vx = (dx / dt) * 1000
      let vy = (dy / dt) * 1000
      let speed = Math.hypot(vx, vy)
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed
        vx *= scale
        vy *= scale
        speed = maxSpeed
      }
      pr.lastTime = now
      pr.lastX = e.clientX
      pr.lastY = e.clientY
      pr.vx = vx
      pr.vy = vy
      pr.speed = speed
      const rect = canvasRef.current!.getBoundingClientRect()
      pr.x = e.clientX - rect.left
      pr.y = e.clientY - rect.top
      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y)
        if (speed > speedTrigger && dist < proximity && !dot._inertiaApplied) {
          dot._inertiaApplied = true
          gsap.killTweensOf(dot)
          const pushX = dot.cx - pr.x + vx * 0.005
          const pushY = dot.cy - pr.y + vy * 0.005
          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance },
            onComplete: () => {
              gsap.to(dot, { xOffset: 0, yOffset: 0, duration: returnDuration, ease: 'elastic.out(1,0.75)' })
              dot._inertiaApplied = false
            },
          })
        }
      }
      kick(returnDuration * 1000 + 1200)
    }
    const onClick = (e: MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      for (const dot of dotsRef.current) {
        const dist = Math.hypot(dot.cx - cx, dot.cy - cy)
        if (dist < shockRadius && !dot._inertiaApplied) {
          dot._inertiaApplied = true
          gsap.killTweensOf(dot)
          const falloff = Math.max(0, 1 - dist / shockRadius)
          const pushX = (dot.cx - cx) * shockStrength * falloff
          const pushY = (dot.cy - cy) * shockStrength * falloff
          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance },
            onComplete: () => {
              gsap.to(dot, { xOffset: 0, yOffset: 0, duration: returnDuration, ease: 'elastic.out(1,0.75)' })
              dot._inertiaApplied = false
            },
          })
        }
      }
      kick(returnDuration * 1000 + 1500)
    }
    const onLeave = () => {
      pointerRef.current.x = -9999
      pointerRef.current.y = -9999
      kick(300)
    }
    const throttledMove = throttle(onMove, 50)
    window.addEventListener('mousemove', throttledMove, { passive: true })
    window.addEventListener('click', onClick)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', throttledMove)
      window.removeEventListener('click', onClick)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [interactive, maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength, kick, draw])

  return (
    <div ref={wrapperRef} className={`relative h-full w-full ${className}`}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
    </div>
  )
}
