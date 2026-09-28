import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Film, Mic, PenLine, Search, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Decrypt, Title } from '../components/Decrypt'
import { works } from '../content'
import { useFx } from '../lib/fx'

const base = import.meta.env.BASE_URL
const W = works
type Card = (typeof W.cards)[number]

function Pic({ name, alt, w, h, className }: { name: string; alt: string; w: number; h: number; className?: string }) {
  return (
    <picture className={className}>
      <source srcSet={`${base}img/works/${name}.webp`} type="image/webp" />
      <img src={`${base}img/works/${name}.jpg`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
    </picture>
  )
}

/** 76 顆小點的矩陣，16 顆亮 --warn：76 個錯裡「說做好了，其實沒有」16 次（手刻幾何） */
const LIT = new Set([3, 8, 13, 17, 22, 26, 31, 35, 40, 44, 49, 53, 58, 63, 67, 72])
function DotMatrix() {
  return (
    <div className="viz-matrix" aria-hidden="true">
      {Array.from({ length: 76 }, (_, i) => (
        <i key={i} data-on={LIT.has(i)} style={{ animationDelay: `${(i % 19) * 40}ms` }} />
      ))}
    </div>
  )
}

const STEP_ICONS = [Search, PenLine, Mic, Film, Upload]
function Pipeline({ steps, gate }: { steps: readonly string[]; gate: string }) {
  return (
    <div className="viz-pipe" aria-hidden="true">
      <div className="viz-pipe-row">
        {steps.map((s, i) => {
          const Icon = STEP_ICONS[i] ?? Search
          return (
            <span key={s} className="viz-pipe-step" data-last={i === steps.length - 1}>
              {i === steps.length - 1 ? <span className="viz-gate" /> : null}
              <span className="viz-pipe-box">
                <Icon size={14} strokeWidth={1.8} />
                {s}
              </span>
            </span>
          )
        })}
      </div>
      <p className="viz-gate-label">{gate}</p>
    </div>
  )
}

function OcrPanel({ ocr }: { ocr: NonNullable<Card['ocr']> }) {
  return (
    <div className="viz-ocr" aria-hidden="true">
      <p className="viz-ocr-head">{ocr.head}</p>
      <div className="viz-ocr-tile">
        <i className="viz-ocr-glyphs" />
        <i className="viz-ocr-scan" />
      </div>
      <p className="viz-ocr-row">
        <span className="viz-ocr-bad">{ocr.bad}</span>
        <ArrowRight size={14} strokeWidth={2} />
        <span className="viz-ocr-drop">{ocr.drop}</span>
      </p>
    </div>
  )
}

function Visual({ c }: { c: Card }): ReactNode {
  switch (c.id) {
    case 'rules':
      return <DotMatrix />
    case 'youtube':
      return c.steps && c.gate ? <Pipeline steps={c.steps} gate={c.gate} /> : null
    case 'manga':
      return (
        <div className="viz-collage viz-collage--manga">
          {W.images.manga.map((n, i) => (
            <Pic key={n} name={n} alt={`${c.title} ${i + 1}`} w={520} h={292} />
          ))}
        </div>
      )
    case 'stock':
      return c.ocr ? <OcrPanel ocr={c.ocr} /> : null
    case 'wdd':
      return (
        <div className="viz-collage viz-collage--wdd">
          <Pic name="wdd-banner" alt={c.title} w={900} h={255} />
          <Pic name="wdd-line" alt={c.title} w={560} h={747} />
          <Pic name="wdd-card" alt={c.title} w={460} h={460} />
        </div>
      )
    case 'azzeto':
      return (
        <div className="viz-phones">
          {W.images.azzeto.map((n, i) => (
            <Pic key={n} name={n} alt={`${c.title} ${i + 1}`} w={430} h={934} />
          ))}
        </div>
      )
    case 'odyquill':
      return (
        <div className="viz-phones">
          {W.images.odyquill.map((n, i) => (
            <Pic key={n} name={n} alt={`${c.title} ${i + 1}`} w={390} h={844} />
          ))}
        </div>
      )
    default:
      return null
  }
}

/**
 * 03 / 其他作品（帶過）。手機：橫向滑動卡片（scroll-snap，卡寬約 82vw、露出下一張的邊），左右小箭頭＋「1 / 7」；
 * 桌機：不等寬格子（有跨欄）。卡片高度照內容；外部連結開新分頁。
 */
export function Works() {
  const fx = useFx()
  const trackRef = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const n = W.cards.length

  const step = useCallback(() => {
    const t = trackRef.current
    const first = t?.querySelector<HTMLElement>('.work-card')
    if (!t || !first) return 0
    const gap = parseFloat(getComputedStyle(t).columnGap || '12') || 12
    return first.offsetWidth + gap
  }, [])

  useEffect(() => {
    const t = trackRef.current
    if (!t) return
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const s = step()
        if (s) setIdx(Math.max(0, Math.min(n - 1, Math.round(t.scrollLeft / s))))
      })
    }
    t.addEventListener('scroll', on, { passive: true })
    // rAF 不跑（極端省電）時也要更新頁碼
    const onEnd = () => {
      const s = step()
      if (s) setIdx(Math.max(0, Math.min(n - 1, Math.round(t.scrollLeft / s))))
    }
    t.addEventListener('scrollend', onEnd)
    return () => {
      t.removeEventListener('scroll', on)
      t.removeEventListener('scrollend', onEnd)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [n, step])

  const go = (d: number) => {
    const t = trackRef.current
    if (!t) return
    const smooth = fx.motion !== 'reduced' && fx.level !== 'static'
    t.scrollTo({ left: Math.max(0, (idx + d) * step()), behavior: smooth ? 'smooth' : 'auto' })
    setIdx((i) => Math.max(0, Math.min(n - 1, i + d)))
  }

  return (
    <section id="works" className="chapter" data-chapter="works">
      <div className="wrap">
        <p className="chapter-label mono-tag">
          <Decrypt text={W.label} mono />
        </p>
        <Title lines={[W.title]} as="h2" className="h-display h2" />
        <div className="works-nav" aria-hidden="false">
          <button type="button" className="works-arrow" onClick={() => go(-1)} disabled={idx === 0} aria-label="上一張" data-testid="works-prev">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="works-count" data-testid="works-count">
            {idx + 1} / {n}
          </span>
          <button type="button" className="works-arrow" onClick={() => go(1)} disabled={idx === n - 1} aria-label="下一張" data-testid="works-next">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="works-track" ref={trackRef} data-testid="works-track">
          {W.cards.map((c, i) => (
            <article key={c.id} className="plate work-card" data-card={c.id} data-i={i}>
              <div className="work-visual">
                <Visual c={c} />
              </div>
              <h3 className="work-title" data-measure="title">
                {c.title}
              </h3>
              <p className="work-text">{c.text}</p>
              {c.link ? (
                <a className="work-link" href={c.link.href} target="_blank" rel="noopener noreferrer">
                  {c.link.label}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
