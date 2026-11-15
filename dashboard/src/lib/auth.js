import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const UNREACHABLE = 'The sign-in service could not be reached. Check your connection and try again.'
const LOCAL_KEY = 'nasatwisters-demo-session'

export const MODES = [
  { id: 'student', label: 'Student' },
  { id: 'professional', label: 'Professional' },
]

// Optional local demo accounts, read from dashboard/.env.local (git-ignored).
// They are compared in the browser, so they are not real security: anyone can
// read the bundle. They only choose which view the dashboard opens in.
const env = import.meta.env
const DEMO_ACCOUNTS = [
  { mode: 'student', email: env.VITE_DEMO_STUDENT_EMAIL, password: env.VITE_DEMO_STUDENT_PASSWORD },
  { mode: 'professional', email: env.VITE_DEMO_PRO_EMAIL, password: env.VITE_DEMO_PRO_PASSWORD },
].filter((account) => account.email && account.password)

function readLocalSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LOCAL_KEY))
    if (saved && DEMO_ACCOUNTS.some((a) => a.mode === saved.mode && a.email === saved.email)) return saved
  } catch {
    // No saved session.
  }
  return null
}

function initialState() {
  if (supabase) return { status: 'loading', session: null }
  if (DEMO_ACCOUNTS.length) return { status: 'demo-accounts', session: readLocalSession() }
  return { status: 'disconnected', session: null }
}

// Sign-in has three states:
//   Supabase configured  -> real authentication (status 'ready').
//   demo accounts in env -> local demo accounts (status 'demo-accounts').
//   neither              -> 'disconnected': nobody can sign in.
// A session is { email, mode, local }. `mode` only picks the view the dashboard
// opens in. It never grants access: what a user may read is decided by the
// database policies, not by the browser.
export function useAuth() {
  const [state, setState] = useState(initialState)

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const toSession = (s) => (s ? { email: s.user?.email, mode: null, local: false } : null)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState({ status: 'ready', session: toSession(data.session) })
      })
      .catch(() => {
        if (active) setState({ status: 'unreachable', session: null })
      })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ status: 'ready', session: toSession(session) })
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // Returns null on success, or a message to show.
  const signIn = useCallback(async (email, password, mode) => {
    if (supabase) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error) return null
        // A network failure comes back as an error with no HTTP status.
        return error.status ? error.message : UNREACHABLE
      } catch {
        return UNREACHABLE
      }
    }

    if (!DEMO_ACCOUNTS.length) return 'Sign-in is not connected in this build.'
    const account = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password)
    if (!account) return 'That email and password do not match a demo account.'
    if (account.mode !== mode) {
      const label = MODES.find((m) => m.id === account.mode).label
      return `That is the ${label} demo account. Switch to the ${label} tab to use it.`
    }
    const session = { email: account.email, mode: account.mode, local: true }
    try {
      sessionStorage.setItem(LOCAL_KEY, JSON.stringify(session))
    } catch {
      // Not persisted; the session lasts until the page reloads.
    }
    setState({ status: 'demo-accounts', session })
    return null
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
      return
    }
    try {
      sessionStorage.removeItem(LOCAL_KEY)
    } catch {
      // Nothing stored.
    }
    setState((s) => ({ ...s, session: null }))
  }, [])

  return { ...state, signIn, signOut }
}
