/**
 * JARVIS 狀態球的 Canvas 2D 移植（網頁版）。
 *
 * 來源（唯讀，一行都沒改原檔）：
 * - C:\Users\USER\.jarvis\scripts\jarvis_ui.py:92-95   BLOB_LAT/BLOB_LON＝12×18 網格（462 條線段）、CORE_SIZE＝840
 * - C:\Users\USER\.jarvis\scripts\jarvis_ui.py:497-687  BlobCore：刻度環（72 格、每 30° 長刻度）、掃描弧（雙弧＋前緣光點）、
 *                                                       中央光暈、線框變形球（三組正弦擾動、繞 Y 轉＋傾斜 0.42 rad）、思考中三顆繞圈光點
 * - C:\Users\USER\.jarvis\scripts\jarvis_core_fx.py:57-154  ThinkNeural：思考中＝神經網路閃爍（46 節點、壽命 0.8 秒、傳遞 0.30 秒、最多 18 發）
 * - C:\Users\USER\.jarvis\scripts\jarvis_core_fx.py:157-192 SpeakSpectrum：說話中＝頻譜冠冕（72 根放射音量條，上升快、落下慢）
 *
 * 做法：全部在 JARVIS 原本的 840×840 座標裡畫（ctx 先縮放），比例、線數、轉速、公式照抄。
 * 只改兩件事（網頁必要的適配）：
 * 1. 線寬／點大小：JARVIS 在 840 實體像素上畫 1px 線；手機上球只有 ~500 實體像素，照比例縮會細到看不見
 *    → 線寬至少維持 1 個實體像素（lw 倍率，見 lineScale）。
 * 2. 頻譜冠冕的平滑係數 0.6／0.14 原本是「每 33ms 一格」的量；網頁 60fps 改成依時間換算，手感一樣。
 * 3. 音量來源：網頁沒有聲音（主人選的），冠冕跟著「字幕逐字出現」跳——每打出一個字就是一個音節。
 */
import type { OrbState } from '../content'

export type RGB = readonly [number, number, number]

export const CORE = 840
const BLOB_LAT = 12
const BLOB_LON = 18
const TAU = Math.PI * 2
// 白色不寫死在這裡：由呼叫端從 token 解析後放進 OrbFrame（--orb-white＝jarvis_core_fx.py:24 WHITE、
// --orb-spark＝jarvis_ui.py:606,682 前緣光點／繞圈光點的純白）

// 單位球網格頂點方向（jarvis_ui.py:518-524，啟動時算一次）
const DIRS: number[] = []
for (let i = 0; i <= BLOB_LAT; i++) {
  const th = (i / BLOB_LAT) * Math.PI
  const st = Math.sin(th)
  const ct = Math.cos(th)
  for (let j = 0; j <= BLOB_LON; j++) {
    const ph = (j / BLOB_LON) * TAU
    DIRS.push(st * Math.cos(ph), ct, st * Math.sin(ph))
  }
}
const NPTS = DIRS.length / 3
const W_ROW = BLOB_LON + 1

function rgba(c: RGB, a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a <= 0 ? 0 : a >= 1 ? 1 : a})`
}

/** 可重現的亂數（JARVIS 用 random.Random(seed)；序列不必一樣，只要每次開都一樣） */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 放射光暈貼圖：畫一次、之後每格只貼（jarvis_core_fx.py:40 sprite()） */
function makeSprite(c: RGB, size: number, mid: number, midA: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, rgba(c, 1))
  grad.addColorStop(mid, rgba(c, midA))
  grad.addColorStop(1, rgba(c, 0))
  g.fillStyle = grad
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, TAU)
  g.fill()
  return cv
}

/** 一批圓點（Qt drawPoints＋圓頭畫筆＝直徑 w 的圓） */
function fillDots(ctx: CanvasRenderingContext2D, pts: number[], diameter: number) {
  if (!pts.length) return
  const r = diameter / 2
  ctx.beginPath()
  for (let k = 0; k < pts.length; k += 2) {
    ctx.moveTo(pts[k] + r, pts[k + 1])
    ctx.arc(pts[k], pts[k + 1], r, 0, TAU)
  }
  ctx.fill()
}

// ─────────────────────────── 思考中：神經網路閃爍 ───────────────────────────
interface Fire {
  t0: number
  i: number
  gen: number
  done: boolean
}

class ThinkNeural {
  static N = 46
  static LIFE = 0.8
  static TRAVEL = 0.3
  static MAX_FIRES = 18
  private dirs: [number, number, number][] = []
  private nb: number[][] = []
  private fires: Fire[] = []
  private nextFire = 0
  private rng: () => number
  private spC: HTMLCanvasElement | null = null
  private spW: HTMLCanvasElement | null = null
  private key = ''

  constructor(seed = 3) {
    this.rng = mulberry32(seed)
    const N = ThinkNeural.N
    for (let i = 0; i < N; i++) {
      // 球面均勻分佈
      const yy = 1 - (2 * (i + 0.5)) / N
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy))
      const th = i * 2.399963
      this.dirs.push([rr * Math.cos(th), yy, rr * Math.sin(th)])
    }
    const d2 = (i: number, j: number) => {
      const a = this.dirs[i]
      const b = this.dirs[j]
      return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    }
    for (let i = 0; i < N; i++) {
      const order = Array.from({ length: N }, (_, j) => j).sort((a, b) => d2(i, a) - d2(i, b))
      this.nb.push(order.slice(1, 4))
    }
  }

  private proj(cx: number, cy: number, S: number, tc: number, d: [number, number, number], spin: number): [number, number, number] {
    const rot = tc * 0.5 * 1.7 + spin // 跟 BlobCore 思考狀態的轉速公式一樣（加上手指撥轉的角度），節點才會黏在球上
    const ca = Math.cos(rot)
    const sa = Math.sin(rot)
    const cb = Math.cos(0.42)
    const sb = Math.sin(0.42)
    const R = S * 0.195 * 1.16 // 浮在線框外一點
    const [x, y, z] = d
    const X = x * ca + z * sa
    const Z = -x * sa + z * ca
    const Y2 = y * cb - Z * sb
    const Z2 = y * sb + Z * cb
    return [cx + X * R, cy - Y2 * R, Z2]
  }

  paint(ctx: CanvasRenderingContext2D, cx: number, cy: number, S: number, t: number, tc: number, c: RGB, lw: number, WHITE: RGB, spin = 0) {
    const key = c.join(',') + '|' + WHITE.join(',')
    if (this.key !== key) {
      this.key = key
      this.spC = makeSprite(c, 64, 0.25, 0.5)
      this.spW = makeSprite(WHITE, 48, 0.3, 0.55)
    }
    const N = ThinkNeural.N
    const pts = this.dirs.map((d) => this.proj(cx, cy, S, tc, d, spin))
    const back: number[] = []
    const front: number[] = []
    for (const [x, y, z] of pts) (z <= -0.25 ? back : front).push(x, y)
    ctx.fillStyle = rgba(c, 0.22)
    fillDots(ctx, back, 3.0 * lw)
    ctx.fillStyle = rgba(c, 0.6)
    fillDots(ctx, front, 3.8 * lw)

    // 分頁切走又回來時 t 會一次跳很多：不要一口氣補發上百發
    if (t - this.nextFire > 1) this.nextFire = t
    while (t >= this.nextFire) {
      if (this.fires.length < ThinkNeural.MAX_FIRES) {
        this.fires.push({ t0: this.nextFire, i: Math.floor(this.rng() * N), gen: 0, done: false })
      }
      this.nextFire += 0.07 + this.rng() * 0.07
    }
    const born: Fire[] = []
    for (const f of this.fires) {
      // 脈衝抵達 → 有機會點亮鄰居（最多傳兩代）
      if (!f.done && t - f.t0 >= ThinkNeural.TRAVEL) {
        f.done = true
        if (f.gen < 2) {
          for (const j of this.nb[f.i]) {
            if (this.rng() < 0.28 && this.fires.length + born.length < ThinkNeural.MAX_FIRES) {
              born.push({ t0: f.t0 + ThinkNeural.TRAVEL, i: j, gen: f.gen + 1, done: false })
            }
          }
        }
      }
    }
    this.fires = this.fires.concat(born).filter((f) => t - f.t0 < ThinkNeural.LIFE)

    const lines: number[][] = [[], [], [], []]
    const glows: number[] = []
    const pulses: number[] = []
    const cores: number[] = []
    for (const f of this.fires) {
      const age = t - f.t0
      if (age < 0) continue
      const k = 1 - age / ThinkNeural.LIFE
      const [x, y, z] = pts[f.i]
      const depth = 0.45 + (0.55 * (z + 1)) / 2
      const a = k * depth
      glows.push(x, y, 26 * k + 10, 0.95 * a)
      if (k > 0.55) cores.push(x, y)
      const q = Math.min(3, Math.floor(a * 4))
      for (const j of this.nb[f.i]) {
        const [x2, y2] = pts[j]
        lines[q].push(x, y, x2, y2)
        if (age < ThinkNeural.TRAVEL) {
          const u = age / ThinkNeural.TRAVEL
          pulses.push(x + (x2 - x) * u, y + (y2 - y) * u, 0.95 * depth)
        }
      }
    }
    const qs = [0.25, 0.5, 0.75, 1.0]
    ctx.lineCap = 'square'
    for (let q = 0; q < 4; q++) {
      const L = lines[q]
      if (!L.length) continue
      ctx.beginPath()
      for (let k = 0; k < L.length; k += 4) {
        ctx.moveTo(L[k], L[k + 1])
        ctx.lineTo(L[k + 2], L[k + 3])
      }
      ctx.strokeStyle = rgba(c, 0.22 * qs[q])
      ctx.lineWidth = 6.0 * lw
      ctx.stroke()
      ctx.strokeStyle = rgba(qs[q] > 0.6 ? WHITE : c, 0.95 * qs[q])
      ctx.lineWidth = 1.6 * lw
      ctx.stroke()
    }
    const prevAlpha = ctx.globalAlpha
    for (let k = 0; k < glows.length; k += 4) {
      const r = glows[k + 2]
      ctx.globalAlpha = Math.min(1, glows[k + 3])
      ctx.drawImage(this.spC!, glows[k] - r, glows[k + 1] - r, 2 * r, 2 * r)
    }
    for (let k = 0; k < pulses.length; k += 3) {
      ctx.globalAlpha = pulses[k + 2]
      ctx.drawImage(this.spW!, pulses[k] - 9, pulses[k + 1] - 9, 18, 18)
    }
    ctx.globalAlpha = prevAlpha
    if (cores.length) {
      ctx.fillStyle = rgba(WHITE, 0.95)
      fillDots(ctx, cores, 4.0 * lw)
    }
  }
}

// ─────────────────────────── 說話中：頻譜冠冕 ───────────────────────────
class SpeakSpectrum {
  static N = 72
  private h = new Float32Array(SpeakSpectrum.N)

  paint(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, level: number, c: RGB, lw: number, dt: number, WHITE: RGB) {
    const base = 346.0
    const N = SpeakSpectrum.N
    // 原本 0.6／0.14 是「每 33ms 一格」的量，換成依時間：1-(1-k)^(dt/0.033)
    const steps = Math.max(0.25, Math.min(4, dt / 0.033))
    const up = 1 - Math.pow(1 - 0.6, steps)
    const down = 1 - Math.pow(1 - 0.14, steps)
    const seg: number[] = []
    const tips: number[] = []
    for (let i = 0; i < N; i++) {
      const ang = (i * TAU) / N - Math.PI / 2
      const wob = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 7.3 + i * 0.9)) * (0.5 + 0.5 * Math.sin(t * 3.1 - i * 0.37))
      const target = level * wob
      let h = this.h[i]
      h += (target - h) * (target > h ? up : down) // 上升快、落下慢，像音響的頻譜
      this.h[i] = h
      const L = 4.0 + 62.0 * h
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      seg.push(cx + base * ca, cy + base * sa, cx + (base + L) * ca, cy + (base + L) * sa)
      if (h > 0.55) tips.push(cx + (base + L + 5) * ca, cy + (base + L + 5) * sa)
    }
    ctx.beginPath()
    for (let k = 0; k < seg.length; k += 4) {
      ctx.moveTo(seg[k], seg[k + 1])
      ctx.lineTo(seg[k + 2], seg[k + 3])
    }
    ctx.lineCap = 'butt'
    ctx.strokeStyle = rgba(c, 0.22)
    ctx.lineWidth = 6.5 * lw
    ctx.stroke()
    ctx.strokeStyle = rgba(c, 0.92)
    ctx.lineWidth = 2.2 * lw
    ctx.stroke()
    ctx.fillStyle = rgba(WHITE, 0.9)
    fillDots(ctx, tips, 3.0 * lw)
  }
}

// ─────────────────────────── 球體本體 ───────────────────────────
export interface OrbFrame {
  /** 球體動畫時間（秒） */
  t: number
  state: OrbState
  color: RGB
  /** --orb-white（JARVIS 特效用的偏藍白） */
  white: RGB
  /** --orb-spark（前緣光點、繞圈光點的純白） */
  spark: RGB
  /** 說話音量 0～1（只有 speaking 用） */
  level: number
  /** 刻度環點亮格數（0～72）；null＝均勻裝飾環（JARVIS 沒資料時就是這樣，不畫假數據） */
  lit: number | null
  /** 距上一格幾秒（頻譜平滑用） */
  dt: number
  /** 手指／滑鼠撥轉的額外角度（弧度，第四輪加的互動；JARVIS 本尊沒有） */
  spin?: number
}

/** 線寬倍率：至少 1 個實體像素（JARVIS 在 840 實體像素上畫 1px 線，手機球小，照比例縮會看不見） */
export function lineScale(deviceSize: number) {
  return Math.max(1, CORE / Math.max(1, deviceSize))
}

export class OrbPainter {
  private neural: ThinkNeural | null = null
  private spectrum: SpeakSpectrum | null = null
  private fxState: OrbState | null = null
  private fxT0 = 0
  private buckets: number[][] = Array.from({ length: 14 }, () => [])
  private pts = new Float64Array(NPTS * 3)

  /**
   * 在 ctx 上畫一格。ctx 的座標必須已經縮放成 840×840（呼叫端做 setTransform）。
   * lw＝線寬倍率（lineScale）。
   */
  paint(ctx: CanvasRenderingContext2D, f: OrbFrame, lw: number) {
    const S = CORE
    const cx = S / 2
    const cy = S / 2
    const c = f.color
    const WHITE_PURE = f.spark
    const t = f.t
    const st = f.state
    ctx.clearRect(0, 0, S, S)

    // ── 刻度環（72 格，每 30° 長刻度）jarvis_ui.py:563-591 ──
    const groups = new Map<string, number[]>()
    for (let i = 0; i < 72; i++) {
      const a = (i * Math.PI) / 36
      const lng = i % 6 === 0
      const r1 = S * (lng ? 0.352 : 0.372)
      const r2 = S * 0.402
      let w: number
      let alpha: number
      if (f.lit == null) {
        ;[w, alpha] = lng ? [1.6, 0.7] : [1.0, 0.24]
      } else {
        const idx = (((18 - i) % 72) + 72) % 72 // 起點轉到正上方、順時針
        const on = idx < f.lit
        ;[w, alpha] = on ? [1.8, 0.85] : lng ? [1.4, 0.3] : [1.0, 0.14]
      }
      const k = w + '|' + alpha
      let g = groups.get(k)
      if (!g) groups.set(k, (g = []))
      g.push(cx + r1 * Math.cos(a), cy - r1 * Math.sin(a), cx + r2 * Math.cos(a), cy - r2 * Math.sin(a))
    }
    ctx.lineCap = 'square'
    for (const [k, L] of groups) {
      const [w, alpha] = k.split('|').map(Number)
      ctx.beginPath()
      for (let n = 0; n < L.length; n += 4) {
        ctx.moveTo(L[n], L[n + 1])
        ctx.lineTo(L[n + 2], L[n + 3])
      }
      ctx.strokeStyle = rgba(c, alpha)
      ctx.lineWidth = w * lw
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, S * 0.402, 0, TAU)
    ctx.strokeStyle = rgba(c, 0.18)
    ctx.lineWidth = 1 * lw
    ctx.stroke()

    // ── 掃描弧（雙弧＋前緣光點）jarvis_ui.py:593-607 ──
    // Qt 的 drawArc 是逆時針、y 朝上；canvas 是順時針、y 朝下 → 角度取負
    const arcR = S * 0.335
    const a0 = t * 0.9 * (st === 'thinking' ? 1.7 : 0.8) // 弧度（原式先轉成度再轉回，等價）
    const d63 = (63 * Math.PI) / 180
    const d46 = (46 * Math.PI) / 180
    ctx.beginPath()
    ctx.arc(cx, cy, arcR, -(a0 + d63), -a0)
    ctx.lineCap = 'round'
    ctx.strokeStyle = rgba(c, 0.9)
    ctx.lineWidth = 3 * lw
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, arcR, -(a0 + Math.PI + d46), -(a0 + Math.PI))
    ctx.lineCap = 'square'
    ctx.strokeStyle = rgba(c, 0.4)
    ctx.lineWidth = 2 * lw
    ctx.stroke()
    const lead = a0 + d63
    const bx = cx + arcR * Math.cos(lead)
    const by = cy - arcR * Math.sin(lead)
    let g = ctx.createRadialGradient(bx, by, 0, bx, by, 8 * lw)
    g.addColorStop(0, rgba(WHITE_PURE, 220 / 255))
    g.addColorStop(1, rgba(WHITE_PURE, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(bx, by, 8 * lw, 0, TAU)
    ctx.fill()

    // ── 中央光暈 jarvis_ui.py:609-613 ──
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.3)
    g.addColorStop(0, rgba(c, 0.3))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, S * 0.3, 0, TAU)
    ctx.fill()

    // ── 線框變形球 jarvis_ui.py:615-667 ──
    let amp: number
    let spd: number
    if (st === 'thinking') {
      amp = 0.27
      spd = 1.7
    } else if (st === 'speaking') {
      amp = 0.1 + 0.11 * Math.abs(Math.sin(t * 3.2))
      spd = 0.9
    } else {
      amp = 0.15
      spd = 0.8
    }
    const rot = t * 0.5 * spd + (f.spin ?? 0)
    const ca = Math.cos(rot)
    const sa = Math.sin(rot)
    const cb = Math.cos(0.42)
    const sb = Math.sin(0.42)
    const R = S * 0.195
    const P = this.pts
    for (let n = 0; n < NPTS; n++) {
      const x0 = DIRS[n * 3]
      const y0 = DIRS[n * 3 + 1]
      const z0 = DIRS[n * 3 + 2]
      const nz =
        Math.sin(2.3 * x0 + t * 1.4 * spd) + 0.7 * Math.sin(3.1 * y0 - t * 1.8 * spd) + 0.5 * Math.sin(2.7 * z0 + t * 1.1 * spd)
      const d = 1 + amp * 0.5 * nz
      const x = x0 * d
      const y = y0 * d
      const z = z0 * d
      const X = x * ca + z * sa
      const Z = -x * sa + z * ca
      const Y2 = y * cb - Z * sb
      const Z2 = y * sb + Z * cb
      P[n * 3] = cx + X * R
      P[n * 3 + 1] = cy - Y2 * R
      P[n * 3 + 2] = Z2
    }
    const B = this.buckets
    for (const b of B) b.length = 0
    const seg = (ia: number, ib: number) => {
      const zm = (P[ia * 3 + 2] + P[ib * 3 + 2]) / 2
      let level = Math.floor(((0.1 + (0.34 * (zm + 1.35)) / 2.7) * 13) / 0.44)
      level = level < 0 ? 0 : level > 13 ? 13 : level
      B[level].push(P[ia * 3], P[ia * 3 + 1], P[ib * 3], P[ib * 3 + 1])
    }
    for (let i = 0; i <= BLOB_LAT; i++) for (let j = 0; j < BLOB_LON; j++) seg(i * W_ROW + j, i * W_ROW + j + 1)
    for (let i = 0; i < BLOB_LAT; i++) for (let j = 0; j < W_ROW; j++) seg(i * W_ROW + j, (i + 1) * W_ROW + j)
    ctx.lineCap = 'square'
    ctx.lineWidth = 1.0 * lw
    for (let level = 1; level < 14; level++) {
      const L = B[level]
      if (!L.length) continue
      ctx.beginPath()
      for (let n = 0; n < L.length; n += 4) {
        ctx.moveTo(L[n], L[n + 1])
        ctx.lineTo(L[n + 2], L[n + 3])
      }
      ctx.strokeStyle = rgba(c, Math.floor((level * 255) / 13) / 255)
      ctx.stroke()
    }

    // ── 狀態專屬動態：思考中三顆繞圈光點 jarvis_ui.py:676-683 ──
    if (st === 'thinking') {
      for (let k = 0; k < 3; k++) {
        const a = t * 1.3 + k * 2.094
        const nx = cx + arcR * Math.cos(a)
        const ny = cy - arcR * Math.sin(a)
        const gg = ctx.createRadialGradient(nx, ny, 0, nx, ny, 7 * lw)
        gg.addColorStop(0, rgba(WHITE_PURE, 240 / 255))
        gg.addColorStop(1, rgba(c, 0))
        ctx.fillStyle = gg
        ctx.beginPath()
        ctx.arc(nx, ny, 7 * lw, 0, TAU)
        ctx.fill()
      }
    }

    // ── 思考中＝神經網路閃爍、說話中＝頻譜冠冕（jarvis_core_fx，疊在最上面）jarvis_ui.py:702-721 ──
    if (st === 'thinking' || st === 'speaking') {
      if (this.fxState !== st) {
        this.fxState = st
        this.fxT0 = t
        this.neural = st === 'thinking' ? new ThinkNeural() : null
        this.spectrum = st === 'speaking' ? new SpeakSpectrum() : null
      }
      ctx.save()
      if (st === 'thinking') this.neural!.paint(ctx, cx, cy, S, t - this.fxT0, t, c, lw, f.white, f.spin ?? 0)
      else this.spectrum!.paint(ctx, cx, cy, t - this.fxT0, f.level, c, lw, f.dt, f.white)
      ctx.restore()
    } else {
      this.fxState = null
    }
  }
}

/** 把一格畫進指定 canvas（開機投影要拍「球體快照」用；static 模式也用它畫唯一一格） */
export function renderOrbFrame(
  canvas: HTMLCanvasElement,
  cssSize: number,
  dpr: number,
  frame: OrbFrame,
  painter: OrbPainter = new OrbPainter(),
) {
  const dev = Math.max(1, Math.round(cssSize * dpr))
  if (canvas.width !== dev || canvas.height !== dev) {
    canvas.width = dev
    canvas.height = dev
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, dev, dev)
  const k = dev / CORE
  ctx.setTransform(k, 0, 0, k, 0, 0)
  painter.paint(ctx, frame, lineScale(dev))
  return canvas
}
