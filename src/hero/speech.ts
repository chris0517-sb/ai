/**
 * 字幕打字機＋「假音量」。網頁沒有聲音（主人選的），JARVIS 的頻譜冠冕改成跟著字幕跳：
 * 每打出一個字＝一個音節的音量脈衝，逗號、句號停一下——看起來像她真的在講話。
 *
 * 打字速度沿用 JARVIS 字幕條（jarvis_ui.py:1981 SubtitleBar._cps＝22 字／秒，下限 9、上限 26）。
 * 講完之後保留 1.2 秒才收（jarvis_ui.py:2026 mark_done：max(now+1.2, start+2.8)）。
 */
export const CPS = 22
export const DONE_HOLD = 1.2

const PAUSE_SHORT = /[，、；：,;:]/
const PAUSE_LONG = /[。？！?!…]/
const SILENT = /[\s，。、；：？！「」『』（）()／/,.;:?!…—-]/

export interface SpeechPlan {
  text: string
  /** 第 i 個字出現的時間（秒，從開口算） */
  times: Float32Array
  /** 第 i 個字的音量脈衝大小（標點、空白＝0） */
  amps: Float32Array
  /** 最後一個字打完的時間 */
  end: number
}

function hash01(n: number) {
  let x = n | 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

export function planSpeech(text: string, cps = CPS): SpeechPlan {
  const chars = Array.from(text)
  const n = chars.length
  const times = new Float32Array(n)
  const amps = new Float32Array(n)
  const step = 1 / Math.max(9, Math.min(26, cps))
  let t = 0
  for (let i = 0; i < n; i++) {
    const ch = chars[i]
    times[i] = t
    amps[i] = SILENT.test(ch) ? 0 : 0.55 + 0.45 * hash01(ch.codePointAt(0)! * 31 + i)
    t += step
    if (PAUSE_SHORT.test(ch)) t += 0.14
    else if (PAUSE_LONG.test(ch)) t += 0.28
  }
  return { text, times, amps, end: n ? times[n - 1] + step : 0 }
}

/** 第 dt 秒時已經打出幾個字（UTF-16 以外的字也照「一個字」算） */
export function shownCount(p: SpeechPlan, dt: number) {
  const T = p.times
  let lo = 0
  let hi = T.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (T[mid] <= dt) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** 第 dt 秒的音量 0～1：最近幾個字的脈衝取最大（每個字衰減時間 0.09 秒） */
export function levelAt(p: SpeechPlan, dt: number) {
  const n = shownCount(p, dt)
  let lv = 0
  for (let i = n - 1; i >= 0 && dt - p.times[i] < 0.5; i--) {
    const v = p.amps[i] * Math.exp(-(dt - p.times[i]) / 0.09)
    if (v > lv) lv = v
  }
  return Math.min(1, lv)
}

/** 把字數換成字串（處理罕用字的代理對） */
export function sliceChars(text: string, count: number) {
  return Array.from(text).slice(0, count).join('')
}
