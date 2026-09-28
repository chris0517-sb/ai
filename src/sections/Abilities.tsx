import { BellRing, Gauge, Layers, MessageCircle, Mic, Monitor, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Waveform } from '../components/Waveform'
import { jarvis } from '../content'
import { useFx } from '../lib/fx'

type IconKey = (typeof jarvis.abilities)[number]['icon']

const ICONS: Record<IconKey, LucideIcon> = {
  mic: Mic,
  layers: Layers,
  gauge: Gauge,
  message: MessageCircle,
  monitor: Monitor,
  bell: BellRing,
}

/** 每張卡右上角的小動態——都在示範那一項能力本身（UI chrome，手刻白名單） */
function Viz({ k }: { k: IconKey }) {
  switch (k) {
    case 'mic': // 聲紋／音量條
      return (
        <div className="viz-bars">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      )
    case 'layers': // 第一層掛了（變紅）→ 下一層接手
      return (
        <div className="viz-layers">
          <i />
          <i />
          <i />
          <i />
        </div>
      )
    case 'gauge': // 平常指針停在便宜那側，難題才打到最強
      return (
        <div className="viz-gauge">
          <i />
        </div>
      )
    case 'message': // 私訊輸入中
      return (
        <div className="viz-typing">
          <i />
          <i />
          <i />
        </div>
      )
    case 'monitor': // 截圖掃過螢幕
      return (
        <div className="viz-screen">
          <i />
        </div>
      )
    case 'bell': // 最多主動講兩次：波紋只打兩下
      return (
        <div className="viz-ping">
          <i />
          <i />
        </div>
      )
  }
}

export function Abilities() {
  const fx = useFx()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (fx.level === 'static') return
    const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>('.ability') ?? [])
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.classList.add('is-in')
          else if (fx.level === 'high') e.target.classList.remove('is-in') // 離開視窗就停；lite 播過就算了
        }
      },
      { threshold: 0.4 },
    )
    cards.forEach((c) => io.observe(c))
    return () => io.disconnect()
  }, [fx.level])

  return (
    <div className="abilities-block" style={{ marginTop: 96 }}>
      <p className="mono-tag">{jarvis.abilitiesTitle}</p>
      <div className="abilities" ref={listRef}>
        {jarvis.abilities.map((a, i) => {
          const Icon = ICONS[a.icon]
          // 01（語音）是主打卡：比較大、上面有 JARVIS 舞台底部那條會動的聲音波形；其他五張各有自己的小動態
          const lead = i === 0
          return (
            <article key={a.icon} className={lead ? 'plate ability ability-lead' : 'plate ability'} data-lead={lead || undefined}>
              {lead ? <Waveform className="ability-wave" /> : null}
              <div className="ability-top">
                <span className="ability-icon">
                  <Icon size={lead ? 22 : 20} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <span className="ability-num">0{i + 1}</span>
                {lead ? null : (
                  <span className="ability-viz" aria-hidden="true">
                    <Viz k={a.icon} />
                  </span>
                )}
              </div>
              <h3 data-measure="title">{a.title}</h3>
              <p>{a.body}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
