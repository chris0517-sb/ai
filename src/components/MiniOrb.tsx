import { useId } from 'react'
import { useMiniState } from '../lib/miniOrb'

/**
 * 迷你光球（≤40px，純 SVG＋CSS 動畫，不開 canvas 迴圈）。
 * 造型照開場那顆 JARVIS 光球縮小：刻度環（每 30° 長刻度）、掃描弧＋前緣光點、線框球、中央光暈。
 * 狀態寫在 data-state（standby／thinking／speaking／alert），顏色與轉速跟著變；static 級只換顏色、不動。
 */
const TICKS = (() => {
  let d = ''
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12
    const long = i % 2 === 0
    const r1 = long ? 16.2 : 17.2
    const r2 = 19
    const c = Math.cos(a)
    const s = Math.sin(a)
    d += `M${(20 + r1 * c).toFixed(2)} ${(20 - r1 * s).toFixed(2)}L${(20 + r2 * c).toFixed(2)} ${(20 - r2 * s).toFixed(2)}`
  }
  return d
})()

// 掃描弧：半徑 13.4、63°（跟 BlobCore 的 0.335×S、63° 同比例）
const ARC = (() => {
  const r = 13.4
  const a0 = 0
  const a1 = (63 * Math.PI) / 180
  const p = (a: number) => `${(20 + r * Math.cos(a)).toFixed(2)} ${(20 - r * Math.sin(a)).toFixed(2)}`
  return { d: `M${p(a0)}A${r} ${r} 0 0 0 ${p(a1)}`, lead: p(a1).split(' ').map(Number) }
})()

export function MiniOrb({ className = '' }: { className?: string }) {
  const state = useMiniState()
  const gid = useId().replace(/:/g, '')
  return (
    <span className={`mini-orb ${className}`} data-state={state} data-testid="mini-orb" aria-hidden="true">
      <svg viewBox="0 0 40 40" width="100%" height="100%">
        <defs>
          <radialGradient id={`mo-g-${gid}`}>
            <stop offset="0" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="mo-glow" cx="20" cy="20" r="12" fill={`url(#mo-g-${gid})`} />
        <g className="mo-crown">
          <path d={TICKS} stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" fill="none" />
          <circle cx="20" cy="20" r="19" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6" fill="none" />
        </g>
        <g className="mo-arc">
          <path d={ARC.d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <circle cx={ARC.lead[0]} cy={ARC.lead[1]} r="1.3" fill="currentColor" />
        </g>
        <g className="mo-sphere" stroke="currentColor" fill="none" strokeWidth="0.8">
          <circle cx="20" cy="20" r="7.6" strokeOpacity="0.9" />
          <ellipse className="mo-mer mo-mer-a" cx="20" cy="20" rx="3.4" ry="7.6" strokeOpacity="0.7" />
          <ellipse className="mo-mer mo-mer-b" cx="20" cy="20" rx="6" ry="7.6" strokeOpacity="0.45" />
          <path d="M12.4 20H27.6M13.6 16.2H26.4M13.6 23.8H26.4" strokeOpacity="0.55" />
        </g>
      </svg>
    </span>
  )
}
