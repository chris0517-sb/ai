/**
 * 能量衝擊波＋點球體的環——JARVIS 滑鼠互動特效「B 能量場」（2026-09-16／17 主人看比較短片選的）的網頁移植。
 *
 * 來源（唯讀）：C:\Users\USER\.jarvis\scripts\jarvis_mouse_fx.py
 * - :30-33   WAVE（尾流不透明度 0.50／尾流 alpha 190、寬 19／前緣 alpha 225、寬 2.9／餘波 alpha 108、寬 1.5）、WAVE_T 0.9 秒
 * - :160-201 Shockwave：半徑 30＋ease_out(t/0.9)×R；三層＝粗而柔的尾流（r−0.75×寬）、最亮的白色前緣、跟在後面 0.74 倍的細餘波
 * - :203-216 hits：掃到的東西依「波到它的時間」回應（網頁版：被掃到的卡片框亮一下）
 * - :249-271 CoreHit：點球體＝打斷她說話——兩圈反向的環往外炸（白色快、狀態色慢），0.6 秒
 * 網頁版只改兩件事：R＝從點擊點到最遠的視窗角（手機螢幕小，1750px 會掃太久看不到）；只有波還在跑的那 0.9 秒才有 rAF。
 */
import { dprCap, getFx } from '../lib/fx'
import { tokenRGBA } from '../lib/utils'

type RGB = [number, number, number]

const WAVE_T = 0.9
const WAVE = { trailOp: 0.5, trailA: 190 / 255, trailW: 19, frontA: 225 / 255, frontW: 2.9, backA: 108 / 255, backW: 1.5 }
const CORE_T = 0.6

const easeOut = (x: number) => 1 - (1 - x) ** 3
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a <= 0 ? 0 : a >= 1 ? 1 : a})`
const rgbOf = (token: string): RGB => {
  const c = tokenRGBA(token)
  return [c[0], c[1], c[2]]
}

interface Wave {
  x: number
  y: number
  t0: number
  R: number
  c: RGB
}
interface Core {
  x: number
  y: number
  t0: number
  k: number
  c: RGB
}

/** 被波掃到時會亮一下的東西（hit_card 的網頁版） */
const SWEEP_SEL = '.plate, .chip, .node, .state-chip, .verify-run, .btn-ghost, .term'

class ShockEngine {
  private canvas: HTMLCanvasElement | null = null
  private host: HTMLElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private waves: Wave[] = []
  private cores: Core[] = []
  private raf = 0
  private dpr = 1
  /** 驗證用：總共打出幾發 */
  count = 0

  mount(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas
    this.host = host
    this.ctx = canvas.getContext('2d')
    this.resize()
  }

  unmount() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.canvas = this.ctx = null
    this.host = null
  }

  resize() {
    const cv = this.canvas
    if (!cv) return
    const fx = getFx()
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap(fx.level, fx.lowPower))
    cv.width = Math.round(window.innerWidth * this.dpr)
    cv.height = Math.round(window.innerHeight * this.dpr)
  }

  /** 在 (x, y)（視窗座標）打一發衝擊波 */
  shock(x: number, y: number, colorToken = '--accent') {
    if (!this.canvas) return
    const W = window.innerWidth
    const H = window.innerHeight
    const R = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) * 1.05
    const t0 = performance.now() / 1000
    this.waves.push({ x, y, t0, R, c: rgbOf(colorToken) })
    this.count++
    this.mark(x, y)
    this.sweep(x, y, R)
    this.start()
  }

  /** 點球體：兩圈反向的環（k＝球的縮放：網頁上的球比 JARVIS 的 840px 小） */
  coreHit(cx: number, cy: number, k: number, colorToken: string) {
    if (!this.canvas) return
    this.cores.push({ x: cx, y: cy, t0: performance.now() / 1000, k, c: rgbOf(colorToken) })
    this.start()
  }

  /** 觸點上的一顆亮點（DOM 元素：看得到、也讓自動驗證找得到） */
  private mark(x: number, y: number) {
    const host = this.host
    if (!host) return
    host.dataset.last = `${Math.round(x)},${Math.round(y)}`
    host.dataset.count = String(this.count)
    const dot = document.createElement('i')
    dot.className = 'shock-dot'
    dot.style.left = `${x}px`
    dot.style.top = `${y}px`
    host.appendChild(dot)
    window.setTimeout(() => dot.remove(), 700)
  }

  /** 波掃到誰，誰就在那個時間點亮一下（離得越遠越晚） */
  private sweep(x: number, y: number, R: number) {
    const H = window.innerHeight
    const W = window.innerWidth
    let n = 0
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(SWEEP_SEL))) {
      if (n >= 24) break
      const r = el.getBoundingClientRect()
      if (!r.width || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y)
      const p = Math.min(1, Math.max(0, (d - 30) / R))
      const t = (1 - Math.cbrt(1 - p)) * WAVE_T // ease_out 反函數：波前抵達的時間
      n++
      window.setTimeout(() => {
        el.classList.remove('is-swept')
        void el.offsetWidth
        el.classList.add('is-swept')
        window.setTimeout(() => el.classList.remove('is-swept'), 560)
      }, t * 1000)
    }
  }

  private start() {
    if (!this.raf) this.raf = requestAnimationFrame(this.loop)
  }

  private loop = (ms: number) => {
    this.raf = 0
    const ctx = this.ctx
    const cv = this.canvas
    if (!ctx || !cv) return
    const now = ms / 1000
    const white = rgbOf('--holo-core') // jarvis_mouse_fx.py:28 WHITE = (235, 244, 255)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    this.waves = this.waves.filter((w) => now - w.t0 <= WAVE_T)
    this.cores = this.cores.filter((c) => now - c.t0 <= CORE_T)
    for (const w of this.waves) {
      const f = Math.max(0, (now - w.t0) / WAVE_T)
      const r = 30 + easeOut(Math.min(1, f)) * w.R
      const k = (1 - f) ** 1.3
      ctx.globalAlpha = WAVE.trailOp // 尾流：粗而柔，是「厚度」的來源
      ctx.strokeStyle = rgba(w.c, WAVE.trailA * k)
      ctx.lineWidth = WAVE.trailW
      ctx.beginPath()
      ctx.arc(w.x, w.y, Math.max(0, r - WAVE.trailW * 0.75), 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.strokeStyle = rgba(white, WAVE.frontA * k) // 前緣：最亮的一線
      ctx.lineWidth = WAVE.frontW
      ctx.beginPath()
      ctx.arc(w.x, w.y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = rgba(w.c, WAVE.backA * k) // 餘波：跟在後面的一圈細環
      ctx.lineWidth = WAVE.backW
      ctx.beginPath()
      ctx.arc(w.x, w.y, r * 0.74, 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const c of this.cores) {
      const f = (now - c.t0) / CORE_T
      if (f < 0 || f > 1) continue
      ;[1.0, 0.68].forEach((sp, i) => {
        const r = (50 + easeOut(Math.min(1, f / sp)) * 320) * c.k
        ctx.strokeStyle = rgba(i === 0 ? white : c.c, (220 / 255) * (1 - f) ** 1.5)
        ctx.lineWidth = 3 - i
        ctx.beginPath()
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
        ctx.stroke()
      })
    }
    if (this.waves.length || this.cores.length) this.raf = requestAnimationFrame(this.loop)
    else ctx.clearRect(0, 0, cv.width, cv.height)
  }
}

export const shocks = new ShockEngine()
