import { lazy, Suspense, useState } from 'react'
import AuthPanel from '../components/AuthPanel.jsx'
import { Brand } from '../components/ui.jsx'

const EarthScene = lazy(() => import('../components/EarthScene.jsx'))

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
// The intro plays once per browser session; later visits start on the final composition.
const SEEN_KEY = 'nasatwisters-intro-seen'

function readSeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

// The login is always dark: it sits over a night-sky scene, so the theme toggle is not shown here.
export default function Login({ auth, mode, onModeChange, onExploreDemo }) {
  const [reducedMotion] = useState(() => window.matchMedia(REDUCED_QUERY).matches)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [skipSignal, setSkipSignal] = useState(0)
  const [replaySignal, setReplaySignal] = useState(0)
  const [seen] = useState(readSeen)
  const [motionPaused, setMotionPaused] = useState(false)
  // Reduced motion and WebGL failure show the form at once.
  const revealed = introDone || reducedMotion || sceneFailed

  return (
    <div className="cine" data-revealed={revealed} data-fallback={sceneFailed || undefined}>
      <div className="cine-scene" aria-hidden="true">
        {!sceneFailed && (
          <Suspense fallback={null}>
            <EarthScene
              reducedMotion={reducedMotion}
              startFinal={seen}
              ambientPaused={motionPaused}
              skipSignal={skipSignal}
              replaySignal={replaySignal}
              onIntroDone={() => {
                setIntroDone(true)
                try {
                  sessionStorage.setItem(SEEN_KEY, '1')
                } catch {
                  // Not stored; the intro may play again next visit.
                }
              }}
              onFail={() => setSceneFailed(true)}
            />
          </Suspense>
        )}
        <div className="cine-vignette" />
      </div>

      <header className="cine-top">
        <Brand />
        <span className="tag">NASA Space Apps 2026</span>
      </header>

      <main className="cine-main" id="main" tabIndex={-1}>
        <h1 className="visually-hidden">FlameTrace sign in</h1>
        <AuthPanel auth={auth} mode={mode} onModeChange={onModeChange} onExploreDemo={onExploreDemo} revealed={revealed} />
      </main>

      {revealed && !reducedMotion && !sceneFailed && (
        <div className="cine-actions">
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={motionPaused}
            onClick={() => setMotionPaused((v) => !v)}
          >
            {motionPaused ? 'Resume background motion' : 'Pause background motion'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setIntroDone(false)
              setReplaySignal((n) => n + 1)
            }}
          >
            Replay intro
          </button>
        </div>
      )}

      {!revealed && (
        <button type="button" className="btn btn-secondary cine-skip" onClick={() => setSkipSignal((n) => n + 1)}>
          Skip intro
        </button>
      )}

      <p className="cine-foot">Earth map: NASA SVS. Station model: NASA / Michael D. Carbajal. Particles and stars are decorative.</p>
    </div>
  )
}
