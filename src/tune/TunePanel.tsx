import { Copy, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { TUNE_LIMITS, type AccentKey, type TitleFont } from '../config/tune'
import { resetTune, setTune, useTune } from '../lib/tune'

const ACCENTS: { key: AccentKey; label: string }[] = [
  { key: 'speak', label: '綠' },
  { key: 'active', label: '藍' },
  { key: 'think', label: '紫' },
]
const FONTS: { key: TitleFont; label: string }[] = [
  { key: 'serif', label: '宋體' },
  { key: 'sans', label: '黑體' },
]

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** 調整面板：網址加 ?tune 才會載入（只有主人用）。改了立刻生效、存 localStorage；「複製設定」輸出 JSON。 */
export default function TunePanel() {
  const t = useTune()
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const json = JSON.stringify(t, null, 2)

  const onCopy = async () => {
    const ok = await copyText(json)
    setCopied(ok ? 'ok' : 'fail')
    window.setTimeout(() => setCopied(null), 1800)
  }

  if (!open) {
    return (
      <button type="button" className="tune-fab" onClick={() => setOpen(true)} data-testid="tune-open" aria-label="打開調整面板">
        <SlidersHorizontal size={18} aria-hidden="true" />
      </button>
    )
  }

  return (
    <aside className="plate tune" data-testid="tune-panel" aria-label="調整面板">
      <div className="tune-head">
        <span className="mono-tag">TUNE</span>
        <button type="button" className="tune-x" onClick={() => setOpen(false)} aria-label="收合">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <label className="tune-row">
        <span>
          特效強度 <output>{t.intensity}%</output>
        </span>
        <input
          type="range"
          min={TUNE_LIMITS.intensity.min}
          max={TUNE_LIMITS.intensity.max}
          step={TUNE_LIMITS.intensity.step}
          value={t.intensity}
          onChange={(e) => setTune({ intensity: Number(e.target.value) })}
          data-testid="tune-intensity"
        />
      </label>

      <label className="tune-row">
        <span>
          動畫速度 <output>{t.speed.toFixed(2)}×</output>
        </span>
        <input
          type="range"
          min={TUNE_LIMITS.speed.min}
          max={TUNE_LIMITS.speed.max}
          step={TUNE_LIMITS.speed.step}
          value={t.speed}
          onChange={(e) => setTune({ speed: Number(e.target.value) })}
          data-testid="tune-speed"
        />
      </label>

      <div className="tune-row">
        <span>主強調色</span>
        <div className="tune-seg">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              data-on={t.accent === a.key}
              onClick={() => setTune({ accent: a.key })}
              style={{ '--sw': `var(--${a.key})` } as CSSProperties}
              data-testid={`tune-accent-${a.key}`}
            >
              <i className="tune-swatch" />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tune-row">
        <span>標題字體</span>
        <div className="tune-seg">
          {FONTS.map((f) => (
            <button key={f.key} type="button" data-on={t.titleFont === f.key} onClick={() => setTune({ titleFont: f.key })}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <label className="tune-check">
        <input type="checkbox" checked={t.scanlines} onChange={(e) => setTune({ scanlines: e.target.checked })} data-testid="tune-scan" />
        掃描線
      </label>
      <label className="tune-check">
        <input type="checkbox" checked={t.boot} onChange={(e) => setTune({ boot: e.target.checked })} />
        開機動畫（下次載入生效）
      </label>
      <label className="tune-check">
        <input type="checkbox" checked={t.bgInteractive} onChange={(e) => setTune({ bgInteractive: e.target.checked })} />
        背景互動（手機一律不跟手）
      </label>

      <div className="tune-actions">
        <button type="button" className="btn-ghost" onClick={onCopy} data-testid="tune-copy">
          <Copy size={14} aria-hidden="true" />
          {copied === 'ok' ? '已複製' : copied === 'fail' ? '複製失敗，請手動選取' : '複製設定'}
        </button>
        <button type="button" className="btn-ghost" onClick={resetTune}>
          <RotateCcw size={14} aria-hidden="true" />
          還原預設
        </button>
      </div>
      <pre className="tune-json" data-testid="tune-json">
        {json}
      </pre>
      <p className="tune-note">只在網址帶 ?tune 時套用；要變成正式預設，按「複製設定」把這段貼給 Claude。</p>
    </aside>
  )
}
