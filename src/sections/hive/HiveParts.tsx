import { Check, Lock, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Title } from '../../components/Decrypt'
import { Corners } from '../../components/hud/Corners'
import { NumberTicker } from '../../components/magicui/number-ticker'
import { Story } from '../../components/Story'
import { hive, jarvis } from '../../content'
import { useFx } from '../../lib/fx'
import { pulseMini, setMiniBase } from '../../lib/miniOrb'

const base = import.meta.env.BASE_URL
const fmt = (n: number) => Intl.NumberFormat('en-US').format(n)

/** 進入視窗一次就記住（給「進場才動」的東西用） */
function useSeen<T extends Element>(threshold = 0.35) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setSeen(true)
        io.disconnect()
      }
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, threshold])
  return [ref, seen] as const
}

// ─────────────────────────── 1.2 實際跑出來的紀錄 ───────────────────────────
export function HiveRecord() {
  const fx = useFx()
  const R = hive.record
  const num = (v: number, cls: string) => (fx.level === 'static' ? <span className={cls}>{fmt(v)}</span> : <NumberTicker value={v} className={cls} />)
  return (
    <div className="hive-record" data-testid="hive-record">
      <div className="hive-record-head">
        <p className="mono-tag">{R.title}</p>
        <p className="hive-period" data-testid="hive-period">
          {R.period}
        </p>
      </div>
      <div className="hive-record-main">
        <p className="hive-big">
          {num(R.main.value, 'text-accent')}
          <span className="hive-big-unit">{R.main.unit}</span>
        </p>
        <p className="hive-big-line">{R.main.line}</p>
      </div>
      <div className="hive-record-more">
        {R.more.map((m) => (
          <p key={m.unit} className="hive-small">
            <span className="hive-small-num">{num(m.value, 'text-text')}</span>
            <span className="hive-small-unit">{m.unit}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────── 1.3 真實畫面（HUD 框＋掃描進場） ───────────────────────────
export function HiveScreen() {
  const S = hive.screen
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  return (
    <figure className="hive-screen" data-testid="hive-screen">
      <div className="hive-shot" ref={ref} data-in={seen}>
        <picture>
          <source srcSet={base + S.image.webp} type="image/webp" />
          <img src={base + S.image.jpg} width={S.image.w} height={S.image.h} alt={S.image.alt} loading="lazy" decoding="async" />
        </picture>
        <span className="hive-shot-scan" aria-hidden="true" />
        <Corners className="hive-shot-corners" />
      </div>
      <figcaption className="body">{S.caption}</figcaption>
    </figure>
  )
}

// ─────────────────────────── 1.4 三個故事的互動畫面 ───────────────────────────
function QABars() {
  const A = hive.storyA
  const [ref, seen] = useSeen<HTMLDivElement>(0.4)
  const [sel, setSel] = useState<'before' | 'after' | null>(null)
  const bars = [
    { key: 'before' as const, ...A.before },
    { key: 'after' as const, ...A.after },
  ]
  return (
    <div className="plate qa-bars" ref={ref} data-in={seen} data-sel={sel ?? ''} data-testid="qa-bars">
      {bars.map((b) => (
        <div key={b.key} className="qa-row">
          <button type="button" className="qa-bar" data-which={b.key} data-on={sel === b.key} aria-pressed={sel === b.key} onClick={() => setSel((s) => (s === b.key ? null : b.key))}>
            <span className="qa-bar-label">
              {b.label} {b.value}%
            </span>
            <span className="qa-track" aria-hidden="true">
              <i style={{ '--v': `${b.value}%` } as CSSProperties} />
            </span>
          </button>
          {b.key === 'before' ? <p className="qa-note">{A.note}</p> : null}
        </div>
      ))}
    </div>
  )
}

function BudgetMeter() {
  const B = hive.storyB
  const fx = useFx()
  const isStatic = fx.level === 'static'
  const [ref, seen] = useSeen<HTMLDivElement>(0.45)
  const [run, setRun] = useState(0)
  const [n1, setN1] = useState(isStatic ? B.repeats : 0) // 同一批檔案送審次數
  const [n2, setN2] = useState(isStatic ? B.cap : 0) // 新規則下叫醒次數
  const [phase, setPhase] = useState<'idle' | 'burn' | 'stop' | 'rule' | 'safe'>(isStatic ? 'safe' : 'idle')
  const timers = useRef<number[]>([])

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const play = useCallback(() => {
    clear()
    setN1(0)
    setN2(0)
    setPhase('burn')
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
    for (let i = 1; i <= B.repeats; i++) at(i * 170, () => setN1(i))
    at(B.repeats * 170 + 120, () => {
      setPhase('stop')
      pulseMini('alert', 650)
    })
    const t2 = B.repeats * 170 + 1300
    at(t2, () => setPhase('rule'))
    for (let i = 1; i <= B.cap; i++) at(t2 + i * 150, () => setN2(i))
    at(t2 + B.cap * 150 + 200, () => setPhase('safe'))
  }, [B.repeats, B.cap])

  useEffect(() => {
    if (seen && !isStatic) play()
  }, [seen, run, isStatic, play])
  useEffect(() => clear, [])

  // 計量條：舊做法＝16 次把它燒到頂；新規則＝12 次就被擋住，停在安全區
  const level = phase === 'rule' || phase === 'safe' ? Math.min(34, 10 + n2 * 2) : (n1 / B.repeats) * 100
  return (
    <div className="plate budget" ref={ref} data-phase={phase} data-testid="budget">
      <div className="budget-head">
        <span className="budget-label">{B.meter}</span>
        {phase === 'stop' ? <span className="budget-stop">{B.stop}</span> : null}
      </div>
      <div className="budget-meter" aria-hidden="true">
        <i style={{ width: `${level}%` }} />
        <span className="budget-safe" />
      </div>
      <div className="budget-row" data-testid="budget-repeats" data-n={n1} aria-hidden="true">
        {Array.from({ length: B.repeats }, (_, i) => (
          <i key={i} data-on={i < n1} />
        ))}
        <b className="budget-count">{n1}</b>
      </div>
      <div className="budget-rule" data-show={phase === 'rule' || phase === 'safe'}>
        <p className="budget-rule-text">{B.rule}</p>
        <div className="budget-row budget-row--cap" data-testid="budget-cap" data-n={n2} aria-hidden="true">
          {Array.from({ length: B.cap }, (_, i) => (
            <i key={i} data-on={i < n2} />
          ))}
          {phase === 'safe' ? <Lock size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
          <b className="budget-count">{n2}</b>
        </div>
      </div>
      {isStatic ? null : (
        <button type="button" className="btn-ghost budget-replay" onClick={() => setRun((r) => r + 1)} data-testid="budget-replay">
          <RotateCcw size={16} aria-hidden="true" />
          {jarvis.demoA.replay}
        </button>
      )}
    </div>
  )
}

function RedTeam() {
  const C = hive.storyC
  const fx = useFx()
  const isStatic = fx.level === 'static'
  const [ref, seen] = useSeen<HTMLDivElement>(0.45)
  const [run, setRun] = useState(0)
  const [shown, setShown] = useState(isStatic ? C.rounds.length + 1 : 0)
  const [struck, setStruck] = useState(isStatic ? C.rounds.length : 0)
  const timers = useRef<number[]>([])
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const play = useCallback(() => {
    clear()
    setShown(0)
    setStruck(0)
    setMiniBase('thinking')
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
    C.rounds.forEach((_, i) => {
      at(300 + i * 1100, () => setShown(i + 1))
      at(300 + i * 1100 + 600, () => {
        setStruck(i + 1)
        pulseMini('alert', 500)
      })
    })
    at(300 + C.rounds.length * 1100 + 200, () => {
      setShown(C.rounds.length + 1)
      setMiniBase('standby')
    })
  }, [C.rounds])
  useEffect(() => {
    if (seen && !isStatic) play()
  }, [seen, run, isStatic, play])
  useEffect(
    () => () => {
      clear()
      setMiniBase('standby')
    },
    [],
  )
  return (
    <div className="redteam" ref={ref} data-testid="redteam" data-shown={shown} data-struck={struck}>
      <div className="plate term redteam-term">
        <div className="redteam-dots" aria-hidden="true">
          <i className="bg-alert" />
          <i className="bg-warn" />
          <i className="bg-speak" />
        </div>
        <ol className="redteam-lines">
          {C.rounds.map((r, i) => (
            <li key={i} className="redteam-line" data-on={i < shown} data-struck={i < struck}>
              <span>{r}</span>
            </li>
          ))}
          <li className="redteam-line redteam-fix" data-on={shown > C.rounds.length}>
            <Check size={15} strokeWidth={2.4} aria-hidden="true" />
            <span>{C.fix}</span>
          </li>
        </ol>
      </div>
      {isStatic ? null : (
        <button type="button" className="btn-ghost" onClick={() => setRun((r) => r + 1)} data-testid="redteam-replay">
          <RotateCcw size={16} aria-hidden="true" />
          {jarvis.demoA.replay}
        </button>
      )}
    </div>
  )
}

/** 三個故事：沿用示範區版型（段標＋標題 → 互動畫面 → short ≤3 行＋「看完整經過」） */
export function HiveStories() {
  const items = [
    { key: 'a', S: hive.storyA, color: 'var(--warn)', stage: <QABars /> },
    { key: 'b', S: hive.storyB, color: 'var(--alert)', stage: <BudgetMeter /> },
    { key: 'c', S: hive.storyC, color: 'var(--think)', stage: <RedTeam /> },
  ]
  return (
    <>
      {items.map(({ key, S, color, stage }) => (
        <article key={key} id={`hive-${key}`} className={`demo hive-story hive-${key}`} data-testid={`hive-${key}`} style={{ '--demo': color } as CSSProperties}>
          <header className="demo-head">
            <p className="demo-tag">
              <i className="demo-lamp" aria-hidden="true" />
              {S.tag}
            </p>
            <Title lines={S.title} as="h3" className="h-display h3" />
          </header>
          <div className="demo-stage" data-testid="demo-stage">
            <Corners className="demo-corners" />
            {stage}
          </div>
          <div className="demo-copy">
            <Story short={S.story.short} more={S.story.more} />
          </div>
        </article>
      ))}
    </>
  )
}
