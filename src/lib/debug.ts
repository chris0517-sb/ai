/**
 * 給自動驗證／截圖腳本用的小掛勾（tools/verify.py、tools/shoot.py 讀 window.__jarvisSite）。
 * 只放唯讀的查詢（例如導覽第 i 步要捲到哪裡），不影響畫面。
 */
declare global {
  interface Window {
    __jarvisSite?: Record<string, unknown>
  }
}

export function registerDebug(name: string, value: unknown) {
  const w = window
  if (!w.__jarvisSite) w.__jarvisSite = {}
  w.__jarvisSite[name] = value
}
