import { useEffect, useState } from 'react'
import { chapters } from '../content'
import { MiniOrb } from './MiniOrb'

/**
 * 頂部章節導覽列（開場那一屏時收起來，往下滑才滑出）。
 * 左邊是迷你光球——開場的 JARVIS 跟著往下走，示範區發生什麼它就變什麼色（見 lib/miniOrb.ts）。
 * 右邊是章節：照 content.ts 的 chapters 畫，ready=false（第二期）先留位、不能點。
 */
export function TopBar() {
  const [show, setShow] = useState(false)
  const [active, setActive] = useState<string>('top')

  useEffect(() => {
    const hero = document.getElementById('top')
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        setShow(!e.isIntersecting || e.intersectionRatio < 0.25)
      },
      { threshold: [0, 0.25, 0.5] },
    )
    if (hero) io.observe(hero)
    const els = chapters
      .filter((c) => c.ready)
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => !!el)
    const io2 = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io2.observe(el))
    return () => {
      io.disconnect()
      io2.disconnect()
    }
  }, [])

  return (
    <header className="topbar" data-show={show} data-testid="topbar">
      <a className="topbar-id" href="#top" aria-label="J.A.R.V.I.S">
        <MiniOrb />
        <span className="topbar-label">{chapters[0].label}</span>
      </a>
      <nav className="topbar-nav" aria-label="chapters">
        {chapters
          .filter((c) => c.id !== 'top')
          .map((c) =>
            c.ready ? (
              <a key={c.id} href={`#${c.id}`} data-on={active === c.id} aria-current={active === c.id ? 'true' : undefined}>
                <b>{c.num}</b>
                {c.label}
              </a>
            ) : (
              <span key={c.id} aria-disabled="true">
                <b>{c.num}</b>
                {c.label}
              </span>
            ),
          )}
      </nav>
    </header>
  )
}
