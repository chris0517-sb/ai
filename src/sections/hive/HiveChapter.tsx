import { Decrypt, Title } from '../../components/Decrypt'
import { Story } from '../../components/Story'
import { hive } from '../../content'
import { HiveDay } from './HiveDay'
import { HiveRecord, HiveScreen, HiveStories } from './HiveParts'

/**
 * 02 / 蜂巢（spec-phase2.md §1）。版型沿用 JARVIS 章節：段標 → 大標 → 前言（短版＋看完整經過）→
 * 主角一：蜂巢地圖＋「一天怎麼跑」→ 主角二：實際跑出來的紀錄 → 真實畫面 → 三個故事 → 我做的部分。
 */
export function HiveChapter() {
  return (
    <section id="hive" className="chapter" data-chapter="hive">
      <div className="wrap">
        <p className="chapter-label mono-tag">
          <Decrypt text={hive.label} mono />
        </p>
        <Title lines={hive.title} as="h2" className="h-display h2" />
        <div className="lede-story">
          <Story short={hive.intro.short} more={hive.intro.more} />
        </div>
      </div>

      <HiveDay />

      <div className="wrap">
        <HiveRecord />
        <HiveScreen />
        <HiveStories />
        <div className="mypart" data-testid="hive-mypart">
          <p className="mono-tag">{hive.myPartTitle}</p>
          <p>{hive.myPart}</p>
        </div>
      </div>
    </section>
  )
}
