import { Check, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Title } from '../components/Decrypt'
import { AnimatedSpan, Terminal, TypingAnimation } from '../components/magicui/terminal'
import { jarvis } from '../content'
import { useFx } from '../lib/fx'

const A = jarvis.demoA

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
 */
export function DemoSafety() {
  const fx = useFx()
  const isStatic = fx.level === 'static'
  const [run, setRun] = useState(0)

  return (
    <div id="demo-safety" className="demo demo-a" data-testid="demo-a">
      <div className="demo-copy">
        <p className="mono-tag">{A.tag}</p>
        <Title lines={A.title} as="h3" className="h-display h3" />
        <p className="body">{A.story}</p>
      </div>
      <div className="demo-stage">
        <Terminal key={run} className="term" title={A.terminalTitle} sequence={!isStatic} startOnView>
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
            <button type="button" className="btn-ghost" onClick={() => setRun((r) => r + 1)} data-testid="term-replay">
              <RotateCcw size={16} aria-hidden="true" />
              {A.replay}
            </button>
          )}
        </div>
        <p className="body outro">{A.outro}</p>
      </div>
    </div>
  )
}
