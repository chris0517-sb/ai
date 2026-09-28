import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Decrypt } from '../components/Decrypt'
import { Corners } from '../components/hud/Corners'
import { hero, profile, type OrbState, type Question } from '../content'
import { shocks } from '../fx/shock'
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
const STATE_TOKEN: Record<OrbState, string> = { standby: '--standby', thinking: '--think', speaking: '--speak' }

/** 思考多久才開口（規格：約 0.6 秒） */
const THINK_MS = 600

type Spoken = { text: string; q?: Question }

export function Hero() {
  const fx = useFx()
  const tune = useTune()
  const boot = useBootPhase()
  const isStatic = fx.level === 'static'
  const [orbState, setOrbState] = useState<OrbState>('standby')
  const orbStateRef = useRef<OrbState>('standby')
  orbStateRef.current = orbState
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thinkingQ, setThinkingQ] = useState<string | null>(null)
  const [spoken, setSpoken] = useState<Spoken | null>(null)
  const [typedDone, setTypedDone] = useState(false)
  const typedRef = useRef<HTMLSpanElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
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

  /**
   * 點一下光球＝打斷她說話（JARVIS 本尊：點球體寫 interrupt.json，agent 的打斷偵測器收到就停；jarvis_ui.py:74）。
   * 字幕停在打到的那個字、光球閃兩圈環（CoreHit，jarvis_mouse_fx.py:249）、回待命。沒在講話時點＝只閃環。
   */
  const interrupt = useCallback(() => {
    const el = document.querySelector<HTMLElement>('[data-testid=orb]')
    if (el) {
      const r = el.getBoundingClientRect()
      shocks.coreHit(r.left + r.width / 2, r.top + r.height / 2, r.width / 840, STATE_TOKEN[orbStateRef.current])
    }
    if (orbStateRef.current === 'standby') return
    clearAll()
    setThinkingQ(null)
    setTypedDone(true)
    setOrbState('standby')
  }, [clearAll])

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
    if (isStatic) return
    // 保險：平滑捲動途中若上面有東西長高（進場動畫），停下來後補一次對齊。
    // 用 setInterval 看捲動停了沒（Safari 舊版沒有 scrollend）；使用者自己捲走了就不管。
    let last = -1
    let still = 0
    let n = 0
    const iv = window.setInterval(() => {
      n++
      const y = window.scrollY
      still = y === last ? still + 1 : 0
      last = y
      if (still < 2 && n < 30) return
      window.clearInterval(iv)
      const want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
      const off = el.getBoundingClientRect().top - want
      if (Math.abs(off) > 2 && Math.abs(off) < 240) window.scrollBy({ top: off, behavior: 'auto' })
    }, 120)
  }

  // 字幕框高度＝「現在要講的那一整段」的高度：開口那一刻就平滑長到位，打字時不再跳；
  // 短句就是短框，不留一大片空（2026-09-28 修正輪 P5）。思考中維持上一段的高度。
  useLayoutEffect(() => {
    const box = boxRef.current
    const sizer = sizerRef.current
    if (!box || !sizer) return
    let first = true
    const apply = () => {
      const h = sizer.offsetHeight
      if (first) {
        box.style.transition = 'none'
        box.style.height = `${h}px`
        void box.offsetHeight
        box.style.transition = ''
        first = false
      } else {
        box.style.height = `${h}px`
      }
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(sizer)
    return () => ro.disconnect()
  }, [])

  // 字幕框長高／縮短會讓整個開場變高變矮 → 下面導覽區（GSAP 釘住）的起訖點要重算，不然釘住時會跳一下
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    let last = el.offsetHeight
    let t = 0
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight
      if (h === last) return
      last = h
      window.clearTimeout(t)
      t = window.setTimeout(() => ScrollTrigger.refresh(), 360)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [])

  const bootSettled = boot === 'done' || boot === 'off'
  const link = spoken?.q && 'link' in spoken.q ? spoken.q.link : null
  const target = spoken ?? { text: hero.intro }
  const targetLink = target.q && 'link' in target.q ? target.q.link.label : null

  return (
    <section id="top" ref={sectionRef} className="hero" data-testid="hero" style={{ '--state': STATE_VAR[orbState] } as CSSProperties}>
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
        <JarvisOrb state={orbState} frozen={boot === 'running'} getLevel={getLevel} getLit={getLit} onTap={interrupt} />
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
          </div>
          <div className="subtitle-body">
            <span className="subtitle-prompt" aria-hidden="true">
              &gt;
            </span>
            <div className="subtitle-box" ref={boxRef} data-testid="subtitle-box">
            <div className="subtitle-grid">
              <div className="subtitle-sizer" aria-hidden="true" ref={sizerRef}>
                <p className="subtitle-text">{target.text}</p>
                {targetLink ? (
                  <span className="subtitle-link-slot">
                    <span className="subtitle-link">
                      {targetLink}
                      <ArrowDown size={16} />
                    </span>
                  </span>
                ) : null}
              </div>
              <div>
                <p className="subtitle-text" data-thinking="true" hidden={!thinkingQ}>
                  {thinkingQ}
                  <span className="thinking-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </p>
                <p className="subtitle-text" data-testid="subtitle" data-measure="subtitle" hidden={!!thinkingQ}>
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
              <span>
                {'wrapAt' in q ? (
                  <>
                    {q.q.slice(0, q.wrapAt)}
                    <wbr />
                    {q.q.slice(q.wrapAt)}
                  </>
                ) : (
                  q.q
                )}
              </span>
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
