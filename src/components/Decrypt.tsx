import { Fragment, type ElementType } from 'react'
import { useFx } from '../lib/fx'
import DecryptedText from './reactbits/DecryptedText'

/**
 * 解碼進場（React Bits DecryptedText）的本站用法：
 * - mono：HUD 標籤（J . A . R . V . I . S、01 / JARVIS…）→ 全部字一起亂碼幾輪再定格
 * - 中文標題 → 從頭一個字一個字解出來，亂碼只用同一行裡的字（字寬不變、斷行不亂）
 * - static 級：直接顯示原字，不跑任何動畫
 */
export function Decrypt({
  text,
  mono = false,
  enabled = true,
  className,
}: {
  text: string
  mono?: boolean
  enabled?: boolean
  className?: string
}) {
  const fx = useFx()
  if (fx.level === 'static') return <span className={className}>{text}</span>
  return (
    <DecryptedText
      text={text}
      animateOn="view"
      enabled={enabled}
      sequential={!mono}
      revealDirection="start"
      speed={mono ? 45 : 32}
      maxIterations={mono ? 12 : 10}
      characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>[]#*+=-_"
      useOriginalCharsOnly={false}
      widthStable
      parentClassName={mono ? 'inline-block' : 'inline'}
      className={className}
      encryptedClassName="decrypt-enc"
    />
  )
}

/** 大標：字串陣列的每一段是一行，段與段之間下 <br>（中文大標自己在語意處斷行，design-dna §2.5） */
export function Title({
  lines,
  as: Tag = 'h2',
  className,
  decrypt = true,
}: {
  lines: readonly string[]
  as?: ElementType
  className?: string
  decrypt?: boolean
}) {
  const full = lines.join('')
  return (
    <Tag className={className} aria-label={full} data-measure="title">
      {lines.map((ln, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {decrypt ? <Decrypt text={ln} /> : ln}
        </Fragment>
      ))}
    </Tag>
  )
}
