import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createRoot } from 'react-dom/client'
import App from './App'
import { setBootPhase, shouldPlayBoot } from './lib/boot'
import { registerDebug } from './lib/debug'
import { installErrorLog } from './lib/errors'
import { getFx, initFx, subscribeFx } from './lib/fx'
import { getTune, initTune, subscribeTune } from './lib/tune'
import './styles/index.css'

installErrorLog() // ?debug=1 面板要看最近 5 筆錯誤：越早裝越好
gsap.registerPlugin(ScrollTrigger, useGSAP)
// 手機網址列伸縮不要觸發重算（釘住區用 svh，iOS 才不會跳）
ScrollTrigger.config({ ignoreMobileResize: true })

const fx = initFx()
const tune = initTune()
gsap.globalTimeline.timeScale(tune.speed)
subscribeTune(() => gsap.globalTimeline.timeScale(getTune().speed))

const playBoot = shouldPlayBoot(fx.level, tune.boot)
setBootPhase(playBoot ? 'running' : 'off')

registerDebug('fx', () => ({ ...getFx(), fps: document.documentElement.dataset.fps ?? null }))
subscribeFx(() => ScrollTrigger.refresh())

createRoot(document.getElementById('root')!).render(<App initialBoot={playBoot} />)

// 字型載入後版面高度會變：重算捲動觸發點
if (document.fonts?.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => {})
}
