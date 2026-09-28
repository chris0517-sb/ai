import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { storyToggle } from '../content'
import { useFx } from '../lib/fx'

/**
 * 示範區的故事：短版一直顯示，其餘收進「看完整經過」（平滑展開）。
 * 文字一個字都沒刪改——short＋more 串起來就是原文（content.ts），extra 是同一段收起來的其他段落。
 * static 級：直接全部展開、不放按鈕（截圖與 reduced-motion 用，內容要完整）。
 */
export function Story({ short, more, extra = [] }: { short: string; more: string; extra?: readonly string[] }) {
  const fx = useFx()
  const isStatic = fx.level === 'static'
  const [open, setOpen] = useState(false)
  const id = useId()
  const expanded = open || isStatic
  return (
    <div className="story" data-open={expanded}>
      <p className="body story-short" data-testid="story-short">
        {short}
      </p>
      <div className="story-more" id={id} aria-hidden={!expanded} inert={!expanded}>
        <div className="story-more-inner">
          <p className="body" data-testid="story-more">
            {more}
          </p>
          {extra.map((t, i) => (
            <p key={i} className="body story-extra" data-testid="story-extra">
              {t}
            </p>
          ))}
        </div>
      </div>
      {isStatic ? null : (
        <button type="button" className="story-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-testid="story-toggle">
          {open ? storyToggle.close : storyToggle.open}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
