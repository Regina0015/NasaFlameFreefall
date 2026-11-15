import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import AuthPanel from '../components/AuthPanel.jsx'
import { Brand } from '../components/ui.jsx'
import { DIVE } from '../lib/intro.js'

const EarthScene = lazy(() => import('../components/EarthScene.jsx'))

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
const SEEN_KEY = 'nasatwisters-intro-seen'

function readSeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The login page. After a confirmed sign-in (or Explore demo) App passes `entry`: the form fades out, the
 * scene flies to the docking hatch, a welcome panel appears, then App reveals the dashboard under this page.
 * Timings live in DIVE (lib/intro.js). Without motion or WebGL the transition is skipped at once.
 */
export default function Login({ auth, mode, onModeChange, onExploreDemo, entry, onEntryReveal, onEntryDone }) {
  const [reducedMotion] = useState(
    () => window.matchMedia(REDUCED_QUERY).matches,
  )
  const [sceneFailed, setSceneFailed] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [skipSignal, setSkipSignal] = useState(0)
  const [replaySignal, setReplaySignal] = useState(0)
  const [diveSignal, setDiveSignal] = useState(0)
  const [seen] = useState(readSeen)
  const [motionPaused, setMotionPaused] = useState(false)
  const [flying, setFlying] = useState(false)
  const [panel, setPanel] = useState('hidden') // 'hidden' | 'in' | 'out'

  const revealed = introDone || reducedMotion || sceneFailed
  const started = useRef(false)
  const left = useRef(false)
  const timers = useRef([])
  const entrySkipRef = useRef(null)
  const callbacks = useRef({ onEntryReveal, onEntryDone })
  callbacks.current = { onEntryReveal, onEntryDone }

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    },
    [],
  )

  // Starts the docking transition once, when App confirms an entry.
  useEffect(() => {
    if (!entry || started.current) return
    started.current = true

    // Nothing to fly through: go straight to the dashboard.
    if (reducedMotion || sceneFailed) {
      callbacks.current.onEntryDone()
      return
    }

    setFlying(true)
    setDiveSignal((value) => value + 1)
    const at = (seconds, fn) => timers.current.push(setTimeout(fn, seconds * 1000))
    at(DIVE.WELCOME_IN, () => setPanel('in'))
    at(DIVE.WELCOME_OUT, () => setPanel('out'))
    at(DIVE.REVEAL, () => leave(false))
    at(DIVE.TOTAL, () => callbacks.current.onEntryDone())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  // Keyboard users land on Skip, since the form they were using has just closed.
  useEffect(() => {
    if (flying) entrySkipRef.current?.focus({ preventScroll: true })
  }, [flying])

  function leave(fast) {
    if (left.current) return
    left.current = true
    callbacks.current.onEntryReveal({ fast })
  }

  function skipEntry() {
    if (left.current) return
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPanel((value) => (value === 'hidden' ? 'hidden' : 'out'))
    leave(true)
    timers.current.push(setTimeout(() => callbacks.current.onEntryDone(), DIVE.SKIP_FADE * 1000))
  }

  return (
    <div
      className="cine"
      data-revealed={revealed}
      data-entering={flying || undefined}
      data-fallback={sceneFailed || undefined}
    >
      <div className="cine-scene" aria-hidden="true">
        {!sceneFailed && (
          <Suspense fallback={null}>
            <EarthScene
              reducedMotion={reducedMotion}
              startFinal={seen}
              ambientPaused={motionPaused}
              skipSignal={skipSignal}
              replaySignal={replaySignal}
              diveSignal={diveSignal}
              onIntroDone={() => {
                setIntroDone(true)

                try {
                  sessionStorage.setItem(SEEN_KEY, '1')
                } catch {
                  // The intro may play again if storage is unavailable.
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

      <main className="cine-main" id={flying ? undefined : 'main'} tabIndex={-1}>
        <h1 className="visually-hidden">FlameTrace sign in</h1>

        <AuthPanel
          auth={auth}
          mode={mode}
          onModeChange={onModeChange}
          onExploreDemo={onExploreDemo}
          revealed={revealed && !flying}
        />
      </main>

      {panel !== 'hidden' && (
        <div className="entry-welcome" data-state={panel} role="status">
          <div className="entry-glass">
            <span className="entry-rule" aria-hidden="true" />
            <h2 className="entry-title">
              Welcome aboard, <span className="entry-accent">Astronaut</span>.
            </h2>
            <p className="entry-line">Explore what has been tested. Discover what remains unknown.</p>
          </div>
        </div>
      )}

      {revealed && !flying && !reducedMotion && !sceneFailed && (
        <div className="cine-actions">
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={motionPaused}
            onClick={() => setMotionPaused((value) => !value)}
          >
            {motionPaused
              ? 'Resume background motion'
              : 'Pause background motion'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setIntroDone(false)
              setReplaySignal((value) => value + 1)
            }}
          >
            Replay intro
          </button>
        </div>
      )}

      {!revealed && (
        <button
          type="button"
          className="btn btn-secondary cine-skip"
          onClick={() => setSkipSignal((value) => value + 1)}
        >
          Skip intro
        </button>
      )}

      {flying && (
        <button
          type="button"
          ref={entrySkipRef}
          className="btn btn-secondary cine-skip"
          aria-label="Skip welcome transition"
          onClick={skipEntry}
        >
          Skip
        </button>
      )}

      <p className="cine-foot">
        Earth map: NASA SVS. Station model: NASA / Michael D. Carbajal.
        Particles and stars are decorative.
      </p>
    </div>
  )
}
