/**
 * 開機全像投影（2026-09-15 定案 B 版）的時間軸——網頁移植。
 *
 * 來源（唯讀）：
 * - C:\Users\USER\.jarvis\scripts\jarvis_fx_timeline.py:22-33   時間常數（T_MAT0/1、T_CORNERS、PROJ、T_LIFT、N_CORE、N_NOISE）
 * - C:\Users\USER\.jarvis\scripts\jarvis_fx_timeline.py:37-71   prog／緩動／flicker 全像閃爍公式
 * - C:\Users\USER\.jarvis\scripts\jarvis_fx_timeline.py:97-143  lit_points 取樣＋core_particles（粒子從四面八方飛進來組成球體）
 * - C:\Users\USER\.jarvis\scripts\jarvis_fx_timeline.py:170-248 雜訊點、投影光束、線框＋掃描紋理、boot_spec（第 t 秒畫什麼）
 * - C:\Users\USER\.jarvis\scripts\jarvis_fx_gl.py:86-174        粒子路徑（smootherstep＋垂直旋繞）、粒子光點、發光線段三層光暈
 *
 * 原版從 0 播到 2.62 秒（BOOT_END）；網頁版整條時間軸等比例壓縮到 ≤1.8 秒（規格 §1-2）：
 * 每一格先把網頁時間換算回「原版第幾秒」，再用原版公式算——動作、順序、比例都跟原版一樣，只是播快一點。
 */

export const T_MAT0 = 0.95
export const T_MAT1 = 1.4
export const T_CORNERS = 1.26
/** 面板投影時間（原版 PROJ 的 8 個時間點，依序分給網頁上的 8 個區塊） */
export const PROJ_TIMES = [1.22, 1.3, 1.38, 1.46, 1.52, 1.58, 1.64, 1.72] as const
export const T_LIFT0 = 2.46
export const T_LIFT1 = 2.62
export const BOOT_END = T_LIFT1
export const N_CORE = 2200
export const N_NOISE = 360

/** 網頁版開機總長（秒）：≤1.8 是硬線 */
export const WEB_BOOT_SECONDS = 1.75

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
export const prog = (t: number, t0: number, t1: number) => (t1 > t0 ? clamp((t - t0) / (t1 - t0)) : t >= t1 ? 1 : 0)
export const eOutCubic = (x: number) => 1 - (1 - x) ** 3
export const eOutExpo = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x))
export const smooth = (x: number) => x * x * (3 - 2 * x)
export const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/** 整數雜湊 → [0,1)。取代 Python 的 random.Random(seed).random()（序列不必相同，只要同一個種子每次一樣） */
function hash01(n: number) {
  let x = n | 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** 全像閃爍：大部分時間亮、偶爾掉下去。strength=0 不閃。跟原型同一支公式（jarvis_fx_timeline.py:65） */
export function flicker(t: number, seed: number, strength: number) {
  if (strength <= 0) return 1
  const r = hash01(Math.floor(seed * 1009) + Math.floor(t * 45))
  const v = r > 0.28 ? 1 : 0.3 + 0.5 * r
  return 1 - strength * (1 - v)
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 從球體快照裡「真的有畫東西」的像素取樣（lit_points，門檻 55）——粒子是飛回那些亮點上的。
 * data＝getImageData 的 RGBA（未預乘），回傳 [x0,y0,x1,y1,...]（快照座標）。
 */
export function litPoints(data: Uint8ClampedArray, w: number, h: number, n: number, seed: number, thresh = 55) {
  const idx: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const a = data[o + 3]
      if (!a) continue
      const m = Math.max(data[o], data[o + 1], data[o + 2]) * (a / 255) // 預乘後的亮度
      if (m > thresh) idx.push(x, y)
    }
  }
  const out = new Float32Array(n * 2)
  const cnt = idx.length / 2
  if (!cnt) return new Float32Array(0)
  const rnd = mulberry32(seed)
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rnd() * cnt)
    out[i * 2] = idx[k * 2]
    out[i * 2 + 1] = idx[k * 2 + 1]
  }
  return out
}

/**
 * 開機粒子（core_particles）：每顆 8 個數——起點xy、目標xy、延遲、飛行時間、旋繞、大小。
 * 原版在 1920×1080 螢幕、840 的球上量的距離（760–1500、338、±160），網頁版乘上球的縮放 k＝球寬/840。
 */
export function coreParticles(targets: Float32Array, cx: number, cy: number, k: number) {
  const n = targets.length / 2
  const out = new Float32Array(n * 8)
  const rnd = mulberry32(6)
  for (let i = 0; i < n; i++) {
    const tx = targets[i * 2]
    const ty = targets[i * 2 + 1]
    const ang = rnd() * Math.PI * 2
    const rad = (760 + rnd() * 740) * k
    const tr = Math.hypot(tx - cx, ty - cy) / (338 * k)
    const o = i * 8
    out[o] = cx + Math.cos(ang) * rad
    out[o + 1] = cy + Math.sin(ang) * rad * 0.62
    out[o + 2] = tx
    out[o + 3] = ty
    out[o + 4] = 0.1 + 0.4 * rnd() + 0.14 * clamp(tr, 0, 1.2)
    out[o + 5] = 0.42 + 0.22 * rnd()
    out[o + 6] = (-160 + 320 * rnd()) * k
    out[o + 7] = 2.2
  }
  return out
}

/** 粒子在第 t 秒的位置（jarvis_fx_gl.py VS_PARTICLE posAt，uMode==0）：smootherstep＋垂直方向 sin(πq) 旋繞 */
export function particlePos(p: Float32Array, o: number, t: number, out: [number, number]) {
  const q = clamp((t - p[o + 4]) / p[o + 5])
  const e = q * q * q * (q * (q * 6 - 15) + 10)
  const dx = p[o + 2] - p[o]
  const dy = p[o + 3] - p[o + 1]
  const len = Math.hypot(dx, dy) || 1e-6
  const s = Math.sin(Math.PI * q) * p[o + 6]
  out[0] = p[o] + dx * e + (-dy / len) * s
  out[1] = p[o + 1] + dy * e + (dx / len) * s
  return q
}

/** 全像雜訊點：每 1/30 秒換一批（noise_points） */
export function noisePoints(t: number, W: number, H: number, n: number) {
  const rnd = mulberry32(Math.floor(t * 30) + 1)
  const out = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    out[i * 2] = rnd() * W
    out[i * 2 + 1] = rnd() * H
  }
  return out
}
