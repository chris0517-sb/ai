# CREDITS

搬進本站的第三方元件（原始碼 2026-09-28 從官方 shadcn registry 取得當下版本，不是憑記憶寫的）。
顏色全部換成本站 token（`src/styles/tokens.css`），沒有保留庫的預設配色。

| 元件 | 來源網址 | 取得日期 | 授權 | 本站檔案 | 本站改動 |
|---|---|---|---|---|---|
| Dot Grid（React Bits） | https://reactbits.dev/r/DotGrid-TS-TW.json（github.com/DavidHDev/react-bits） | 2026-09-28 | MIT + Commons Clause（個人網站可用；不可把它當元件庫產品販售） | `src/components/reactbits/DotGrid.tsx` | 顏色吃 token、沒動靜時停止重畫、lite 級不掛滑鼠事件、同色點批次填、DPR 依特效分級封頂 |
| Decrypted Text（React Bits） | https://reactbits.dev/r/DecryptedText-TS-TW.json（github.com/DavidHDev/react-bits） | 2026-09-28 | MIT + Commons Clause | `src/components/reactbits/DecryptedText.tsx` | 亂碼字寬不變（中文換中文、英數換英數）、`enabled` 開關、外層可改成 inline |
| Terminal（Magic UI） | https://magicui.design/r/terminal.json（github.com/magicuidesign/magicui） | 2026-09-28 | MIT | `src/components/magicui/terminal.tsx` | 外框與三顆燈號改 token 色、拿掉大圓角、長指令可換行、標題列加檔名；修正 AnimatedSpan 沒輪到就回報完成（第一行不出現）的 bug；加 `onProgress`（回報序列進度，給迷你光球與攔截閃紅用） |
| Animated Beam（Magic UI） | https://magicui.design/r/animated-beam.json（github.com/magicuidesign/magicui） | 2026-09-28 | MIT | `src/components/magicui/animated-beam.tsx` | 拿掉預設色（改由呼叫端傳 token 色）、加 `isStatic` |
| Number Ticker（Magic UI） | https://magicui.design/r/number-ticker.json（github.com/magicuidesign/magicui） | 2026-09-28 | MIT | `src/components/magicui/number-ticker.tsx` | 預設字色改 token |

## 函式庫（npm）

| 套件 | 用途 | 授權 |
|---|---|---|
| gsap、@gsap/react（含 ScrollTrigger、InertiaPlugin） | 捲動劇情、釘住、分段縮放；Dot Grid 的慣性推開 | GSAP Standard License（免費，含商用） |
| motion | Magic UI／React Bits 元件的動畫 | MIT |
| lucide-react | 全站圖示 | ISC |
| react、react-dom、tailwindcss、vite | 框架與建置 | MIT |

## 字型（Google Fonts）

Noto Serif TC、Noto Sans TC、Share Tech Mono — SIL Open Font License 1.1。

## 不是第三方的部分

- 光球（線框變形球、刻度環、掃描弧、思考中的神經網路閃爍、說話中的頻譜冠冕）與開機全像投影：
  移植自楊承翰自己的 JARVIS 原始碼（PySide6），見 `src/orb/orbCore.ts`、`src/boot/` 檔頭的來源行號。
- 畫面截圖 `public/img/jarvis-hud.*`：JARVIS 在他桌面上的真實畫面。
- 點畫面的衝擊波、點光球的兩圈環：移植自 JARVIS 的滑鼠特效（`jarvis_mouse_fx.py` 的 CoreHit），見 `src/fx/` 檔頭。
- 第二段（蜂巢／其他作品／聯絡）沒有再搬第三方元件：蜂巢六角地圖、光束與工單光點、三個故事的互動畫面、
  作品卡上的點陣／流程／OCR 小面板都是本站手刻（SVG＋CSS）；數字沿用上面的 Number Ticker。
- 畫面截圖 `public/img/hive-desk.*`、`public/img/works/*`：他自己專案的畫面（取自 應徵資料\images 與 奧迪奎爾上架圖，
  只縮圖、轉 webp，沒改內容）。
