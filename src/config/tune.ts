/**
 * 調整面板（網址加 ?tune 才出現，只有主人會用）的預設值——唯一真相在這裡。
 * 主人在面板按「複製設定」貼回來的 JSON，就是要改進這個物件的值。
 */
export type AccentKey = 'speak' | 'active' | 'think'
export type TitleFont = 'serif' | 'sans'

export interface TuneValues {
  /** 特效強度 0–150（%）：粒子數、光暈、背景點陣反應力道一起縮放 */
  intensity: number
  /** 動畫速度 0.5–1.5（倍）：光球轉速、字幕打字、捲動動畫；開機動畫只會變快不會變慢（≤1.8 秒是硬線） */
  speed: number
  /** 主強調色：speak 綠／active 藍／think 紫 */
  accent: AccentKey
  /** 掃描線開關 */
  scanlines: boolean
  /** 開機動畫開關 */
  boot: boolean
  /** 標題字體：宋體（Noto Serif TC）／黑體（Noto Sans TC） */
  titleFont: TitleFont
  /** 背景互動（點陣跟手、點擊衝擊波）開關；lite 級一律不跟手 */
  bgInteractive: boolean
}

export const TUNE_DEFAULTS: TuneValues = {
  intensity: 100,
  speed: 1,
  accent: 'speak',
  scanlines: true,
  boot: true,
  titleFont: 'serif',
  bgInteractive: true,
}

export const TUNE_LIMITS = {
  intensity: { min: 0, max: 150, step: 5 },
  speed: { min: 0.5, max: 1.5, step: 0.05 },
} as const

export const TUNE_STORAGE_KEY = 'ai-site:tune:v1'
