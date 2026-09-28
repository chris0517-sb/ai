import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import {
  BarChart3,
  Calculator,
  Check,
  ClipboardList,
  Megaphone,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Corners } from '../../components/hud/Corners'
import { hive, type HiveDeptId } from '../../content'
import { registerDebug } from '../../lib/debug'
import { useFx } from '../../lib/fx'
import { pulseMini } from '../../lib/miniOrb'

const D = hive.day
const DEPTS = hive.depts
const byId = Object.fromEntries(DEPTS.map((d) => [d.id, d])) as Record<HiveDeptId, (typeof DEPTS)[number]>

const ICONS: Record<HiveDeptId, LucideIcon> = {
  chief: UserRound,
  social: Megaphone,
  plan: ClipboardList,
  analysis: BarChart3,
  eng: Wrench,
  account: Calculator,
  qa: ShieldCheck,
}

/** 平頂六角形的蜂巢座標（r＝1）：中間幕僚長，外圈從正上方順時針。工單路線 幕僚長→企劃→工程→品保→幕僚長 剛好繞外圈相鄰三格一圈 */
const SQ3 = Math.sqrt(3)
const POS: Record<HiveDeptId, [number, number]> = {
  chief: [0, 0],
  social: [0, -SQ3],
  plan: [1.5, -SQ3 / 2],
  eng: [1.5, SQ3 / 2],
  qa: [0, SQ3],
  account: [-1.5, SQ3 / 2],
  analysis: [-1.5, -SQ3 / 2],
}
const UW = 5
const UH = 3 * SQ3
const pct = ([x, y]: [number, number]) => [((x + UW / 2) / UW) * 100, ((y + UH / 2) / UH) * 100] as const

type Node = HiveDeptId | 'boss'
type Step =
  | 'idle'
  | 'chief'
  | 'to-plan'
  | 'plan'
  | 'to-eng'
  | 'eng'
  | 'to-qa'
  | 'qa'
  | 'to-chief'
  | 'to-boss'
  | 'decide'
  | 'deliver'
  | 'delivered'

/**
 * 「一天怎麼跑」示意（從 08:00 捲到 18:00，單位＝分鐘，0＝08:00）。
 * seg：[開始, 結束, 從, 到, 這段的名字]；from＝to 就是停在那一格做事。
 */
const SEGS: [number, number, Node, Node, Step][] = [
  [30, 60, 'chief', 'chief', 'chief'],
  [60, 120, 'chief', 'plan', 'to-plan'],
  [120, 210, 'plan', 'plan', 'plan'],
  [210, 270, 'plan', 'eng', 'to-eng'],
  [270, 360, 'eng', 'eng', 'eng'],
  [360, 420, 'eng', 'qa', 'to-qa'],
  [420, 480, 'qa', 'qa', 'qa'],
  [480, 520, 'qa', 'chief', 'to-chief'],
  [520, 560, 'chief', 'boss', 'to-boss'],
]
const DECIDE_AT = 560
/** 捲回這個分鐘數之前，決定卡重置 */
const RESET_BEFORE = 520
/** 到點亮起（分鐘）；會計部每月 1 號才上班，示意的這一天不亮 */
const LIGHT_AT: Partial<Record<HiveDeptId, number>> = { chief: 30, social: 60, plan: 60, analysis: 120, eng: 270, qa: 420 }

function flowAt(m: number) {
  if (m < SEGS[0][0]) return { step: 'idle' as Step, from: 'chief' as Node, to: 'chief' as Node, k: 0, start: 0 }
  for (const [a, b, from, to, step] of SEGS) {
    if (m < b) return { step, from, to, k: from === to ? 1 : (m - a) / (b - a), start: a }
  }
  return { step: 'decide' as Step, from: 'boss' as Node, to: 'boss' as Node, k: 1, start: DECIDE_AT }
}

const clock = (m: number) => {
  const t = 8 * 60 + Math.round(m)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * 02 蜂巢・主角一：蜂巢地圖（點格子看部門說明）＋「一天怎麼跑」捲動示意（GSAP 釘住，手機也有）。
 * 右上角 HUD 時鐘隨捲動 08:00→18:00；到點的部門亮起；一個「工單」光點沿光束走：
 * 幕僚長 → 企劃部 → 工程部（做成文件）→ 品保長（驗收）→ 幕僚長 → 決定卡 → 選了（或停 3 秒自動選推薦）→ 回幕僚長「已交付」。
 * 這是模擬流程，框角標「示意」，不放日期與像真實日誌的時間戳。
 * 減少動態效果：光點不移動（改成逐格亮起）、時鐘直接跳到每一段的時間；互動照常。
 */
export function HiveDay() {
  const fx = useFx()
  const reduced = fx.motion === 'reduced'
  const isStatic = fx.level === 'static'
  const rootRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<Partial<Record<HiveDeptId, HTMLButtonElement | null>>>({})
  const minuteRef = useRef(isStatic ? 600 : 0)
  const [step, setStep] = useState<Step>(isStatic ? 'delivered' : 'idle')
  const [at, setAt] = useState<Node | ''>(isStatic ? 'chief' : '')
  const [lit, setLit] = useState<string>(isStatic ? 'chief,social,plan,analysis,eng,qa' : '')
  const [picked, setPicked] = useState<string | null>(isStatic ? 'B' : null)
  const [selected, setSelected] = useState<HiveDeptId | null>(null)
  const pickedRef = useRef<string | null>(picked)
  pickedRef.current = picked
  const deliverT = useRef(0)

  /** 各節點中心（相對於 stage，px）；boss＝決定卡上緣中間 */
  const centers = useCallback(() => {
    const st = stageRef.current
    if (!st) return null
    const sr = st.getBoundingClientRect()
    const out: Partial<Record<Node, [number, number]>> = {}
    for (const d of DEPTS) {
      const el = cellRefs.current[d.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      out[d.id] = [r.left + r.width / 2 - sr.left, r.top + r.height / 2 - sr.top]
    }
    const card = cardRef.current
    if (card) {
      const r = card.getBoundingClientRect()
      out.boss = [r.left + r.width / 2 - sr.left, r.top - sr.top + 6]
    }
    return out as Record<Node, [number, number]>
  }, [])

  /** 光束（路線）跟著版面重畫 */
  const drawBeams = useCallback(() => {
    const svg = svgRef.current
    const c = centers()
    if (!svg || !c) return
    const lines = svg.querySelectorAll<SVGLineElement>('line')
    const route: [Node, Node][] = [
      ['chief', 'plan'],
      ['plan', 'eng'],
      ['eng', 'qa'],
      ['qa', 'chief'],
      ['chief', 'boss'],
    ]
    route.forEach(([a, b], i) => {
      const l = lines[i]
      if (!l || !c[a] || !c[b]) return
      l.setAttribute('x1', c[a][0].toFixed(1))
      l.setAttribute('y1', c[a][1].toFixed(1))
      l.setAttribute('x2', c[b][0].toFixed(1))
      l.setAttribute('y2', c[b][1].toFixed(1))
    })
  }, [centers])

  /** 依分鐘數更新畫面：時鐘、亮格、光點位置、步驟 */
  const apply = useCallback(
    (m: number) => {
      minuteRef.current = m
      const f = flowAt(m)
      // 往回捲到「送去給老闆」之前：決定卡重來一次（可以再選一次）
      if (m < RESET_BEFORE && pickedRef.current && !isStatic) {
        pickedRef.current = null
        deliverT.current = 0
        setPicked(null)
      }
      const pickedNow = pickedRef.current
      let s: Step = f.step
      if (m >= DECIDE_AT) s = pickedNow ? (performance.now() < deliverT.current ? 'deliver' : 'delivered') : 'decide'
      const shownMin = reduced ? (s === 'decide' || s === 'deliver' || s === 'delivered' ? Math.max(DECIDE_AT, Math.floor(m / 30) * 30) : f.start) : m
      if (clockRef.current) clockRef.current.textContent = clock(Math.min(600, shownMin))
      const litNow = DEPTS.filter((d) => (LIGHT_AT[d.id] ?? Infinity) <= m)
        .map((d) => d.id)
        .join(',')
      setLit((prev) => (prev === litNow ? prev : litNow))
      setStep((prev) => (prev === s ? prev : s))
      const node: Node | '' =
        s === 'idle' ? '' : s === 'decide' ? 'boss' : s === 'deliver' || s === 'delivered' ? 'chief' : f.from === f.to ? f.from : f.k >= 1 ? f.to : f.from
      setAt((prev) => (prev === node ? prev : node))
      const dot = dotRef.current
      const c = centers()
      if (!dot || !c) return
      if (s === 'idle' || reduced) {
        dot.style.opacity = '0'
        return
      }
      let p: [number, number]
      if (s === 'decide') p = c.boss ?? c.chief
      else if (s === 'deliver' || s === 'delivered') p = c.chief
      else {
        const a = c[f.from] ?? c.chief
        const b = c[f.to] ?? c.chief
        const k = f.k
        p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
      }
      dot.style.opacity = '1'
      dot.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`
    },
    [centers, reduced, isStatic],
  )

  useLayoutEffect(() => {
    drawBeams()
    apply(minuteRef.current)
    const ro = new ResizeObserver(() => {
      drawBeams()
      apply(minuteRef.current)
    })
    if (stageRef.current) ro.observe(stageRef.current)
    if (mapRef.current) ro.observe(mapRef.current)
    // 桌機的卡片是垂直置中：換成決定卡（變高）時卡片上緣會移動 → 光點與「送去給老闆」那條光束要跟著重算
    if (cardRef.current) ro.observe(cardRef.current)
    return () => ro.disconnect()
  }, [drawBeams, apply])

  // 決定卡：點選項（或停在這一步 3 秒）→ 光點回到幕僚長 →「已交付」
  const choose = useCallback(
    (id: string) => {
      if (pickedRef.current) return
      pickedRef.current = id
      setPicked(id)
      deliverT.current = performance.now() + 900
      pulseMini('speaking', 1200)
      apply(minuteRef.current)
      window.setTimeout(() => apply(minuteRef.current), 950)
    },
    [apply],
  )
  useEffect(() => {
    if (step !== 'decide' || picked) return
    const t = window.setTimeout(() => choose('B'), 3000)
    return () => window.clearTimeout(t)
  }, [step, picked, choose])

  // 光點在「回幕僚長」那 0.9 秒要真的走回去（不靠捲動）
  useEffect(() => {
    if (step !== 'deliver' || reduced) return
    const dot = dotRef.current
    const c = centers()
    if (!dot || !c || !c.boss) return
    const tw = gsap.fromTo(
      dot,
      { x: c.boss[0], y: c.boss[1] },
      { x: c.chief[0], y: c.chief[1], duration: 0.8, ease: 'power2.inOut', onComplete: () => apply(minuteRef.current) },
    )
    return () => {
      tw.kill()
    }
  }, [step, reduced, centers, apply])

  useGSAP(
    () => {
      if (isStatic) return
      const st = gsap.timeline({
        scrollTrigger: {
          id: 'hive-day',
          trigger: pinRef.current,
          pin: true,
          start: 'top top',
          end: () => `+=${Math.round(window.innerHeight * 2.2)}`,
          scrub: reduced ? true : 0.4,
          onUpdate: (self) => apply(self.progress * 600),
          onRefresh: () => {
            drawBeams()
            apply(minuteRef.current)
          },
        },
      })
      const trig = st.scrollTrigger!
      registerDebug('hiveDay', {
        scrollFor: (minute: number) => Math.round(trig.start + ((trig.end - trig.start) * minute) / 600),
        minute: () => minuteRef.current,
      })
    },
    { scope: rootRef, dependencies: [reduced, isStatic] },
  )

  const litSet = new Set(lit.split(',').filter(Boolean))
  const showDecision = step === 'decide' || step === 'deliver'
  const cardDept: HiveDeptId = selected ?? (at && at !== 'boss' ? at : 'chief')

  return (
    <div className="hive-day" ref={rootRef} data-testid="hive-day">
      <div className="hive-day-pin" ref={pinRef} data-step={step} data-at={at} data-lit={lit} data-picked={picked ?? ''} data-reduced={reduced}>
        <div className="hive-day-head">
          <p className="mono-tag">{D.heading}</p>
          <span className="hive-clock">
            <span ref={clockRef} data-testid="hive-clock">
              {clock(minuteRef.current)}
            </span>
          </span>
        </div>
        <div className="hive-stage plate" ref={stageRef}>
          <span className="hive-mock" data-testid="hive-mock">
            {D.mock}
          </span>
          <Corners className="hive-corners" />
          <div className="hive-map-box">
          <div className="hive-map" ref={mapRef} role="group" aria-label={hive.title.join('')}>
            {DEPTS.map((d) => {
              const [x, y] = pct(POS[d.id])
              const Icon = ICONS[d.id]
              const tag =
                d.id === 'eng' && (at === 'eng' || ['to-qa', 'qa', 'to-chief', 'to-boss', 'decide', 'deliver', 'delivered'].includes(step))
                  ? 'made'
                  : d.id === 'qa' && ['qa', 'to-chief', 'to-boss', 'decide', 'deliver', 'delivered'].includes(step)
                    ? 'checked'
                    : d.id === 'chief' && step === 'delivered'
                      ? 'delivered'
                      : null
              return (
                <button
                  key={d.id}
                  type="button"
                  ref={(el) => void (cellRefs.current[d.id] = el)}
                  className="hex"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  data-dept={d.id}
                  data-lit={litSet.has(d.id)}
                  data-here={at === d.id}
                  data-selected={selected === d.id}
                  data-tag={tag ?? undefined}
                  aria-pressed={selected === d.id}
                  onClick={() => setSelected((cur) => (cur === d.id ? null : d.id))}
                >
                  <svg className="hex-shape" viewBox="0 0 100 86.6" preserveAspectRatio="none" aria-hidden="true">
                    <polygon points="25,0.8 75,0.8 99.2,43.3 75,85.8 25,85.8 0.8,43.3" />
                  </svg>
                  <span className="hex-body">
                    <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                    <span className="hex-name">{d.name}</span>
                    <span className="hex-hours">{d.hours}</span>
                  </span>
                  {tag === 'made' ? <span className="hex-tag">{D.made}</span> : null}
                  {tag === 'checked' ? (
                    <span className="hex-tag">
                      {D.checked}
                      <Check size={12} strokeWidth={2.6} aria-hidden="true" />
                    </span>
                  ) : null}
                  {tag === 'delivered' ? (
                    <span className="hex-tag hex-tag--done" data-testid="hive-delivered">
                      {D.delivered}
                      <Check size={12} strokeWidth={2.6} aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          </div>
          <svg className="hive-beams" ref={svgRef} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} data-seg={i} data-on={beamOn(step, i)} />
            ))}
          </svg>
          <span className="hive-dot" ref={dotRef} aria-hidden="true" />
          <div className="hive-card" ref={cardRef} data-testid="hive-card" aria-live="polite">
            {showDecision ? (
              <div className="hive-decision" data-testid="hive-decision">
                <p className="hive-decision-head">NEEDS-USER</p>
                <p className="hive-decision-title">{D.decision.title}</p>
                <div className="hive-options">
                  {D.decision.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="hive-option"
                      data-opt={o.id}
                      data-recommended={'recommended' in o ? true : undefined}
                      data-on={picked === o.id}
                      disabled={!!picked}
                      onClick={() => choose(o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="hive-dept-card" data-testid="hive-dept-card" data-dept={cardDept}>
                <p className="hive-dept-name">
                  {byId[cardDept].name}
                  <span className="hive-dept-hours">{byId[cardDept].hours}</span>
                </p>
                <p className="hive-dept-desc">{byId[cardDept].desc}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 第 i 段光束亮不亮：光點走過／正在走 */
function beamOn(step: Step, i: number) {
  const order: Step[][] = [
    ['to-plan', 'plan', 'to-eng', 'eng', 'to-qa', 'qa', 'to-chief', 'to-boss', 'decide', 'deliver', 'delivered'],
    ['to-eng', 'eng', 'to-qa', 'qa', 'to-chief', 'to-boss', 'decide', 'deliver', 'delivered'],
    ['to-qa', 'qa', 'to-chief', 'to-boss', 'decide', 'deliver', 'delivered'],
    ['to-chief', 'to-boss', 'decide', 'deliver', 'delivered'],
    ['to-boss', 'decide', 'deliver', 'delivered'],
  ]
  return order[i].includes(step)
}
