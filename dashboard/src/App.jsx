import { useEffect, useMemo, useRef, useState } from 'react'
import Login from './pages/Login.jsx'
import DemoShell from './pages/DemoShell.jsx'
import { useAuth } from './lib/auth.js'
import { useTheme } from './lib/theme.js'
import { DIVE } from './lib/intro.js'
import { clearEntrySeen, createAttempt, entrySeen, markEntrySeen, prefersReducedMotion } from './lib/entry.js'

const DEMO_HASH = '#/demo'

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)

    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return hash
}

export default function App() {
  const auth = useAuth()
  const { theme, toggle } = useTheme()
  const hash = useHash()
  const [loginMode, setLoginMode] = useState('student')
  // The entry transition after a confirmed sign-in or Explore demo: null, or { phase: 'running' | 'leaving', fast }.
  const [entry, setEntry] = useState(null)
  const [loginKey, setLoginKey] = useState(0)
  const [attempt] = useState(() => createAttempt())
  const entryRunning = useRef(false)

  const signedIn = Boolean(auth.session)
  const inDemo = !signedIn && hash === DEMO_HASH
  const page = signedIn || inDemo ? 'shell' : 'login'

  // A sign-in the person has just made on the login page. A restored session, a token refresh or a
  // session that arrives from elsewhere never has one, so those go straight to the dashboard.
  const arriving = signedIn && !entry && !entryRunning.current && attempt.peek() && !entrySeen() && !prefersReducedMotion()
  const entering = Boolean(entry) || arriving

  const shownPage = useRef(page)

  useEffect(() => {
    if (shownPage.current === page) return

    shownPage.current = page
    if (arriving || entry) return
    document.getElementById('main')?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function beginEntry() {
    if (entryRunning.current || entrySeen() || prefersReducedMotion()) return
    entryRunning.current = true
    markEntrySeen()
    setEntry({ phase: 'running', fast: false })
  }

  useEffect(() => {
    if (!signedIn) return
    if (arriving) beginEntry()
    attempt.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, arriving])

  // Back on the login page (signed out, or history went back): the transition is over and the page resets.
  useEffect(() => {
    if (page !== 'login') return
    clearEntrySeen()
    if (entryRunning.current || entry) {
      entryRunning.current = false
      setEntry(null)
      setLoginKey((value) => value + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // When the transition ends, focus lands on the dashboard's main content.
  const wasEntering = useRef(false)
  useEffect(() => {
    if (wasEntering.current && !entry && page === 'shell') {
      document.getElementById('main')?.focus({ preventScroll: true })
    }
    wasEntering.current = Boolean(entry)
  }, [entry, page])

  // Sign-in and sign-up mark an attempt before they call the service and drop it if they fail.
  const loginAuth = useMemo(
    () => ({
      ...auth,
      signIn: async (...args) => {
        attempt.begin()
        const error = await auth.signIn(...args)
        if (error) attempt.clear()
        return error
      },
      signUp: async (...args) => {
        attempt.begin()
        const result = await auth.signUp(...args)
        if (result.error || result.confirm) attempt.clear()
        return result
      },
    }),
    [auth, attempt],
  )

  const skipLink = (
    <a
      className="skip-link"
      href="#main"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById('main')?.focus()
      }}
    >
      Skip to main content
    </a>
  )

  const showLogin = page === 'login' || entering
  const leaving = entry?.phase === 'leaving'

  return (
    <>
      {skipLink}

      {showLogin && (
        <div
          className="entry-layer"
          data-active={entering || undefined}
          data-leaving={leaving || undefined}
          style={entering ? { '--entry-fade': `${entry?.fast ? DIVE.SKIP_FADE : DIVE.FADE_OUT}s` } : undefined}
        >
          <Login
            key={loginKey}
            auth={loginAuth}
            mode={loginMode}
            onModeChange={setLoginMode}
            theme={theme}
            onToggleTheme={toggle}
            entry={entry}
            onEntryReveal={({ fast }) => setEntry((current) => (current ? { phase: 'leaving', fast } : current))}
            onEntryDone={() => {
              entryRunning.current = false
              setEntry(null)
            }}
            onExploreDemo={() => {
              beginEntry()
              window.location.hash = DEMO_HASH
            }}
          />
        </div>
      )}

      {page === 'shell' && (
        <DemoShell
          mode={signedIn ? 'account' : 'demo'}
          initialView={auth.session?.mode ?? loginMode}
          session={auth.session}
          theme={theme}
          entering={entering ? (leaving ? 'reveal' : 'pending') : undefined}
          onToggleTheme={toggle}
          onLeave={() => {
            window.location.hash = '#/'
            if (signedIn) auth.signOut()
          }}
        />
      )}
    </>
  )
}
