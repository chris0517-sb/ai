import { BrainCircuit, MessageSquareText, WifiOff, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Title } from '../components/Decrypt'
import { Corners } from '../components/hud/Corners'
import { AnimatedBeam } from '../components/magicui/animated-beam'
import { Story } from '../components/Story'
import { jarvis } from '../content'
import { useFx } from '../lib/fx'
import { useTune } from '../lib/tune'
import { tokenRGBA } from '../lib/utils'

const C = jarvis.demoC

/** 「免費模型（Gemini／Groq）」拆成主名＋括號兩行顯示（字一樣，只是排版；手機上節點窄） */
function Label({ text }: { text: string }) {
  const i = text.indexOf('（')
  if (i <= 0) return <>{text}</>
  return (
    <span className="node-text">
      <span>{text.slice(0, i)}</span>
      <span className="node-sub">{text.slice(i)}</span>
    </span>
  )
}

const rgbOf = (token: string) => {
  const c = tokenRGBA(token)
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/**
 * 示範 C：最貴的模型，不該打頭陣（Magic UI Animated Beam）。
 * 上：你的一句話 → 免費模型；旁支「難題」→ Claude。下：備援鏈 Claude → Gemini → Groq → 本機模型（離線），光束依序流過。
 * 手機上 CSS 把節點改成直式排列，光束會跟著節點中心重算路徑。離開視窗就把光束拆掉（不在畫面上的動畫不跑）。
 */
export function DemoRouting() {
  const fx = useFx()
  const tune = useTune()
  const isStatic = fx.level === 'static'
  const boxRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const freeRef = useRef<HTMLDivElement>(null)
  const hardRef = useRef<HTMLDivElement>(null)
  const claudeRef = useRef<HTMLDivElement>(null)
  const chainBoxRef = useRef<HTMLDivElement>(null)
  const c0 = useRef<HTMLDivElement>(null)
  const c1 = useRef<HTMLDivElement>(null)
  const c2 = useRef<HTMLDivElement>(null)
  const c3 = useRef<HTMLDivElement>(null)
  const chainRefs = [c0, c1, c2, c3]
  const [inView, setInView] = useState(isStatic)

  useEffect(() => {
    if (isStatic) return
    const el = boxRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [isStatic])

  // 顏色從 token 解析（tune 換強調色時重新解析）
  const col = useMemo(
    () => ({
      accent: rgbOf('--accent'),
      speak: rgbOf('--speak'),
      active: rgbOf('--active'),
      think: rgbOf('--think'),
      standby: rgbOf('--standby'),
      line: rgbOf('--text-3'),
    }),
    [tune.accent],
  )

  const lite = fx.level === 'lite'
  const show = inView || isStatic
  const beam = { pathColor: col.line, pathOpacity: 0.35, pathWidth: 2, isStatic }

  return (
    <article className="demo demo-c" data-testid="demo-c" style={{ '--demo': 'var(--think)' } as CSSProperties}>
      <header className="demo-head">
        <p className="demo-tag">
          <i className="demo-lamp" aria-hidden="true" />
          {C.tag}
        </p>
        <Title lines={C.title} as="h3" className="h-display h3" />
      </header>
      <div className="demo-stage" data-testid="demo-stage">
        <Corners className="demo-corners" />
        <div className="plate route" ref={boxRef}>
          <div className="route-grid" ref={gridRef}>
            <div className="node node-input" ref={inputRef}>
              <MessageSquareText size={16} aria-hidden="true" />
              {C.nodes.input}
            </div>
            <div className="node node-free" ref={freeRef}>
              <Zap size={16} aria-hidden="true" />
              <Label text={C.nodes.free} />
            </div>
            <div className="node node-hard" ref={hardRef}>
              {C.nodes.hard}
            </div>
            <div className="node node-claude" ref={claudeRef}>
              <BrainCircuit size={16} aria-hidden="true" />
              {C.nodes.claude}
            </div>
            {show ? (
              <>
                <AnimatedBeam
                  containerRef={gridRef}
                  fromRef={inputRef}
                  toRef={freeRef}
                  gradientStartColor={col.accent}
                  gradientStopColor={col.speak}
                  duration={2.2}
                  {...beam}
                />
                <AnimatedBeam
                  containerRef={gridRef}
                  fromRef={inputRef}
                  toRef={hardRef}
                  gradientStartColor={col.think}
                  gradientStopColor={col.think}
                  duration={2.2}
                  delay={0.6}
                  {...beam}
                />
                <AnimatedBeam
                  containerRef={gridRef}
                  fromRef={hardRef}
                  toRef={claudeRef}
                  gradientStartColor={col.think}
                  gradientStopColor={col.active}
                  duration={2.2}
                  delay={1.1}
                  {...beam}
                />
              </>
            ) : null}
          </div>

          <p className="mono-tag chain-label">{C.chainLabel}</p>
          <div className="chain" ref={chainBoxRef}>
            {C.chain.map((name, i) => (
              <div key={name} className="node" ref={chainRefs[i]} data-offline={i === C.chain.length - 1}>
                {i === C.chain.length - 1 ? <WifiOff size={16} aria-hidden="true" /> : null}
                <Label text={name} />
              </div>
            ))}
            {show && !lite
              ? [0, 1, 2].map((i) => (
                  <AnimatedBeam
                    key={i}
                    containerRef={chainBoxRef}
                    fromRef={chainRefs[i]}
                    toRef={chainRefs[i + 1]}
                    gradientStartColor={col.standby}
                    gradientStopColor={col.accent}
                    duration={1.2}
                    delay={i * 0.8}
                    repeatDelay={1.2}
                    {...beam}
                  />
                ))
              : null}
            {show && lite
              ? // lite：同時進行的動畫變少——備援鏈一次只流一段（三段輪流），不是三段一起跑
                [0, 1, 2].map((i) => (
                  <AnimatedBeam
                    key={i}
                    containerRef={chainBoxRef}
                    fromRef={chainRefs[i]}
                    toRef={chainRefs[i + 1]}
                    gradientStartColor={col.standby}
                    gradientStopColor={col.accent}
                    duration={1}
                    delay={i * 1.2}
                    repeatDelay={2.6}
                    {...beam}
                  />
                ))
              : null}
          </div>
        </div>
      </div>
      <div className="demo-copy">
        <Story short={C.body.short} more={C.body.more} />
      </div>
    </article>
  )
}
