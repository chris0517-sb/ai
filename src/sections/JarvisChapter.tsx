import { Decrypt, Title } from '../components/Decrypt'
import { NumberTicker } from '../components/magicui/number-ticker'
import { jarvis, next } from '../content'
import { useFx } from '../lib/fx'
import { Abilities } from './Abilities'
import { DemoRouting } from './DemoRouting'
import { DemoSafety } from './DemoSafety'
import { DemoVerify } from './DemoVerify'
import { Tour } from './Tour'

const fmt = (n: number) => Intl.NumberFormat('en-US').format(n)

function Stats() {
  const fx = useFx()
  return (
    <div className="stats" data-testid="stats">
      {jarvis.stats.map((s) => (
        <div key={s.unit} className="stat">
          <span className="stat-num">
            {fx.level === 'static' ? fmt(s.value) : <NumberTicker value={s.value} className="text-accent" />}
          </span>
          <span className="stat-label">
            <b>{s.unit}</b>
            {s.note}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 01 / JARVIS 章節。第二期的章節（蜂巢…）照同樣的骨架接在後面：section[data-chapter]＋content.ts 的 chapters */
export function JarvisChapter() {
  return (
    <section id="jarvis" className="chapter" data-chapter="jarvis">
      <div className="wrap">
        <p className="chapter-label mono-tag">
          <Decrypt text={jarvis.label} mono />
        </p>
        <Title lines={jarvis.title} as="h2" className="h-display h2" />
        <p className="lede">{jarvis.intro}</p>
        <Stats />
      </div>

      <Tour />

      <div className="wrap">
        <Abilities />
        <DemoSafety />
        <DemoVerify />
        <DemoRouting />

        <div className="mypart" data-testid="mypart">
          <p className="mono-tag">{jarvis.myPartTitle}</p>
          <p>{jarvis.myPart}</p>
        </div>

        <p className="next" data-testid="next">
          {next.text}
        </p>
      </div>
    </section>
  )
}
