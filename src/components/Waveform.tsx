/**
 * 聲音波形——JARVIS 舞台底部那條麥克風波形（jarvis_ui.py:1872-1940 _paint_wave，2026-08-28 主人選的「最像鋼鐵人」）的網頁版：
 * 上下對稱的包絡線、中間濃兩邊淡的填色、1.6px 描邊、極淡中線、上下兩條虛線＝「要多大聲才叫得動她」的門檻（滿格的 1/2.2）。
 * 取樣先做 (前+2×自己+後)/4 平滑（原版同一招，避免鋸齒）。
 * 網頁沒有麥克風，所以是一段固定的「講話」音量曲線，整條往左捲動（CSS transform，不開 canvas 迴圈）。
 */
import { useId } from 'react'

const N = 72 // 一段的取樣數
const W = 360 // 一段的寬（viewBox 單位）
const H = 64
const MID = H / 2
const HMAX = 26

function rnd(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 一段像「講一句話」的音量：幾個音節的起伏＋中間停頓，頭尾收在環境音（接起來才無縫） */
const LEVELS = (() => {
  const r = rnd(11)
  const lv = new Array(N).fill(0).map(() => 0.04 + 0.05 * r())
  let i = 4
  while (i < N - 8) {
    const len = 3 + Math.floor(r() * 5)
    const amp = 0.45 + 0.55 * r()
    for (let k = 0; k < len && i + k < N - 4; k++) lv[i + k] = Math.max(lv[i + k], amp * Math.sin((Math.PI * (k + 0.5)) / len))
    i += len + (r() < 0.3 ? 5 : 1)
  }
  return lv.map((_, k) => (lv[Math.max(0, k - 1)] + 2 * lv[k] + lv[Math.min(N - 1, k + 1)]) / 4)
})()

function envelope(offset: number) {
  const step = W / (N - 1)
  const top = LEVELS.map((v, k) => [offset + k * step, MID - Math.max(1, v * HMAX)] as const)
  const bot = LEVELS.map((v, k) => [offset + k * step, MID + Math.max(1, v * HMAX)] as const)
  const line = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  const fill = line(top) + bot
    .slice()
    .reverse()
    .map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`)
    .join('') + 'Z'
  return { top: line(top), bot: line(bot), fill }
}

const A = envelope(0)
const B = envelope(W)

export function Waveform({ className = '' }: { className?: string }) {
  const gid = useId().replace(/:/g, '')
  const gh = HMAX / 2.2
  return (
    <div className={`waveform ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id={`wf-${gid}`} x1="0" y1={MID - HMAX} x2="0" y2={MID + HMAX} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={MID} y2={MID} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={MID - gh} y2={MID - gh} stroke="currentColor" strokeOpacity="0.22" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={MID + gh} y2={MID + gh} stroke="currentColor" strokeOpacity="0.22" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <g className="waveform-scroll">
          {[A, B].map((e, k) => (
            <g key={k}>
              <path d={e.fill} fill={`url(#wf-${gid})`} />
              <path d={e.top} fill="none" stroke="currentColor" strokeOpacity="0.85" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d={e.bot} fill="none" stroke="currentColor" strokeOpacity="0.85" strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
