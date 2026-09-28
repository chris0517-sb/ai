import { Check, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Title } from '../components/Decrypt'
import { Corners } from '../components/hud/Corners'
import { AnimatedSpan, Terminal, TypingAnimation } from '../components/magicui/terminal'
import { Story } from '../components/Story'
import { jarvis } from '../content'
import { useFx } from '../lib/fx'
import { pulseMini, setMiniBase } from '../lib/miniOrb'

const A = jarvis.demoA
const ITEMS = A.lines.length * 3 // 每條：使用者的話、指令（打字）、判定

function Verdict({ l, i }: { l: (typeof A.lines)[number]; i: number }) {
  const block = l.verdict === 'block'
  return (
    <div className="term-verdict" data-verdict={l.verdict} data-idx={i}>
      {block ? <X size={16} strokeWidth={2.4} aria-hidden="true" /> : <Check size={16} strokeWidth={2.4} aria-hidden="true" />}
      <span className="term-verdict-text">{l.result}</span>
      {block ? <span className="stamp">{A.stamp}</span> : null}
    </div>
  )
}

/**
 * 示範 A：危險指令攔截（Magic UI Terminal，進入視窗自動播，有「重播」鈕）。
 * 三條指令一字不差取自 JARVIS 回歸測試 test_dangerous_commands.py:17,28,45（文字在 content.ts）。
 * 終端機在打字＝頂部迷你光球 thinking；每次「已攔截」＝迷你光球閃紅＋終端機邊緣紅色脈衝與輕微 glitch（≤300ms）。
 */
export function DemoSafety() {
  const fx = useFx()
  const isStatic = fx.level === 'static'
  const [run, setRun] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const hitTimer = useRef(0)

  const hit = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    el.removeAttribute('data-hit')
    void el.offsetWidth // 重新觸發 CSS 動畫
    el.setAttribute('data-hit', 'true')
    window.clearTimeout(hitTimer.current)
    hitTimer.current = window.setTimeout(() => el.removeAttribute('data-hit'), 320)
  }, [])

  const onProgress = useCallback(
    (k: number) => {
      if (k < 0) return
      if (k >= ITEMS) {
        setMiniBase('standby')
        return
      }
      const line = A.lines[Math.floor(k / 3)]
      const role = k % 3
      if (role < 2) setMiniBase('thinking')
      else if (line.verdict === 'block') {
        pulseMini('alert', 650)
        hit()
      } else setMiniBase('standby')
    },
    [hit],
  )

  useEffect(
    () => () => {
      window.clearTimeout(hitTimer.current)
      setMiniBase('standby')
    },
    [],
  )

  return (
    <article id="demo-safety" className="demo demo-a" data-testid="demo-a" style={{ '--demo': 'var(--alert)' } as CSSProperties}>
      <header className="demo-head">
        <p className="demo-tag">
          <i className="demo-lamp" aria-hidden="true" />
          {A.tag}
        </p>
        <Title lines={A.title} as="h3" className="h-display h3" />
      </header>

      <div className="demo-stage" ref={stageRef} data-testid="demo-stage">
        <Corners className="demo-corners" />
        <Terminal key={run} className="term" title={A.terminalTitle} sequence={!isStatic} startOnView onProgress={isStatic ? undefined : onProgress}>
          {isStatic
            ? A.lines.map((l, i) => (
                <div key={i} className="grid">
                  <span className="term-line term-prompt">{l.prompt}</span>
                  <span className="term-line term-cmd">{`$ ${l.cmd}`}</span>
                  <Verdict l={l} i={i} />
                </div>
              ))
            : A.lines.flatMap((l, i) => [
                <AnimatedSpan key={`p${i}`} className="term-line term-prompt">
                  {l.prompt}
                </AnimatedSpan>,
                <TypingAnimation key={`c${i}`} className="term-line term-cmd" duration={24}>
                  {`$ ${l.cmd}`}
                </TypingAnimation>,
                <AnimatedSpan key={`v${i}`} className="term-line">
                  <Verdict l={l} i={i} />
                </AnimatedSpan>,
              ])}
        </Terminal>
        <div className="term-foot">
          <p>{A.footnote}</p>
          {isStatic ? null : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setMiniBase('standby')
                setRun((r) => r + 1)
              }}
              data-testid="term-replay"
            >
              <RotateCcw size={16} aria-hidden="true" />
              {A.replay}
            </button>
          )}
        </div>
      </div>

      <div className="demo-copy">
        <Story short={A.story.short} more={A.story.more} extra={[A.outro]} />
      </div>
    </article>
  )
}
