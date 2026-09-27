import { useEffect, useState } from 'react'
import { chapters } from '../content'

/**
 * 章節導覽點（桌機右側）。照 content.ts 的 chapters 畫：ready=false 的章節（第二期）先留位、不能點。
 * 第二期只要把 chapters 的 ready 改 true、補上 section[data-chapter] 就接上了。
 */
export function ChapterNav() {
  const [active, setActive] = useState<string>('top')

  useEffect(() => {
    const els = chapters
      .filter((c) => c.ready)
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => !!el)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <nav className="chapter-nav" data-holo="nav" data-holo-order="6" aria-label="chapters">
      {chapters.map((c) =>
        c.ready ? (
          <a key={c.id} href={`#${c.id}`} data-on={active === c.id} aria-current={active === c.id ? 'true' : undefined}>
            <span className="nav-label">{c.label}</span>
            {c.num}
          </a>
        ) : (
          <span key={c.id} aria-disabled="true">
            <span className="nav-label">{c.label}</span>
            {c.num}
          </span>
        ),
      )}
    </nav>
  )
}
