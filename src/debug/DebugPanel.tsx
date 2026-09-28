import { useEffect, useState } from 'react'
import { dprCap, useFx } from '../lib/fx'
import { useErrorLog } from '../lib/errors'

/**
 * ?debug=1 才載入的檢查面板（左下角）。主人手機上「特效不見」時，截這個面板給我就知道是哪一級、為什麼。
 * 沒帶參數時這個檔根本不會下載，DOM 裡也沒有。
 */
export default function DebugPanel() {
  const fx = useFx()
  const errs = useErrorLog()
  const [, force] = useState(0)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const on = () => force((n) => n + 1)
    window.addEventListener('resize', on)
    const id = window.setInterval(on, 1000) // fps 量完、狀態改了都會反映
    return () => {
      window.removeEventListener('resize', on)
      window.clearInterval(id)
    }
  }, [])

  const html = document.documentElement
  const nav = navigator as Navigator & { deviceMemory?: number }
  const rows: [string, string][] = [
    ['fx', fx.level],
    ['reason', fx.reason],
    ['motion', html.dataset.motion ?? fx.motion],
    ['lowPower', fx.lowPower ? 'yes' : 'no'],
    ['fps', html.dataset.fps ?? '(measuring)'],
    ['DPR', `${window.devicePixelRatio} → canvas ≤${dprCap(fx.level, fx.lowPower)}`],
    ['viewport', `${window.innerWidth}×${window.innerHeight}`],
    ['cores', String(navigator.hardwareConcurrency ?? '?')],
    ['memory', nav.deviceMemory != null ? `${nav.deviceMemory} GB` : 'n/a'],
    ['boot', html.dataset.boot ?? '?'],
    ['UA', navigator.userAgent],
  ]

  if (!open) {
    return (
      <button type="button" className="debug-fab" onClick={() => setOpen(true)} data-testid="debug-panel">
        DEBUG
      </button>
    )
  }
  return (
    <aside className="debug-panel" data-testid="debug-panel" aria-label="debug">
      <div className="debug-head">
        <span>DEBUG</span>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} data-k={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div data-k="errors">
          <dt>errors</dt>
          <dd>
            {errs.length === 0
              ? 'none'
              : errs.map((e, i) => (
                  <span key={i} className="debug-err">
                    [{e.at}] {e.type}: {e.msg}
                  </span>
                ))}
          </dd>
        </div>
      </dl>
    </aside>
  )
}
