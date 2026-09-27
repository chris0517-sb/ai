import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import BootOverlay from './boot/BootOverlay'
import { ChapterNav } from './components/ChapterNav'
import DotGrid from './components/reactbits/DotGrid'
import { Hero } from './hero/Hero'
import { dprCap, startFpsProbe, useFx } from './lib/fx'
import { tuneEnabled, useTune } from './lib/tune'
import { clamp } from './lib/utils'
import { JarvisChapter } from './sections/JarvisChapter'

const TunePanel = lazy(() => import('./tune/TunePanel'))

export default function App({ initialBoot }: { initialBoot: boolean }) {
  const fx = useFx()
  const tune = useTune()
  const [booting, setBooting] = useState(initialBoot)
  const probed = useRef(false)

  // 開場（開機播完、或這次不播）之後量 3 秒 FPS，低於 40 自動降一級
  useEffect(() => {
    if (booting || probed.current) return
    probed.current = true
    startFpsProbe(3000)
  }, [booting])

  const k = clamp(tune.intensity / 100, 0, 1.5)

  return (
    <>
      <div className="bg-grid" aria-hidden="true">
        <DotGrid
          interactive={fx.level === 'high' && tune.bgInteractive && k > 0}
          dprCap={dprCap(fx.level)}
          colorKey={tune.accent}
          proximity={Math.round(80 + 60 * k)}
          shockStrength={3 * k}
          shockRadius={Math.round(140 + 80 * k)}
        />
      </div>
      <ChapterNav />
      <main className="site">
        <Hero />
        <JarvisChapter />
      </main>
      {booting ? <BootOverlay onDone={() => setBooting(false)} /> : null}
      {tuneEnabled() ? (
        <Suspense fallback={null}>
          <TunePanel />
        </Suspense>
      ) : null}
    </>
  )
}
