import { Check, Copy, Mail, Phone, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Decrypt, Title } from '../components/Decrypt'
import { contact } from '../content'
import { levelAt, planSpeech, shownCount, sliceChars, CPS, type SpeechPlan } from '../hero/speech'
import { useFx } from '../lib/fx'
import { JarvisOrb } from '../orb/JarvisOrb'

const C = contact

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

function ContactRow({ icon: Icon, href, text, value, id }: { icon: LucideIcon; href: string; text: string; value: string; id: string }) {
  const [copied, setCopied] = useState(false)
  const t = useRef(0)
  const onCopy = async () => {
    const ok = await copyText(value)
    if (!ok) return
    setCopied(true)
    window.clearTimeout(t.current)
    t.current = window.setTimeout(() => setCopied(false), 1800)
  }
  useEffect(() => () => window.clearTimeout(t.current), [])
  return (
    <div className="contact-row" data-testid={`contact-${id}`}>
      <a className="contact-link" href={href}>
        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        <span>{text}</span>
      </a>
      <button type="button" className="btn-ghost contact-copy" onClick={onCopy} data-copied={copied} data-testid={`copy-${id}`}>
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        <span aria-live="polite">{copied ? C.copied : C.copy}</span>
      </button>
    </div>
  )
}

/** 最後一屏：小光球（開場那顆的縮小版）進入視窗時說一次「謝謝你看到這裡。」 */
function Outro() {
  const fx = useFx()
  const isStatic = fx.level === 'static'
  const ref = useRef<HTMLDivElement>(null)
  const typed = useRef<HTMLSpanElement>(null)
  const plan = useRef<{ p: SpeechPlan; start: number } | null>(null)
  const [state, setState] = useState<'standby' | 'speaking'>('standby')
  const [done, setDone] = useState(isStatic)

  useEffect(() => {
    if (isStatic) {
      if (typed.current) typed.current.textContent = C.thanks
      return
    }
    const el = ref.current
    if (!el) return
    let raf = 0
    let tm = 0
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return
        io.disconnect()
        const p = planSpeech(C.thanks, CPS)
        plan.current = { p, start: performance.now() }
        setState('speaking')
        const finish = () => {
          if (typed.current) typed.current.textContent = C.thanks
          setDone(true)
          tm = window.setTimeout(() => setState('standby'), 1200)
        }
        const tick = (now: number) => {
          const sp = plan.current
          if (!sp) return
          const dt = (now - sp.start) / 1000
          if (dt >= sp.p.end) {
            finish()
            return
          }
          if (typed.current) typed.current.textContent = sliceChars(C.thanks, shownCount(sp.p, dt))
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        // 保底：rAF 不跑（極端省電）也要講完
        window.setTimeout(() => {
          if (!typed.current || typed.current.textContent !== C.thanks) finish()
        }, p.end * 1000 + 600)
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(tm)
    }
  }, [isStatic])

  const getLevel = useCallback(() => {
    const sp = plan.current
    return sp ? levelAt(sp.p, (performance.now() - sp.start) / 1000) : 0
  }, [])
  const getLit = useCallback(() => null, [])

  return (
    <div className="outro" ref={ref} data-testid="outro" data-done={done}>
      <div className="outro-orb">
        <JarvisOrb state={state} frozen={false} getLevel={getLevel} getLit={getLit} holo={false} testId="outro-orb" />
      </div>
      <p className="outro-line" data-testid="outro-line">
        <span className="subtitle-prompt-inline" aria-hidden="true">
          &gt;
        </span>
        <span ref={typed} />
        {done ? null : <span className="cursor" data-typing="true" aria-hidden="true" />}
      </p>
    </div>
  )
}

/** 04 / 聯絡（spec-phase2.md §3）：做事的習慣、AI 工具說明、聯絡方式（可複製）、最後一屏、頁尾 */
export function Contact() {
  return (
    <section id="contact" className="chapter chapter--contact" data-chapter="contact">
      <div className="wrap">
        <p className="chapter-label mono-tag">
          <Decrypt text={C.label} mono />
        </p>
        <Title lines={[C.habitsTitle]} as="h3" className="h-display h3" />
        <ol className="habits" data-testid="habits">
          {C.habits.map((h, i) => (
            <li key={i} className="habit">
              <span className="habit-num" aria-hidden="true">
                0{i + 1}
              </span>
              <p>{h}</p>
            </li>
          ))}
        </ol>
        <p className="ai-note" data-testid="ai-note">
          {C.note}
        </p>
        <div className="contact-rows">
          <ContactRow icon={Mail} href={`mailto:${C.email}`} text={C.email} value={C.email} id="email" />
          <ContactRow icon={Phone} href={`tel:${C.phone.tel}`} text={C.phone.label} value={C.phone.label} id="phone" />
        </div>
        <Outro />
        <p className="site-footer" data-testid="site-footer">
          {C.footer}
        </p>
      </div>
    </section>
  )
}
