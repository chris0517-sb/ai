/**
 * 開機全像投影的網頁繪製器（Canvas 2D）——jarvis_fx_gl.py HoloRenderer.draw 的工序照搬：
 * ① 背景（黑幕→舞台）② 圖層（球體快照色散實體化、故障條）③ 粒子＋拖尾 ④ 發光線段（光束、線框、掃描紋理、括號、干涉線）
 * ⑤ 掃描光帶與暗閃。
 *
 * 跟原版不同的地方（網頁必要的適配）：
 * - 原版的「面板」是舞台快照的一塊塊貼圖；網頁上它們就是真的 DOM 元素（名字、字幕條、問題晶片…），
 *   所以面板的「閃爍色散實體化」直接改那些元素的 opacity＋紅藍錯位影子，光束與線框照樣畫在投影幕上。
 * - 球體：投影幕上畫快照（RGB 三色左右錯開、疊加），實體化完成（T_MAT1）那一刻交棒給真的光球——
 *   兩者都是第 0 格，接縫看不出來（原版也是：開機期間球體暫停在快照那一格）。
 */
import type { RGB } from '../orb/orbCore'
import { OrbPainter, renderOrbFrame } from '../orb/orbCore'
import * as TL from './holoTimeline'

export interface HoloColors {
  holo: RGB
  holoCore: RGB
  ink: RGB
  standby: RGB
  white: RGB
  spark: RGB
}

interface Region {
  el: HTMLElement
  tp: number
  done: boolean
}

export interface HoloOptions {
  lite: boolean
  intensity: number // 0–1.5
  dpr: number
  colors: HoloColors
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a <= 0 ? 0 : a >= 1 ? 1 : a})`

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

type Sprite = { cv: HTMLCanvasElement; half: number }

/** 粒子光點貼圖（FS_PARTICLE：外圈 halo 盤＋白色核心；疊加光） */
function particleSprite(dpr: number, halo: number, core: number, holo: RGB, holoCore: RGB, haloGain: number): Sprite {
  const R = (halo + 2) / 2
  const size = Math.ceil(R * 2 * dpr) + 2
  const cv = makeCanvas(size, size)
  const g = cv.getContext('2d')!
  g.scale(dpr, dpr)
  const c = size / dpr / 2
  g.globalCompositeOperation = 'lighter'
  g.fillStyle = rgba(holo, haloGain)
  g.beginPath()
  g.arc(c, c, halo * 0.5 + 0.5, 0, Math.PI * 2)
  g.fill()
  if (core > 0) {
    g.fillStyle = rgba(holoCore, 1)
    g.beginPath()
    g.arc(c, c, core * 0.5 + 0.5, 0, Math.PI * 2)
    g.fill()
  }
  return { cv, half: size / dpr / 2 }
}

export class HoloBoot {
  private ctx: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private regions: Region[] = []
  private corners: HTMLElement | null
  private coreEl: HTMLElement
  private coreRect: DOMRect
  private k = 1
  private particles = new Float32Array(0)
  private snap: HTMLCanvasElement
  private chR: HTMLCanvasElement
  private chG: HTMLCanvasElement
  private chB: HTMLCanvasElement
  private spFly: Sprite
  private spHome: Sprite
  private spNoise: Sprite
  private nNoise: number
  private canvas: HTMLCanvasElement
  private pos: [number, number] = [0, 0]
  private opts: HoloOptions

  constructor(canvas: HTMLCanvasElement, opts: HoloOptions) {
    this.canvas = canvas
    this.opts = opts
    this.ctx = canvas.getContext('2d')!
    this.resize()
    const core = document.querySelector<HTMLElement>('[data-holo="core"]')
    if (!core) throw new Error('找不到光球（[data-holo="core"]）')
    this.coreEl = core
    this.coreRect = core.getBoundingClientRect()
    this.corners = document.querySelector<HTMLElement>('[data-holo="corners"]')
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-holo]')).filter((el) => {
      const n = el.dataset.holo
      return n !== 'core' && n !== 'corners'
    })
    els.sort((a, b) => Number(a.dataset.holoOrder ?? 99) - Number(b.dataset.holoOrder ?? 99))
    this.regions = els.map((el, i) => ({ el, tp: TL.PROJ_TIMES[Math.min(i, TL.PROJ_TIMES.length - 1)], done: false }))

    // ── 球體快照（第 0 格、待命色）＋取樣亮點 ──
    const S = Math.max(1, this.coreRect.width)
    this.k = S / 840
    const frame = {
      t: 0,
      state: 'standby' as const,
      color: opts.colors.standby,
      white: opts.colors.white,
      spark: opts.colors.spark,
      level: 0,
      lit: null,
      dt: 0,
    }
    this.snap = renderOrbFrame(makeCanvas(1, 1), S, opts.dpr, frame, new OrbPainter())
    const small = renderOrbFrame(makeCanvas(1, 1), S, 1, frame, new OrbPainter())
    const sw = small.width
    const sd = small.getContext('2d')!.getImageData(0, 0, sw, sw).data
    const n = Math.max(0, Math.round(TL.N_CORE * (opts.lite ? 0.5 : 1) * opts.intensity))
    const tgt = TL.litPoints(sd, sw, sw, n, 5)
    const cx = this.coreRect.left + S / 2
    const cy = this.coreRect.top + S / 2
    for (let i = 0; i < tgt.length; i += 2) {
      tgt[i] = tgt[i] * (S / sw) + this.coreRect.left
      tgt[i + 1] = tgt[i + 1] * (S / sw) + this.coreRect.top
    }
    this.particles = TL.coreParticles(tgt, cx, cy, this.k)

    // ── RGB 三個色版（色散用：紅往左、藍往右，疊加） ──
    const d = this.snap.width
    const src = this.snap.getContext('2d')!.getImageData(0, 0, d, d)
    const mk = (ch: 0 | 1 | 2) => {
      const out = makeCanvas(d, d)
      const g = out.getContext('2d')!
      const img = g.createImageData(d, d)
      const s = src.data
      const o = img.data
      for (let p = 0; p < s.length; p += 4) {
        const a = s[p + 3]
        if (!a) continue
        o[p + ch] = 255
        o[p + 3] = (s[p + ch] * a) / 255
      }
      g.putImageData(img, 0, 0)
      return out
    }
    this.chR = mk(0)
    this.chG = mk(1)
    this.chB = mk(2)

    const { holo, holoCore } = opts.colors
    this.spFly = particleSprite(opts.dpr, 2.2 * 3.2, 2.2, holo, holoCore, 0.35)
    this.spHome = particleSprite(opts.dpr, 1.8 * 3.2, 1.8, holo, holoCore, 0.35)
    this.spNoise = particleSprite(opts.dpr, 2.0, 0, holo, holoCore, 1)
    this.nNoise = Math.round(TL.N_NOISE * (opts.lite ? 0.5 : 1) * Math.min(1, opts.intensity))
  }

  resize() {
    this.W = window.innerWidth
    this.H = window.innerHeight
    const dpr = this.opts.dpr
    this.canvas.width = Math.round(this.W * dpr)
    this.canvas.height = Math.round(this.H * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** 第 t 秒（原版時間）：畫投影幕＋更新 DOM 面板的實體化。回傳球體是否已經交棒 */
  draw(t: number) {
    const ctx = this.ctx
    const { W, H } = this
    const { holo, ink } = this.opts.colors
    this.coreRect = this.coreEl.getBoundingClientRect()
    const cr = this.coreRect
    const cx = cr.left + cr.width / 2
    const cy = cr.top + cr.height / 2
    const k = this.k

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, W, H)

    // ① 背景：黑幕 → 舞台（bg 0→1 帶閃爍）
    const bgq = TL.prog(t, 0.9, 1.4)
    const bg = bgq * TL.flicker(t, 3, 1 - bgq)
    if (1 - bg > 0.003) {
      ctx.fillStyle = rgba(ink, 1 - bg)
      ctx.fillRect(0, 0, W, H)
    }

    // ② 球體：色散從 12px 收到 0（T_MAT0→T_MAT1），之後交棒給真的光球
    const handed = t >= TL.T_MAT1
    if (t >= TL.T_MAT0 && !handed) {
      const mq = TL.prog(t, TL.T_MAT0, TL.T_MAT1)
      const kk = 12 * (1 - mq) ** 1.5 * Math.min(1, Math.max(0.6, k))
      const op = TL.eOutCubic(mq) * TL.flicker(t, 7, 1 - mq)
      if (op > 0.003) {
        if (kk > 0.4) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = op
          ctx.drawImage(this.chR, cr.left - kk, cr.top, cr.width, cr.height)
          ctx.drawImage(this.chG, cr.left, cr.top, cr.width, cr.height)
          ctx.drawImage(this.chB, cr.left + kk, cr.top, cr.width, cr.height)
        } else {
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = op
          ctx.drawImage(this.snap, cr.left, cr.top, cr.width, cr.height)
        }
      }
      // 故障條：整條先塗黑，再貼上水平錯位的圖
      for (const [g0, byOff, dx] of [
        [1.02, -90, 26],
        [1.18, 40, -30],
      ] as const) {
        if (t >= g0 && t < g0 + 0.034) {
          const y = cy + byOff * k
          const h = 46 * k
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          ctx.fillStyle = rgba(ink, 1)
          ctx.fillRect(cr.left, y, cr.width, h)
          const sy = ((y - cr.top) / cr.height) * this.snap.height
          ctx.drawImage(this.snap, 0, sy, this.snap.width, (h / cr.height) * this.snap.height, cr.left + dx * k, y, cr.width, h)
        }
      }
    }

    // ③ 粒子飛進來組成球體（0.08–1.45）＋全像雜訊點（<1.2）
    ctx.globalCompositeOperation = 'lighter'
    if (t >= 0.08 && t < 1.45 && this.particles.length) {
      const fade = 1 - TL.prog(t, 1.02, 1.4)
      const aa = 0.85 * fade
      const ab = 0.95 * fade
      const P = this.particles
      const n = P.length / 8
      const flying: number[] = []
      const home: number[] = []
      const trails: number[] = []
      const pos = this.pos
      for (let i = 0; i < n; i++) {
        const o = i * 8
        const q = (t - P[o + 4]) / P[o + 5]
        if (q <= 0) continue
        TL.particlePos(P, o, t, pos)
        if (q < 1) {
          flying.push(pos[0], pos[1])
          const x1 = pos[0]
          const y1 = pos[1]
          TL.particlePos(P, o, t - 0.035, pos)
          trails.push(pos[0], pos[1], x1, y1)
        } else {
          home.push(pos[0], pos[1])
        }
      }
      if (trails.length && aa > 0.003) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = rgba(holo, aa * 0.32)
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 0; i < trails.length; i += 4) {
          ctx.moveTo(trails[i], trails[i + 1])
          ctx.lineTo(trails[i + 2], trails[i + 3])
        }
        ctx.stroke()
      }
      const blit = (pts: number[], sp: Sprite, a: number) => {
        if (!pts.length || a <= 0.003) return
        ctx.globalAlpha = Math.min(1, a)
        const s = sp.half * 2
        for (let i = 0; i < pts.length; i += 2) ctx.drawImage(sp.cv, pts[i] - sp.half, pts[i + 1] - sp.half, s, s)
      }
      blit(flying, this.spFly, aa)
      blit(home, this.spHome, ab)
    }
    if (t < 1.2 && this.nNoise > 0) {
      const a = 0.34 * TL.prog(t, 0, 0.1) * (1 - TL.prog(t, 0.8, 1.2))
      if (a > 0.003) {
        const pts = TL.noisePoints(t, W, H, this.nNoise)
        const sp = this.spNoise
        const s = sp.half * 2
        ctx.globalAlpha = a
        for (let i = 0; i < pts.length; i += 2) ctx.drawImage(sp.cv, pts[i] - sp.half, pts[i + 1] - sp.half, s, s)
      }
    }

    // ④ 發光線段：全像干涉掃描線、投影光束、線框＋掃描紋理、舞台四角
    ctx.globalAlpha = 1
    ctx.lineCap = 'round'
    const carrier = TL.prog(t, 0, 0.12) * (1 - TL.prog(t, 0.9, 1.4)) * 0.13
    if (carrier > 0.002) {
      const count = Math.ceil(H / 47) + 1
      const span = count * 47
      const segs: number[] = []
      for (let i = 0; i < count; i++) {
        const y = (i * 47 + t * 70) % span
        if (y <= H) segs.push(0, y, W, y)
      }
      this.glow(segs, carrier, 1.0, 3)
    }
    const items: { rect: [number, number, number, number]; tp: number; corners: boolean }[] = []
    for (const r of this.regions) {
      const b = r.el.getBoundingClientRect()
      if (b.width < 1 || b.height < 1) continue // 這個寬度下沒顯示的區塊（例如手機上的章節導覽）不打光束
      items.push({ rect: [b.left, b.top, b.width, b.height], tp: r.tp, corners: false })
    }
    if (this.corners) {
      const b = this.corners.getBoundingClientRect()
      items.push({ rect: [b.left, b.top, b.width, b.height], tp: TL.T_CORNERS, corners: true })
    }
    for (const it of items) {
      const [x, y, w, h] = it.rect
      const tp = it.tp
      if (t >= tp && t < tp + 0.6) {
        const gq = TL.eOutExpo(TL.prog(t, tp, tp + 0.16))
        const ba = 0.55 * (1 - TL.prog(t, tp + 0.3, tp + 0.6))
        const segs: number[] = []
        for (const [qx, qy] of [
          [x, y],
          [x + w - 1, y],
          [x, y + h - 1],
          [x + w - 1, y + h - 1],
        ]) {
          segs.push(cx, cy, cx + (qx - cx) * gq, cy + (qy - cy) * gq)
        }
        this.glow(segs, ba, 1.2, 8)
      }
      if (t >= tp + 0.1 && t < tp + 0.8) {
        const wa = TL.prog(t, tp + 0.1, tp + 0.2) * (1 - TL.prog(t, tp + 0.45, tp + 0.8))
        if (it.corners) {
          // 舞台四角是開口括號（原版第一版畫成全框、變成框住螢幕的大方盒，被主人退過）
          const arm = this.corners ? parseFloat(getComputedStyle(this.corners).getPropertyValue('--arm')) || 46 : 46
          const L = x
          const T = y
          const R = x + w
          const B = y + h
          this.glow(
            [L, T, L + arm, T, L, T, L, T + arm, R, T, R - arm, T, R, T, R, T + arm, L, B, L + arm, B, L, B, L, B - arm, R, B, R - arm, B, R, B, R, B - arm],
            0.85 * wa,
            2.0,
            11,
          )
          continue
        }
        const L = x - 6
        const T = y - 6
        const R = x + w + 6
        const B = y + h + 6
        this.glow([L, T, R, T, R, T, R, B, R, B, L, B, L, B, L, T], 0.75 * wa, 1.4, 9)
        const tex: number[] = []
        for (let yy = Math.floor(T); yy < B; yy += 6) tex.push(L, yy, R, yy)
        this.glow(tex, 0.07 * wa, 1.0, 1.0)
      }
    }

    // ⑤ 掃描光帶（疊加）與暗閃（壓暗）
    if (t >= 2.12 && t < 2.46) {
      const by = TL.lerp(-160, H + 20, TL.prog(t, 2.12, 2.46))
      const g = ctx.createLinearGradient(0, by, 0, by + 150)
      g.addColorStop(0, rgba(holo, 0))
      g.addColorStop(0.5, rgba(holo, 0.1))
      g.addColorStop(1, rgba(holo, 0))
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = g
      ctx.fillRect(0, by, W, 150)
    }
    if (t >= 2.13 && t < 2.27) {
      const dip = 0.28 * Math.sin(Math.PI * TL.prog(t, 2.13, 2.27))
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = rgba(ink, dip)
      ctx.fillRect(0, 0, W, H)
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    this.updateDom(t)
    return handed
  }

  /** 發光線段：三層光暈（寬光暈 0.10、中光暈 0.28、核心 1.0），疊加光（FS_SEGMENT） */
  private glow(segs: number[], a: number, coreW: number, glowW: number) {
    if (a <= 0.002 || !segs.length) return
    const ctx = this.ctx
    const holo = this.opts.colors.holo
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    for (let i = 0; i < segs.length; i += 4) {
      ctx.moveTo(segs[i], segs[i + 1])
      ctx.lineTo(segs[i + 2], segs[i + 3])
    }
    if (glowW > coreW + 0.5) {
      ctx.strokeStyle = rgba(holo, 0.1 * a)
      ctx.lineWidth = glowW + 1
      ctx.stroke()
      ctx.strokeStyle = rgba(holo, 0.28 * a)
      ctx.lineWidth = glowW * 0.42 + 1
      ctx.stroke()
    }
    ctx.strokeStyle = rgba(holo, a)
    ctx.lineWidth = coreW + 0.5
    ctx.stroke()
  }

  /** 面板（DOM 元素）的閃爍色散實體化：opacity＋紅藍錯位影子（原版是 RGB 左右錯開 9px 收到 0） */
  private updateDom(t: number) {
    for (const r of this.regions) {
      if (r.done) continue
      const t0 = r.tp + 0.22
      const st = r.el.style
      if (t < t0) {
        st.opacity = '0'
        continue
      }
      const mq = TL.prog(t, t0, r.tp + 0.55)
      if (mq >= 1) {
        st.opacity = '1'
        st.filter = ''
        r.done = true
        continue
      }
      const op = TL.eOutCubic(mq) * TL.flicker(t, 20 + r.tp * 10, 1 - mq)
      const kk = 9 * (1 - mq) ** 1.5
      st.opacity = op.toFixed(3)
      st.filter = kk > 0.4 ? `drop-shadow(${kk.toFixed(1)}px 0 0 var(--split-r)) drop-shadow(${(-kk).toFixed(1)}px 0 0 var(--split-b))` : ''
    }
    if (this.corners) {
      const t0 = TL.T_CORNERS + 0.22
      const cq = TL.prog(t, t0, TL.T_CORNERS + 0.5)
      this.corners.style.opacity = t < t0 ? '0' : (TL.eOutCubic(cq) * TL.flicker(t, 4, 1 - cq)).toFixed(3)
    }
  }

  /** 收幕：拿掉所有開機時加上去的 inline 樣式（呼叫前先把 boot phase 設成 done，CSS 的隱藏規則才不會又蓋回來） */
  release() {
    for (const r of this.regions) {
      r.el.style.opacity = ''
      r.el.style.filter = ''
    }
    if (this.corners) this.corners.style.opacity = ''
  }
}
