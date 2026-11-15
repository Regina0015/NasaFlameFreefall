import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const UNREACHABLE = 'The sign-in service could not be reached. Check your connection and try again.'
const NOT_CONNECTED = 'Authentication is not connected in this build, so this action is not available. You can explore the demo instead.'
const LOCAL_KEY = 'nasatwisters-demo-session'

export const MODES = [
  { id: 'student', label: 'Student' },
  { id: 'professional', label: 'Professional' },
]

export const MIN_PASSWORD_LENGTH = 8

// Optional local demo accounts, read from dashboard/.env.local (git-ignored).
// They are compared in the browser, so they are not real security: anyone can
// read the bundle. They only choose which view the dashboard opens in.
const env = import.meta.env
const DEMO_ACCOUNTS = [
  { mode: 'student', email: env.VITE_DEMO_STUDENT_EMAIL, password: env.VITE_DEMO_STUDENT_PASSWORD },
  { mode: 'professional', email: env.VITE_DEMO_PRO_EMAIL, password: env.VITE_DEMO_PRO_PASSWORD },
].filter((account) => account.email && account.password)

// A password-recovery link lands on this page with the result in the URL. Read it once,
// before the auth client rewrites the address.
function readRecoveryFromUrl() {
  if (!supabase) return null
  const raw = `${window.location.hash} ${window.location.search}`
  if (/error_code=|error=access_denied/.test(raw)) return 'invalid'
  if (/type=recovery/.test(raw)) return 'checking'
  return null
}
const INITIAL_RECOVERY = readRecoveryFromUrl()

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
  if (supabase) return { status: 'loading', session: null, recovery: INITIAL_RECOVERY }
  if (DEMO_ACCOUNTS.length) return { status: 'demo-accounts', session: readLocalSession(), recovery: null }
  return { status: 'disconnected', session: null, recovery: null }
}

// Where the recovery email sends the person back to (no hash, so it never collides with routing).
function recoveryRedirect() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

// Auth has three states:
//   Supabase configured  -> real authentication (status 'ready').
//   demo accounts in env -> local demo accounts (status 'demo-accounts').
//   neither              -> 'disconnected': nobody can sign in.
// A session is { email, mode, local }. `mode` only picks the view the dashboard
// opens in. It never grants access: what a user may read is decided by the
// database policies, not by the browser.
//
// `recovery` is null, or 'checking' | 'ready' | 'invalid' while a password-recovery link is
// being handled. During recovery the exposed `session` stays null so the app does not open
// the dashboard before the password is changed.
export function useAuth() {
  const [state, setState] = useState(initialState)
  const recoveryRef = useRef(INITIAL_RECOVERY)

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const toSession = (s) => (s && !recoveryRef.current ? { email: s.user?.email, mode: null, local: false } : null)
    const publish = (s) => {
      if (active) setState({ status: 'ready', session: toSession(s), recovery: recoveryRef.current })
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        // The recovery link must have produced a session; otherwise it is invalid or expired.
        if (recoveryRef.current === 'checking') recoveryRef.current = data.session ? 'ready' : 'invalid'
        publish(data.session)
      })
      .catch(() => {
        if (active) setState({ status: 'unreachable', session: null, recovery: null })
      })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveryRef.current = 'ready'
      publish(session)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // Each action returns null on success, or a message to show.
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
    setState({ status: 'demo-accounts', session, recovery: null })
    return null
  }, [])

  // Creates an account. `confirm` tells the caller whether an email confirmation is pending.
  const signUp = useCallback(async (email, password) => {
    if (!supabase) return { error: NOT_CONNECTED }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return { error: error.status ? error.message : UNREACHABLE }
      return { error: null, confirm: !data.session }
    } catch {
      return { error: UNREACHABLE }
    }
  }, [])

  // Sends a recovery email. The caller shows the same neutral message either way.
  const requestReset = useCallback(async (email) => {
    if (!supabase) return NOT_CONNECTED
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect() })
      if (!error) return null
      // Only failures that say nothing about the account are shown (network, rate limit).
      return error.status === 429 ? 'Too many requests. Wait a moment and try again.' : error.status ? null : UNREACHABLE
    } catch {
      return UNREACHABLE
    }
  }, [])

  // Sets a new password. The recovery session is checked again right before the update.
  const updatePassword = useCallback(async (password) => {
    if (!supabase) return NOT_CONNECTED
    try {
      const { data } = await supabase.auth.getSession()
      if (recoveryRef.current !== 'ready' || !data.session) {
        recoveryRef.current = 'invalid'
        setState((s) => ({ ...s, recovery: 'invalid' }))
        return 'This reset link is invalid or has expired. Request a new one.'
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) return error.status ? error.message : UNREACHABLE
      // End the recovery session so the person signs in with the new password.
      recoveryRef.current = null
      await supabase.auth.signOut()
      setState((s) => ({ ...s, session: null, recovery: null }))
      return null
    } catch {
      return UNREACHABLE
    }
  }, [])

  // Leaves the recovery screen without changing the password.
  const cancelRecovery = useCallback(async () => {
    recoveryRef.current = null
    if (supabase) await supabase.auth.signOut().catch(() => {})
    setState((s) => ({ ...s, session: null, recovery: null }))
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

  return { ...state, signIn, signUp, requestReset, updatePassword, cancelRecovery, signOut }
}
