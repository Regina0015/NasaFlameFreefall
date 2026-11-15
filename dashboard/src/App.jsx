import { useEffect, useState } from 'react'
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

// Phase 1: the login page and a preview shell. A real session opens the shell
// as 'account'; "Explore demo" opens it as a read-only 'demo' (#/demo).
export default function App() {
  const auth = useAuth()
  const { theme, toggle } = useTheme()
  const hash = useHash()
  // The login tab the person chose. It only decides which view opens first.
  const [loginMode, setLoginMode] = useState('student')

  const signedIn = Boolean(auth.session)
  const inDemo = !signedIn && hash === DEMO_HASH

  if (signedIn || inDemo) {
    return (
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
    )
  }

  return (
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
  )
}
