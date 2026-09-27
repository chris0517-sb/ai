import { ArrowDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Decrypt } from '../components/Decrypt'
import { Corners } from '../components/hud/Corners'
import { hero, profile, type OrbState, type Question } from '../content'
import { useBootPhase } from '../lib/boot'
import { useFx } from '../lib/fx'
import { useTune } from '../lib/tune'
import { JarvisOrb } from '../orb/JarvisOrb'
import { CPS, DONE_HOLD, levelAt, planSpeech, shownCount, sliceChars, type SpeechPlan } from './speech'

const STATE_VAR: Record<OrbState, string> = {
  standby: 'var(--standby)',
  thinking: 'var(--think)',
  speaking: 'var(--speak)',
}

/** 思考多久才開口（規格：約 0.6 秒） */
const THINK_MS = 600

type Spoken = { text: string; q?: Question }

/** 字幕條要預留的高度＝所有可能出現的字裡最高的那段（開場白＋四個答案），打字時版面才不會跳 */
const SIZERS: { text: string; link?: string }[] = [
  { text: hero.intro },
  ...hero.questions.map((q) => ({ text: q.a, link: 'link' in q ? q.link.label : undefined })),
]

export function Hero() {
  const fx = useFx()
  const tune = useTune()
  const boot = useBootPhase()
  const isStatic = fx.level === 'static'
  const [orbState, setOrbState] = useState<OrbState>('standby')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thinkingQ, setThinkingQ] = useState<string | null>(null)
  const [spoken, setSpoken] = useState<Spoken | null>(null)
  const [typedDone, setTypedDone] = useState(false)
  const typedRef = useRef<HTMLSpanElement>(null)
  const speechRef = useRef<{ plan: SpeechPlan; start: number } | null>(null)
  const rafRef = useRef(0)
  const timers = useRef<number[]>([])
  const speedRef = useRef(tune.speed)
  speedRef.current = tune.speed

  const clearAll = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    speechRef.current = null
  }, [])
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const setTyped = (s: string) => {
    if (typedRef.current) typedRef.current.textContent = s
  }

  /** 開口：打字機逐字＋光球切「說話」；講完保留 1.2 秒再回「待命」（JARVIS mark_done） */
  const speak = useCallback(
    (text: string, q?: Question) => {
      setThinkingQ(null)
      setSpoken({ text, q })
      setTypedDone(false)
      setOrbState('speaking')
      const plan = planSpeech(text, CPS * speedRef.current)
      speechRef.current = { plan, start: performance.now() }
      if (isStatic) {
        // static：不跑打字機，整段直接出現；狀態照樣 說話→待命（只換顏色，不是動畫）
        setTyped(text)
        setTypedDone(true)
        later(plan.end * 1000 + DONE_HOLD * 1000, () => setOrbState('standby'))
        return
      }
      setTyped('')
      const tick = (now: number) => {
        const sp = speechRef.current
        if (!sp) return
        const dt = (now - sp.start) / 1000
        if (dt >= sp.plan.end) {
          setTyped(text)
          setTypedDone(true)
          later(DONE_HOLD * 1000, () => setOrbState('standby'))
          rafRef.current = 0
          return
        }
        setTyped(sliceChars(text, shownCount(sp.plan, dt)))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [isStatic, later],
  )

  /** 點問題：光球切「思考」（紫，約 0.6 秒）→「說話」＋字幕 → 講完回「待命」；講到一半點別顆＝打斷換講新的 */
  const ask = useCallback(
    (q: Question) => {
      clearAll()
      setActiveId(q.id)
      setSpoken(null)
      setTypedDone(false)
      setTyped('')
      setThinkingQ(q.q)
      setOrbState('thinking')
      later(THINK_MS / speedRef.current, () => speak(q.a, q))
    },
    [clearAll, later, speak],
  )

  // 開機播完（或這次不播）→ JARVIS 講開場白（JARVIS 本尊也是等開機動畫播完才說問候語）
  const introDone = useRef(false)
  useEffect(() => {
    if (introDone.current || boot === 'running' || boot === 'core') return
    introDone.current = true
    if (isStatic) {
      setSpoken({ text: hero.intro })
      setTyped(hero.intro)
      setTypedDone(true)
      return
    }
    later(350, () => speak(hero.intro))
  }, [boot, isStatic, later, speak])

  useEffect(() => clearAll, [clearAll])

  const getLevel = useCallback(() => {
    const sp = speechRef.current
    return sp ? levelAt(sp.plan, (performance.now() - sp.start) / 1000) : 0
  }, [])
  const getLit = useCallback(() => {
    const sp = speechRef.current
    if (!sp || !sp.plan.end) return null
    const p = Math.min(1, (performance.now() - sp.start) / 1000 / sp.plan.end)
    return Math.round(p * 72)
  }, [])

  const goTo = (id: string) => (e: MouseEvent) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: isStatic ? 'auto' : 'smooth', block: 'start' })
  }

  const bootSettled = boot === 'done' || boot === 'off'
  const link = spoken?.q && 'link' in spoken.q ? spoken.q.link : null

  return (
    <section id="top" className="hero" data-testid="hero" style={{ '--state': STATE_VAR[orbState] } as CSSProperties}>
      <Corners holo />

      <div className="hero-top">
        <div data-holo="hud" data-holo-order="1">
          <p className="hud-label">
            <Decrypt text={hero.hudLabel} mono enabled={bootSettled} />
          </p>
          <p className="hud-status" data-testid="status">
            {hero.status[orbState]}
          </p>
        </div>
      </div>

      <div className="hero-orb">
        <JarvisOrb state={orbState} frozen={boot === 'running'} getLevel={getLevel} getLit={getLit} />
      </div>

      <div className="hero-copy">
        <h1 className="hero-name" data-holo="name" data-holo-order="0" data-testid="name">
          {profile.name}
        </h1>
        <p className="hero-sub" data-holo="sub" data-holo-order="2">
          {profile.sub}
        </p>

        <div className="plate subtitle" data-holo="subtitle" data-holo-order="3" data-speaking={orbState === 'speaking'}>
          <span className="subtitle-lamp" aria-hidden="true" />
          <div className="subtitle-head" aria-hidden="true">
            <span>{hero.subtitleHead}</span>
            <span className="subtitle-live">{hero.subtitleLive}</span>
          </div>
          <div className="subtitle-body">
            <span className="subtitle-prompt" aria-hidden="true">
              &gt;
            </span>
            <div className="subtitle-grid">
              {SIZERS.map((s, i) => (
                <div key={i} className="subtitle-sizer" aria-hidden="true" data-sizer={i}>
                  <p className="subtitle-text" data-measure="subtitle">
                    {s.text}
                  </p>
                  {s.link ? (
                    <span className="subtitle-link-slot">
                      <span className="subtitle-link">
                        {s.link}
                        <ArrowDown size={16} />
                      </span>
                    </span>
                  ) : null}
                </div>
              ))}
              <div>
                <p className="subtitle-text" data-thinking="true" hidden={!thinkingQ}>
                  {thinkingQ}
                  <span className="thinking-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </p>
                <p className="subtitle-text" data-testid="subtitle" hidden={!!thinkingQ}>
                  <span ref={typedRef} />
                  {isStatic ? null : <span className="cursor" data-typing={!typedDone} aria-hidden="true" />}
                </p>
                {link && typedDone ? (
                  <span className="subtitle-link-slot">
                    <a className="subtitle-link" href={`#${link.target}`} onClick={goTo(link.target)} data-testid="subtitle-link">
                      {link.label}
                      <ArrowDown size={16} aria-hidden="true" />
                    </a>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {spoken?.text ?? ''}
          </p>
        </div>

        <div className="chips" data-holo="chips" data-holo-order="4">
          {hero.questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              className="chip"
              data-active={activeId === q.id}
              data-q={q.id}
              onClick={() => ask(q)}
            >
              <span className="chip-idx">0{i + 1}</span>
              <span>{q.q}</span>
            </button>
          ))}
        </div>
      </div>

      <a className="scroll-hint" href="#jarvis" onClick={goTo('jarvis')} data-holo="scroll" data-holo-order="5">
        <span className="scroll-hint-line" aria-hidden="true" />
        <span>{hero.scrollHint}</span>
      </a>
    </section>
  )
}
