import { useEffect, useRef, useState } from 'react'

// Entry transition after sign-in or Explore demo: a black screen, one typed sentence, one follow-up line, then a
// subtle upward exit that reveals the workspace. About 3 seconds. It is a transition, not a loading sequence:
// the data has its own honest loading states. It plays once per entry (the flag is cleared on the login page),
// never on tab changes, refreshes or assistant requests. No name is invented and no returning account is detected.

const SEEN_KEY = 'flametrace-welcome-seen'
const SECOND_LINE = 'Explore what has been tested. Discover what remains unknown.'
const TYPE_MS = 34
const START_MS = 250
const HOLD_MS = 1000 // how long both lines stay after the follow-up appears
const EXIT_MS = 650

export function welcomeSeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function clearWelcomeSeen() {
  try {
    sessionStorage.removeItem(SEEN_KEY)
  } catch {
    // Nothing stored.
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // The welcome may play again after a refresh if storage is blocked.
  }
}

export default function Welcome({ account, onDone }) {
  const first = account ? 'Welcome back, Astronaut.' : 'Welcome aboard, Astronaut.'
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches).current
  const [typed, setTyped] = useState(reduced ? first.length : 0)
  const [showSecond, setShowSecond] = useState(reduced)
  const [phase, setPhase] = useState('in') // 'in' | 'exit'
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    markSeen()
    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))

    if (reduced) {
      // Static: both lines at once, then a plain fade.
      at(1500, () => setPhase('exit'))
      at(1500 + 250, () => done.current())
    } else {
      for (let i = 1; i <= first.length; i += 1) at(START_MS + i * TYPE_MS, () => setTyped(i))
      const typedBy = START_MS + first.length * TYPE_MS
      at(typedBy + 250, () => setShowSecond(true))
      const exitAt = typedBy + 250 + 500 + HOLD_MS
      at(exitAt, () => setPhase('exit'))
      at(exitAt + EXIT_MS, () => done.current())
    }

    return () => timers.forEach(clearTimeout)
  }, [first, reduced])

  return (
    <div className="welcome-screen" data-phase={phase} data-reduced={reduced || undefined}>
      {/* Announced once, in full. The typed characters below are hidden from assistive technology. */}
      <p className="visually-hidden" role="status">
        {first} {SECOND_LINE}
      </p>

      <div className="welcome-text" aria-hidden="true">
        <p className="welcome-title">
          {first.slice(0, typed)}
          {typed < first.length && <span className="welcome-caret" />}
        </p>
        <p className="welcome-line" data-show={showSecond || undefined}>
          {SECOND_LINE}
        </p>
      </div>

      <button type="button" className="welcome-skip" onClick={() => done.current()}>
        Skip
      </button>
    </div>
  )
}
