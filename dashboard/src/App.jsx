import { useEffect, useRef, useState } from 'react'
import Login from './pages/Login.jsx'
import DemoShell from './pages/DemoShell.jsx'
import { useAuth } from './lib/auth.js'
import { useTheme } from './lib/theme.js'

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

  const signedIn = Boolean(auth.session)
  const inDemo = !signedIn && hash === DEMO_HASH
  const page = signedIn || inDemo ? 'shell' : 'login'

  const shownPage = useRef(page)

  useEffect(() => {
    if (shownPage.current === page) return

    shownPage.current = page
    document.getElementById('main')?.focus()
  }, [page])

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

  if (page === 'shell') {
    return (
      <>
        {skipLink}

        <DemoShell
          mode={signedIn ? 'account' : 'demo'}
          initialView={auth.session?.mode ?? loginMode}
          session={auth.session}
          theme={theme}
          onToggleTheme={toggle}
          onLeave={() => {
            window.location.hash = '#/'
            if (signedIn) auth.signOut()
          }}
        />
      </>
    )
  }

  return (
    <>
      {skipLink}

      <Login
        auth={auth}
        mode={loginMode}
        onModeChange={setLoginMode}
        theme={theme}
        onToggleTheme={toggle}
        onExploreDemo={() => {
          window.location.hash = DEMO_HASH
        }}
      />
    </>
  )
}