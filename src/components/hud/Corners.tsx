import { cn } from '../../lib/utils'

/** 四角 L 形角標（JARVIS jarvis_ui.py:366 _paint_corner_brackets 的網頁版）。holo＝開機投影時當「舞台四角」 */
export function Corners({ holo = false, className }: { holo?: boolean; className?: string }) {
  return (
    <div className={cn('corners', className)} aria-hidden="true" {...(holo ? { 'data-holo': 'corners' } : {})}>
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}
