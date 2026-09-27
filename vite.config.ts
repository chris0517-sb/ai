import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// ★ 專案路徑含中文（應徵資料\AI職缺）：Vite 的檔案監看（chokidar）會漏抓變更、瀏覽器吐舊模組，
//   所以 dev server 一律用輪詢（never-twice／web-testing 2026-07-10）。
// ★ port 吃 process.env.PORT：launch.json 開了 autoPort，別假設 5173。
const envPort = Number(process.env.PORT)
const port = Number.isFinite(envPort) && envPort > 0 ? envPort : 5180

export default defineConfig(({ command, isPreview }) => ({
  // 正式網址是 https://chris0517-sb.github.io/ai/ → build／preview 時 base 設 /ai/；dev 用根目錄，預覽面板直接開得到
  base: command === 'build' || isPreview ? '/ai/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port,
    strictPort: Boolean(process.env.PORT),
    watch: { usePolling: true, interval: 250 },
  },
  preview: {
    port,
    strictPort: Boolean(process.env.PORT),
  },
  build: {
    target: 'es2022',
    // 單一 chunk 過大時才提醒；本站 JS gzip 總量上限 450KB（規格 §9-1），實際量測看 tools/size.mjs
    chunkSizeWarningLimit: 700,
  },
}))
