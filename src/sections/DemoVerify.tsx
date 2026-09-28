import { CornerDownRight, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Title } from '../components/Decrypt'
import { Corners } from '../components/hud/Corners'
import { Story } from '../components/Story'
import { jarvis } from '../content'
import { useFx } from '../lib/fx'
import { useTune } from '../lib/tune'

const B = jarvis.demoB
type StateId = (typeof B.states)[number]['id']
const byId = Object.fromEntries(B.states.map((s) => [s.id, s])) as Record<StateId, (typeof B.states)[number]>
const chipVar = (id: StateId) => ({ '--chip-c': `var(--${byId[id].color})` }) as CSSProperties

/** 結果晶片依序閃過四態、最後停在 UNVERIFIED（「指令沒報錯」不等於「做到了」） */
const SEQUENCE: StateId[] = ['CONFIRMED', 'UNVERIFIED', 'FAILED', 'NEEDS-USER', 'UNVERIFIED']

/** 示範 B：它說「好了」，不代表真的好了（四態） */
export function DemoVerify() {
  const fx = useFx()
  const tune = useTune()
  const isStatic = fx.level === 'static'
  const final = B.final as StateId
  const [result, setResult] = useState<StateId | null>(isStatic ? final : null)
  const [settled, setSettled] = useState(isStatic)
  const [selected, setSelected] = useState<StateId>(final)
  const timers = useRef<number[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const ran = useRef(false)

  const run = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setSettled(false)
    if (isStatic) {
      setResult(final)
      setSettled(true)
      return
    }
    const step = 240 / tune.speed
    SEQUENCE.forEach((id, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setResult(id)
          if (i === SEQUENCE.length - 1) {
            setSettled(true)
            setSelected(final)
          }
        }, 260 + i * step),
      )
    })
  }, [isStatic, final, tune.speed])

  // 進入視窗自動跑一次
  useEffect(() => {
    if (isStatic) return
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !ran.current) {
          ran.current = true
          run()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isStatic, run])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const sel = byId[selected]

  return (
    <article id="demo-verify" className="demo demo-b" data-testid="demo-b" style={{ '--demo': 'var(--warn)' } as CSSProperties}>
      <header className="demo-head">
        <p className="demo-tag">
          <i className="demo-lamp" aria-hidden="true" />
          {B.tag}
        </p>
        <Title lines={B.title} as="h3" className="h-display h3" />
      </header>
      <div className="demo-stage" data-testid="demo-stage">
        <Corners className="demo-corners" />
        <div className="plate verify" ref={rootRef}>
          <div className="verify-cmd">
            <button type="button" className="verify-run" onClick={run} data-testid="verify-run">
              <Play size={14} aria-hidden="true" />
              <span className="mono">&gt;</span>
              {B.command}
            </button>
            <CornerDownRight size={18} className="verify-arrow" aria-hidden="true" />
            <span
              className="result-chip"
              data-testid="verify-result"
              data-state={result ?? ''}
              data-settled={settled}
              style={result ? chipVar(result) : undefined}
              aria-live="polite"
            >
              {result ? `${result}  ${byId[result].zh}` : '— — —'}
            </span>
          </div>
          <div className="states" role="group">
            {B.states.map((s) => (
              <button
                key={s.id}
                type="button"
                className="state-chip"
                data-on={selected === s.id}
                aria-pressed={selected === s.id}
                style={chipVar(s.id)}
                onClick={() => setSelected(s.id)}
                data-testid={`state-${s.id}`}
              >
                <span className="en">{s.id}</span>
                <span className="zh">{s.zh}</span>
              </button>
            ))}
          </div>
          <p className="state-desc" style={chipVar(selected)} data-testid="state-desc">
            {sel.desc}
          </p>
        </div>
      </div>
      <div className="demo-copy">
        <Story short={B.body.short} more={B.body.more} />
      </div>
    </article>
  )
}
