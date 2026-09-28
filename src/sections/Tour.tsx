import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { Corners } from '../components/hud/Corners'
import { jarvis } from '../content'
import { registerDebug } from '../lib/debug'
import { useFx } from '../lib/fx'
import { pulseMini } from '../lib/miniOrb'
import { getTune } from '../lib/tune'

const T = jarvis.tour
const IW = T.image.w
const IH = T.image.h
const base = import.meta.env.BASE_URL
/** 框比這個扁（直式框，例如手機）時，第一步改成「高度填滿、裁兩側、慢慢橫向平移」——不然整張圖太小、上下一大片黑 */
const PORTRAIT_FRAME = 1.3
/** 第一步橫移一個來回幾秒 */
const PAN_PERIOD = 18

type View = { x: number; y: number; scale: number }

/**
 * 第 i 步的鏡頭。鏡頭被限制在截圖範圍內（像真的攝影機）：能蓋滿框就不露出圖外的黑。
 * - 第一步：橫式框＝整張放進來；直式框＝高度填滿（兩側交給橫移慢慢看）
 * - 其他步：區域放進框裡（留 10% 邊）；如果圖蓋不滿框，最多再放大 15% 去蓋
 */
export function viewFor(i: number, fw: number, fh: number, pad = 0.9): View {
  const u = fw / IW
  const [x, y, w, h] = T.steps[i].region
  const sFit = Math.min((fw * (i === 0 ? 0.96 : pad)) / (w * u), (fh * (i === 0 ? 0.96 : pad)) / (h * u))
  const sCover = Math.max(fw / (IW * u), fh / (IH * u))
  let s: number
  if (i === 0) s = fw / fh < PORTRAIT_FRAME ? sCover : sFit
  else s = sFit < sCover ? Math.min(sCover, sFit * 1.15) : sFit
  let tx = fw / 2 - s * (x + w / 2) * u
  let ty = fh / 2 - s * (y + h / 2) * u
  const imgW = IW * u * s
  const imgH = IH * u * s
  tx = imgW >= fw ? Math.min(0, Math.max(fw - imgW, tx)) : (fw - imgW) / 2
  ty = imgH >= fh ? Math.min(0, Math.max(fh - imgH, ty)) : (fh - imgH) / 2
  return { x: tx, y: ty, scale: s }
}

/** 第一步橫移的振幅（螢幕像素，往左右各多少） */
function panRange(fw: number, fh: number) {
  const v = viewFor(0, fw, fh)
  const imgW = IW * (fw / IW) * v.scale
  return fw / fh < PORTRAIT_FRAME ? Math.max(0, (imgW - fw) / 2) : 0
}

function Caption({ i }: { i: number }) {
  return (
    <>
      {T.steps[i].caption.map((seg, k) =>
        seg.c ? (
          <span key={k} className={`c-${seg.c}`}>
            {seg.t}
          </span>
        ) : (
          <span key={k}>{seg.t}</span>
        ),
      )}
    </>
  )
}

function Stage({ step, stageRef, tags = true }: { step: number; stageRef?: Ref<HTMLDivElement>; tags?: boolean }) {
  return (
    <div className="tour-stage" ref={stageRef} data-testid="tour-stage">
      <picture>
        <source srcSet={base + T.image.webp} type="image/webp" />
        <img src={base + T.image.jpg} width={IW} height={IH} alt={T.image.alt} decoding="async" draggable={false} />
      </picture>
      {T.steps.map((st, i) =>
        i === 0 ? null : (
          <div
            key={i}
            className="tour-box"
            data-step={i}
            data-on={step === i}
            data-dim={step !== 0 && step !== i}
            style={{
              left: `${(st.region[0] / IW) * 100}%`,
              top: `${(st.region[1] / IH) * 100}%`,
              width: `${(st.region[2] / IW) * 100}%`,
              height: `${(st.region[3] / IH) * 100}%`,
            }}
          >
            {step === 0 && tags ? <span className="tour-box-tag">0{i + 1}</span> : null}
          </div>
        ),
      )}
    </div>
  )
}

function CaptionPlate({ step }: { step: number }) {
  return (
    <div className="plate tour-caption" data-testid="tour-caption" data-step={step}>
      <div className="tour-progress" aria-hidden="true">
        {T.steps.map((_, i) => (
          <i key={i} data-on={i <= step} />
        ))}
      </div>
      <div className="tour-caption-grid" aria-live="polite">
        {T.steps.map((_, i) => (
          <p key={i} data-on={i === step} aria-hidden={i !== step} data-measure="caption">
            <Caption i={i} />
          </p>
        ))}
      </div>
    </div>
  )
}

/** 導覽：真實畫面拆解——GSAP 釘住＋分段縮放，4 步，捲動驅動 */
function TourPinned() {
  const rootRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [panning, setPanning] = useState(false)
  const stepRef = useRef(0)

  useGSAP(
    () => {
      const frame = frameRef.current!
      const stage = stageRef.current!
      const pan = panRef.current!
      const dims = () => ({ fw: frame.clientWidth, fh: frame.clientHeight })
      const sizeStage = () => {
        const { fw } = dims()
        stage.style.width = `${fw}px`
        stage.style.height = `${(fw * IH) / IW}px`
      }
      sizeStage()
      // 第一步的橫移鏡頭振幅（直式框才有）；尺寸變了（onRefreshInit）就重算
      let range = panRange(dims().fw, dims().fh)
      setPanning(range > 0)
      const onRefreshInit = () => {
        sizeStage()
        range = panRange(dims().fw, dims().fh)
        setPanning(range > 0)
      }
      const v = (i: number) => viewFor(i, dims().fw, dims().fh)
      gsap.set(stage, { transformOrigin: '0 0', ...v(0) })
      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut', duration: 1 },
        scrollTrigger: {
          id: 'tour',
          trigger: pinRef.current,
          pin: true,
          start: 'top top',
          end: () => `+=${Math.round(window.innerHeight * 2.4)}`,
          scrub: 0.6,
          // inertia:false：停在哪就吸到最近的那一步（預設會拿捲動速度預測，一甩就跳過中間的步驟）
          snap: { snapTo: 'labels', duration: { min: 0.2, max: 0.6 }, delay: 0.08, ease: 'power1.inOut', inertia: false },
          invalidateOnRefresh: true,
          onRefreshInit,
          onUpdate: (self) => {
            const s = Math.round(self.progress * (T.steps.length - 1))
            if (s !== stepRef.current) {
              stepRef.current = s
              setStep(s)
              pulseMini('speaking', 1600) // 字幕換字＝JARVIS 在講：頂部迷你光球亮綠
            }
          },
        },
      })
      tl.addLabel('s0')
      for (let i = 1; i < T.steps.length; i++) {
        tl.fromTo(
          stage,
          { x: () => v(i - 1).x, y: () => v(i - 1).y, scale: () => v(i - 1).scale },
          { x: () => v(i).x, y: () => v(i).y, scale: () => v(i).scale, immediateRender: false },
        ).addLabel(`s${i}`)
      }
      const st = tl.scrollTrigger!

      // 第一步的橫移鏡頭：在第一步時完整擺動，往第二步捲的途中振幅慢慢收到 0
      const tick = () => {
        if (!range) {
          pan.style.transform = ''
          return
        }
        const amp = range * Math.max(0, 1 - st.progress * (T.steps.length - 1) * 1.25)
        const t = (performance.now() / 1000) * getTune().speed
        pan.style.transform = `translate3d(${(Math.cos((2 * Math.PI * t) / PAN_PERIOD) * amp).toFixed(1)}px,0,0)`
      }
      let ticking = false
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting && !ticking) {
          gsap.ticker.add(tick)
          ticking = true
        } else if (!e.isIntersecting && ticking) {
          gsap.ticker.remove(tick)
          ticking = false
        }
      })
      io.observe(frame)

      registerDebug('tour', {
        steps: T.steps.length,
        scrollFor: (i: number) => Math.round(st.start + ((st.end - st.start) * i) / (T.steps.length - 1)),
        step: () => stepRef.current,
        panRange: () => range,
      })
      return () => {
        io.disconnect()
        if (ticking) gsap.ticker.remove(tick)
      }
    },
    { scope: rootRef },
  )

  return (
    <div className="tour" ref={rootRef} data-testid="tour">
      <div className="tour-pin" ref={pinRef}>
        <div className="tour-head">
          <p className="mono-tag">{T.label}</p>
          <p className="tour-count" data-testid="tour-count">
            <b>0{step + 1}</b> / 0{T.steps.length}
          </p>
        </div>
        <div className="tour-frame" ref={frameRef} data-testid="tour-frame">
          <div className="tour-pan" ref={panRef}>
            <Stage step={step} stageRef={stageRef} tags={!panning} />
          </div>
          <Corners />
        </div>
        <CaptionPlate step={step} />
      </div>
    </div>
  )
}

const MOBILE_Q = '(max-width: 767px)'
/** 放大步驟時，框底下的資訊列（小地圖＋編號）至少留這麼高 */
const INFO_MIN = 64
/** 資訊列比這個高（方形的狀態球那步）就把小地圖和編號上下疊：填滿高度，不留一大片黑 */
const INFO_STACK = 150
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function useMedia(query: string) {
  const [m, setM] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return m
}

/**
 * 手機版導覽（≤767px，2026-09-28 第三輪）。框＝段標下方到字幕卡之間的全部高度，分成上下兩塊：
 * - 上：放大鏡頭（.tour-view）。第一步＝整張截圖寬度填滿、一個角都不裁；第二～四步＝放大到那一區（區域完整在框內、填滿 90%）。
 *   鏡頭的高度跟著步驟變（直長的左右欄用高鏡頭、方形的狀態球用方鏡頭），捲動時跟縮放一起平滑變化。
 * - 下：第一步是 HUD 圖例（02／03／04 大編號＋細引線連到圖上的框）；放大步驟是小地圖（整張圖＋目前這一區的框）＋編號。
 *   兩塊都是真內容，框裡不會留一大片黑。
 */
function TourPinnedMobile() {
  const rootRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)
  const legend = T.legend

  useGSAP(
    () => {
      const frame = frameRef.current!
      const view = viewRef.current!
      const stage = stageRef.current!
      const W = () => frame.clientWidth
      const F = () => frame.clientHeight
      const viewH = (i: number) => {
        const w = W()
        if (i === 0) return Math.round((w * IH) / IW)
        const [, , rw, rh] = T.steps[i].region
        return Math.round(Math.max(w * 0.6, Math.min((w * rh) / rw, F() - INFO_MIN)))
      }
      const cam = (i: number): View => (i === 0 ? { x: 0, y: 0, scale: 1 } : viewFor(i, W(), viewH(i), 0.92))
      const sizeStage = () => {
        stage.style.width = `${W()}px`
        stage.style.height = `${(W() * IH) / IW}px`
      }
      sizeStage()
      gsap.set(view, { height: viewH(0) })
      gsap.set(stage, { transformOrigin: '0 0', ...cam(0) })

      const n = T.steps.length - 1
      let tlRef: gsap.core.Timeline | null = null
      const layout = () => {
        const tl = tlRef
        if (!tl) return // 建立時間軸的當下 ScrollTrigger 就會先 refresh 一次：那時還沒有 tl
        const p = tl.progress() * n
        const la = clamp01(1 - p / 0.45)
        const za = clamp01((p - 0.55) / 0.45)
        const lg = legendRef.current
        const ln = linesRef.current
        const zm = zoomRef.current
        const mm = minimapRef.current
        if (!lg || !ln || !zm || !mm) return
        lg.style.opacity = ln.style.opacity = String(la)
        lg.style.visibility = ln.style.visibility = la < 0.01 ? 'hidden' : 'visible'
        zm.style.opacity = String(za)
        zm.style.visibility = za < 0.01 ? 'hidden' : 'visible'
        const fr = frame.getBoundingClientRect()
        const ox = fr.left + frame.clientLeft
        const oy = fr.top + frame.clientTop
        const w = W()
        const infoTop = view.getBoundingClientRect().bottom - oy
        const infoH = F() - infoTop
        if (la > 0.01) {
          const boxes = stage.querySelectorAll<HTMLElement>('.tour-box')
          const rows = Array.from(lg.querySelectorAll<HTMLElement>('.lg-row'))
          const lines = Array.from(ln.querySelectorAll<SVGLineElement>('line'))
          const dots = Array.from(ln.querySelectorAll<SVGCircleElement>('circle'))
          const hs = rows.map((r) => r.offsetHeight)
          const gap = Math.max(8, (infoH - hs.reduce((a, c) => a + c, 0)) / (rows.length + 1))
          let yCursor = infoTop + gap
          rows.forEach((row, k) => {
            const b = boxes[k].getBoundingClientRect()
            const num = row.firstElementChild as HTMLElement
            const tagW = num.offsetWidth
            const tx = Math.min(Math.max(b.left + b.width / 2 - ox - tagW / 2, 0), w - tagW)
            row.dataset.side = tx + tagW / 2 > w * 0.6 ? 'right' : 'left'
            const rowW = row.offsetWidth
            const x = row.dataset.side === 'right' ? tx + tagW - rowW : tx
            const y = yCursor
            yCursor += hs[k] + gap
            row.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
            const lx = (tx + tagW / 2).toFixed(1)
            const y1 = (b.bottom - oy).toFixed(1)
            lines[k].setAttribute('x1', lx)
            lines[k].setAttribute('x2', lx)
            lines[k].setAttribute('y1', y1)
            lines[k].setAttribute('y2', y.toFixed(1))
            dots[k].setAttribute('cx', lx)
            dots[k].setAttribute('cy', y1)
          })
        }
        if (za > 0.01) {
          const stack = infoH >= INFO_STACK
          zm.dataset.layout = stack ? 'stack' : 'row'
          const mh = stack ? Math.min(infoH - 64, (w * 0.62 * IH) / IW) : Math.max(24, Math.min(infoH - 22, (w * 0.5 * IH) / IW))
          mm.style.height = `${mh.toFixed(1)}px`
          mm.style.width = `${((mh * IW) / IH).toFixed(1)}px`
        }
      }

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut', duration: 1 },
        onUpdate: () => layout(),
        scrollTrigger: {
          id: 'tour',
          trigger: pinRef.current,
          pin: true,
          start: 'top top',
          end: () => `+=${Math.round(window.innerHeight * 2.4)}`,
          scrub: 0.6,
          snap: { snapTo: 'labels', duration: { min: 0.2, max: 0.6 }, delay: 0.08, ease: 'power1.inOut', inertia: false },
          invalidateOnRefresh: true,
          onRefreshInit: sizeStage,
          onRefresh: () => layout(),
          onUpdate: (self) => {
            const s = Math.round(self.progress * n)
            if (s !== stepRef.current) {
              stepRef.current = s
              setStep(s)
              pulseMini('speaking', 1600)
            }
          },
        },
      })
      tlRef = tl
      tl.addLabel('s0')
      for (let i = 1; i <= n; i++) {
        tl.fromTo(
          stage,
          { x: () => cam(i - 1).x, y: () => cam(i - 1).y, scale: () => cam(i - 1).scale },
          { x: () => cam(i).x, y: () => cam(i).y, scale: () => cam(i).scale, immediateRender: false },
        )
          .fromTo(view, { height: () => viewH(i - 1) }, { height: () => viewH(i), immediateRender: false }, '<')
          .addLabel(`s${i}`)
      }
      const st = tl.scrollTrigger!
      layout()
      // 字型載入、圖片解碼後，圖例的寬度會變：再排一次
      const again = () => layout()
      document.fonts?.ready.then(again).catch(() => {})
      const ro = new ResizeObserver(again)
      ro.observe(frame)

      registerDebug('tour', {
        steps: T.steps.length,
        scrollFor: (i: number) => Math.round(st.start + ((st.end - st.start) * i) / n),
        step: () => stepRef.current,
        panRange: () => 0,
        mobile: true,
      })
      return () => ro.disconnect()
    },
    { scope: rootRef },
  )

  const act = Math.min(Math.max(step, 1), legend.length)
  return (
    <div className="tour" ref={rootRef} data-testid="tour">
      <div className="tour-pin tour-pin--m" ref={pinRef}>
        <div className="tour-head">
          <p className="mono-tag">{T.label}</p>
          <p className="tour-count" data-testid="tour-count">
            <b>0{step + 1}</b> / 0{T.steps.length}
          </p>
        </div>
        <div className="tour-frame" ref={frameRef} data-testid="tour-frame">
          <div className="tour-view" ref={viewRef} data-testid="tour-view">
            <Stage step={step} stageRef={stageRef} tags={false} />
          </div>
          <div className="tour-info" data-testid="tour-info">
            <div className="tour-zoominfo" ref={zoomRef} aria-hidden={step === 0}>
              <div className="tour-minimap" ref={minimapRef} data-testid="tour-minimap">
                <img src={base + T.image.jpg} alt="" width={IW} height={IH} decoding="async" draggable={false} />
                {T.steps.slice(1).map((st, k) => (
                  <i
                    key={k}
                    className="mm-box"
                    data-on={step === k + 1}
                    style={{
                      left: `${(st.region[0] / IW) * 100}%`,
                      top: `${(st.region[1] / IH) * 100}%`,
                      width: `${(st.region[2] / IW) * 100}%`,
                      height: `${(st.region[3] / IH) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <p className="zi-label">
                <span className="lg-num">{legend[act - 1].num}</span>
                <span className="lg-label">{legend[act - 1].label}</span>
              </p>
            </div>
          </div>
          <svg className="tour-lines" ref={linesRef} aria-hidden="true" data-testid="tour-lines">
            {legend.map((l) => (
              <g key={l.num}>
                <line x1="0" y1="0" x2="0" y2="0" />
                <circle cx="0" cy="0" r="2.5" />
              </g>
            ))}
          </svg>
          <div className="tour-legend" ref={legendRef} data-testid="tour-legend" aria-hidden={step !== 0}>
            {legend.map((l) => (
              <p key={l.num} className="lg-row" data-testid="legend-row">
                <span className="lg-num">{l.num}</span>
                <span className="lg-label">{l.label}</span>
              </p>
            ))}
          </div>
          <Corners className="tour-corners-m" />
        </div>
        <CaptionPlate step={step} />
      </div>
    </div>
  )
}

/** static：不釘住、不捲動劇情，四步直接排開；每格的框比例配合那一步（第一步＝整張圖的比例，不留黑邊） */
function StaticStep({ i }: { i: number }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const frame = frameRef.current!
    const stage = stageRef.current!
    const apply = () => {
      const fw = frame.clientWidth
      const fh = frame.clientHeight
      stage.style.width = `${fw}px`
      stage.style.height = `${(fw * IH) / IW}px`
      const v = viewFor(i, fw, fh)
      stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [i])
  const aspect: CSSProperties = { aspectRatio: i === 0 ? `${IW} / ${IH}` : '4 / 5' }
  return (
    <figure data-testid="tour-static-step" data-step={i}>
      <div className="tour-frame" ref={frameRef} style={aspect}>
        <Stage step={i} stageRef={stageRef} />
        <Corners />
      </div>
      <figcaption className="plate tour-caption" style={{ marginTop: 12 }}>
        <p className="tour-count" style={{ marginBottom: 8 }}>
          <b>0{i + 1}</b> / 0{T.steps.length}
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.7 }} data-measure="caption">
          <Caption i={i} />
        </p>
      </figcaption>
    </figure>
  )
}

export function Tour() {
  const fx = useFx()
  if (fx.level === 'static') {
    return (
      <div className="tour" data-testid="tour">
        <div className="wrap" style={{ padding: '48px 16px 24px' }}>
          <p className="mono-tag">{T.label}</p>
        </div>
        <div className="tour-static">
          {T.steps.map((_, i) => (
            <StaticStep key={i} i={i} />
          ))}
        </div>
      </div>
    )
  }
  return <TourPinnedChooser />
}

/** 手機（≤767px）用手機版；平板、桌機維持原本的版本 */
function TourPinnedChooser() {
  const mobile = useMedia(MOBILE_Q)
  return mobile ? <TourPinnedMobile key="m" /> : <TourPinned key="d" />
}
