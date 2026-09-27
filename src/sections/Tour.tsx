import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { useLayoutEffect, useRef, useState, type Ref } from 'react'
import { Corners } from '../components/hud/Corners'
import { jarvis } from '../content'
import { useFx } from '../lib/fx'
import { registerDebug } from '../lib/debug'

const T = jarvis.tour
const IW = T.image.w
const IH = T.image.h
const base = import.meta.env.BASE_URL

/** 第 i 步的鏡頭：把原圖的 region 平移縮放到框的正中間（整張那步留 4% 邊，其他步留 10%） */
function viewFor(i: number, fw: number, fh: number) {
  const u = fw / IW // 舞台（圖片）在「縮放 1」時：1 原圖像素 = u 螢幕像素
  const [x, y, w, h] = T.steps[i].region
  const pad = i === 0 ? 0.96 : 0.9
  const s = Math.min((fw * pad) / (w * u), (fh * pad) / (h * u))
  return { x: fw / 2 - s * (x + w / 2) * u, y: fh / 2 - s * (y + h / 2) * u, scale: s }
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

function Stage({ step, stageRef }: { step: number; stageRef?: Ref<HTMLDivElement> }) {
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
            {step === 0 ? <span className="tour-box-tag">0{i + 1}</span> : null}
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
  const stageRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)

  useGSAP(
    () => {
      const frame = frameRef.current!
      const stage = stageRef.current!
      const dims = () => ({ fw: frame.clientWidth, fh: frame.clientHeight })
      const sizeStage = () => {
        const { fw } = dims()
        stage.style.width = `${fw}px`
        stage.style.height = `${(fw * IH) / IW}px`
      }
      sizeStage()
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
          onRefreshInit: sizeStage,
          onUpdate: (self) => {
            const s = Math.round(self.progress * (T.steps.length - 1))
            if (s !== stepRef.current) {
              stepRef.current = s
              setStep(s)
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
      registerDebug('tour', {
        steps: T.steps.length,
        scrollFor: (i: number) => Math.round(st.start + ((st.end - st.start) * i) / (T.steps.length - 1)),
        step: () => stepRef.current,
      })
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
          <Stage step={step} stageRef={stageRef} />
          <Corners />
        </div>
        <CaptionPlate step={step} />
      </div>
    </div>
  )
}

/** static：不釘住、不捲動劇情，四步直接排開，每格已經是那一步的鏡頭 */
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
  return (
    <figure data-testid="tour-static-step" data-step={i}>
      <div className="tour-frame" ref={frameRef}>
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
  return <TourPinned />
}
