import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import BootOverlay from './boot/BootOverlay'
import DotGrid from './components/reactbits/DotGrid'
import { TopBar } from './components/TopBar'
import { ShockLayer } from './fx/ShockLayer'
import { Hero } from './hero/Hero'
import { dprCap, startFpsProbe, useFx } from './lib/fx'
import { tuneEnabled, useTune } from './lib/tune'
import { clamp, searchParams } from './lib/utils'
import { Contact } from './sections/Contact'
import { HiveChapter } from './sections/hive/HiveChapter'
import { JarvisChapter } from './sections/JarvisChapter'
import { Works } from './sections/Works'

const TunePanel = lazy(() => import('./tune/TunePanel'))
const DebugPanel = lazy(() => import('./debug/DebugPanel'))
const debugOn = searchParams().get('debug') === '1'

export default function App({ initialBoot }: { initialBoot: boolean }) {
  const fx = useFx()
  const tune = useTune()
  const [booting, setBooting] = useState(initialBoot)
  const probed = useRef(false)

  // 開場（開機播完、或這次不播）之後：再等 500ms、量 2 秒 FPS；只會 high→lite，lite 跑不動只降畫質，不關特效
  useEffect(() => {
    if (booting || probed.current) return
    probed.current = true
    startFpsProbe(500, 2000)
  }, [booting])

  const k = clamp(tune.intensity / 100, 0, 1.5)
  const reduced = fx.motion === 'reduced'
  const lite = fx.level !== 'high'

  return (
    <>
      <div className="bg-grid" aria-hidden="true">
        <DotGrid
          interactive={fx.level === 'high' && tune.bgInteractive && k > 0}
          tapShock={fx.level === 'lite' && tune.bgInteractive && k > 0}
          dprCap={dprCap(fx.level, fx.lowPower)}
          gap={fx.lowPower ? 40 : lite ? 32 : 26}
          colorKey={tune.accent}
          proximity={Math.round(80 + 60 * k)}
          shockStrength={(reduced ? 1.4 : 3) * k}
          shockRadius={Math.round((lite ? 110 : 140) + 80 * k)}
        />
      </div>
      <TopBar />
      <main className="site">
        <Hero />
        <JarvisChapter />
        <HiveChapter />
        <Works />
        <Contact />
      </main>
      <ShockLayer />
      {booting ? <BootOverlay onDone={() => setBooting(false)} /> : null}
      {tuneEnabled() ? (
        <Suspense fallback={null}>
          <TunePanel />
        </Suspense>
      ) : null}
      {debugOn ? (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      ) : null}
    </>
  )
}
