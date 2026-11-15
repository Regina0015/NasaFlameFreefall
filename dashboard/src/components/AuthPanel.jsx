import { useEffect, useRef, useState } from 'react'
import { MIN_PASSWORD_LENGTH, MODES } from '../lib/auth.js'
import { Segmented } from './ui.jsx'

// A short headline always visible, and the longer explanation behind a "Details" link.
const CONNECTION_NOTES = {
  disconnected: {
    title: 'Authentication is not connected',
    body: 'This build has no authentication service configured, so accounts cannot be checked. You can still explore the demo.',
  },
  unreachable: {
    title: 'Sign-in service unreachable',
    body: 'The authentication service did not respond. Reload to try again, or explore the demo.',
  },
  'demo-accounts': {
    title: 'Demo mode — authentication is not connected',
    body: 'No sign-in service is configured. The two local demo accounts are checked in this browser only, so they are not real security. They only choose which view opens.',
  },
}

const MODE_HINTS = {
  student: 'Plain-language view: what each finding means and why it matters.',
  professional: 'Technical view: values, units, number of tests and tested range.',
}

const TITLES = {
  signin: 'Sign in',
  register: 'Create account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
}

const NEUTRAL_RESET = 'If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.'

const looksLikeEmail = (value) => /^\S+@\S+\.\S+$/.test(value)

// What to say when an action needs authentication that this build does not have.
function notConnectedMessage(status, action) {
  if (status === 'demo-accounts') {
    return `${action} is not available in demo mode because authentication is not connected. Use a demo account or explore the demo.`
  }
  if (status === 'unreachable') return 'The authentication service did not respond. Reload to try again, or explore the demo.'
  if (status === 'loading') return 'Still checking the connection. Try again in a moment.'
  return `${action} is not available: authentication is not connected in this build. You can explore the demo instead.`
}

function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id, error, hint) {
  if (error) return `${id}-error`
  return hint ? `${id}-hint` : undefined
}

function PasswordInput({ id, value, onChange, autoComplete, error, hint, inputRef, onToggle, shown }) {
  return (
    <div className="input-with-action">
      <input
        ref={inputRef}
        id={id}
        type={shown ? 'text' : 'password'}
        name={id}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, hint)}
      />
      <button type="button" className="input-action" aria-pressed={shown} aria-controls={id} onClick={onToggle}>
        {shown ? 'Hide' : 'Show'}
        <span className="visually-hidden"> password</span>
      </button>
    </div>
  )
}

export default function AuthPanel({ auth, mode, onModeChange, onExploreDemo, revealed }) {
  const [view, setView] = useState(auth.recovery ? 'reset' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [info, setInfo] = useState(null) // neutral or success message, role="status"
  const [submitting, setSubmitting] = useState(false)
  const headingRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)

  const { status, recovery } = auth
  const note = view === 'signin' ? CONNECTION_NOTES[status] : null

  // A recovery link opens the reset screen; leaving recovery returns to sign in.
  useEffect(() => {
    if (recovery) go('reset')
    else if (view === 'reset') go('signin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recovery])

  // Move focus into the form when it appears after the intro, and to the heading on a view change.
  const wasRevealed = useRef(revealed)
  useEffect(() => {
    if (revealed && !wasRevealed.current && document.activeElement === document.body) {
      ;(emailRef.current ?? passwordRef.current)?.focus()
    }
    wasRevealed.current = revealed
  }, [revealed])

  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    headingRef.current?.focus()
  }, [view])

  function go(next, keep = {}) {
    setView(next)
    setErrors({})
    setFormError(null)
    setInfo(keep.info ?? null)
    setPassword('')
    setConfirm('')
    setShowPassword(false)
    setShowConfirm(false)
  }

  function validate(fields) {
    const next = {}
    if (fields.email) {
      if (!email.trim()) next.email = 'Enter your email address.'
      else if (!looksLikeEmail(email.trim())) next.email = 'Enter a valid email address, like name@example.com.'
    }
    if (fields.password === 'current' && !password) next.password = 'Enter your password.'
    if (fields.password === 'new') {
      if (!password) next.password = 'Enter a password.'
      else if (password.length < MIN_PASSWORD_LENGTH) next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    if (fields.confirm) {
      if (!confirm) next.confirm = 'Repeat your password.'
      else if (confirm !== password) next.confirm = 'The passwords do not match.'
    }
    setErrors(next)
    if (next.email) emailRef.current?.focus()
    else if (next.password) passwordRef.current?.focus()
    else if (next.confirm) confirmRef.current?.focus()
    return Object.keys(next).length === 0
  }

  async function run(action) {
    setFormError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      await action()
    } finally {
      setSubmitting(false)
    }
  }

  const connected = status === 'ready'

  function submitSignIn(event) {
    event.preventDefault()
    if (submitting) return
    if (!validate({ email: true, password: 'current' })) return
    if (status !== 'ready' && status !== 'demo-accounts') return setFormError(notConnectedMessage(status, 'Sign-in'))
    run(async () => {
      const error = await auth.signIn(email.trim(), password, mode)
      if (error) setFormError(error)
      else setInfo('Signed in. Opening the dashboard…')
    })
  }

  function submitRegister(event) {
    event.preventDefault()
    if (submitting) return
    if (!validate({ email: true, password: 'new', confirm: true })) return
    if (!connected) return setFormError(notConnectedMessage(status, 'Account creation'))
    run(async () => {
      const result = await auth.signUp(email.trim(), password)
      if (result.error) return setFormError(result.error)
      setPassword('')
      setConfirm('')
      setInfo(
        result.confirm
          ? 'Check your email to finish creating your account.'
          : 'Account created. Opening the dashboard…',
      )
    })
  }

  function submitForgot(event) {
    event.preventDefault()
    if (submitting) return
    if (!validate({ email: true })) return
    if (!connected) return setFormError(notConnectedMessage(status, 'Password reset'))
    run(async () => {
      const error = await auth.requestReset(email.trim())
      if (error) setFormError(error)
      else setInfo(NEUTRAL_RESET)
    })
  }

  function submitReset(event) {
    event.preventDefault()
    if (submitting) return
    if (!validate({ password: 'new', confirm: true })) return
    run(async () => {
      const error = await auth.updatePassword(password)
      if (error) setFormError(error)
      else go('signin', { info: 'Password updated. Sign in with your new password.' })
    })
  }

  const busy = submitting
  const emailField = (autoComplete) => (
    <Field id="auth-email" label="Email" error={errors.email}>
      <input
        ref={emailRef}
        id="auth-email"
        type="email"
        name="email"
        autoComplete={autoComplete}
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={errors.email ? 'true' : undefined}
        aria-describedby={describedBy('auth-email', errors.email)}
      />
    </Field>
  )

  const messages = (
    <>
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {info && (
        <p className="form-success" role="status">
          {info}
        </p>
      )}
    </>
  )

  const backToSignIn = (
    <button type="button" className="btn btn-ghost" onClick={() => go('signin')}>
      Back to sign in
    </button>
  )

  return (
    <div className="cine-glass" inert={!revealed || undefined} data-view={view}>
      <h2 className="cine-title" ref={headingRef} tabIndex={-1}>
        {TITLES[view]}
      </h2>

      {(view === 'signin' || view === 'register') && (
        <>
          <Segmented label="Experience" options={MODES} value={mode} onChange={onModeChange} />
          {view === 'signin' && (
            <p className="muted cine-hint" aria-live="polite">
              {MODE_HINTS[mode]}
            </p>
          )}
        </>
      )}

      {note && (
        <div className="notice notice-compact" role="status">
          <strong>{note.title}</strong>
          <details>
            <summary>Details</summary>
            <p>{note.body}</p>
          </details>
        </div>
      )}

      {view === 'signin' && (
        <form onSubmit={submitSignIn} noValidate aria-busy={busy}>
          <fieldset disabled={busy} className="fields">
            <legend className="visually-hidden">Sign in to FlameTrace</legend>
            {emailField('username')}
            <Field id="auth-password" label="Password" error={errors.password}>
              <PasswordInput
                id="auth-password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                error={errors.password}
                inputRef={passwordRef}
                shown={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </Field>
            <button type="button" className="link-button" onClick={() => go('forgot')}>
              Forgot password?
            </button>
          </fieldset>
          {messages}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : `Sign in as ${MODES.find((m) => m.id === mode).label.toLowerCase()}`}
          </button>
          <div className="divider" role="presentation">
            <span>or</span>
          </div>
          <div className="cine-alt">
            <button type="button" className="btn btn-secondary" onClick={onExploreDemo}>
              Explore demo
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => go('register')}>
              Create account
            </button>
          </div>
        </form>
      )}

      {view === 'register' && (
        <form onSubmit={submitRegister} noValidate aria-busy={busy}>
          <fieldset disabled={busy} className="fields">
            <legend className="visually-hidden">Create a FlameTrace account</legend>
            {emailField('email')}
            <Field id="auth-password" label="Password" error={errors.password} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
              <PasswordInput
                id="auth-password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                error={errors.password}
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                inputRef={passwordRef}
                shown={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </Field>
            <Field id="auth-confirm" label="Repeat password" error={errors.confirm}>
              <PasswordInput
                id="auth-confirm"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                error={errors.confirm}
                inputRef={confirmRef}
                shown={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
            </Field>
          </fieldset>
          {messages}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          {backToSignIn}
        </form>
      )}

      {view === 'forgot' && (
        <form onSubmit={submitForgot} noValidate aria-busy={busy}>
          <p className="muted cine-hint">Enter your email and we will send a link to choose a new password.</p>
          <fieldset disabled={busy} className="fields">
            <legend className="visually-hidden">Request a password reset</legend>
            {emailField('email')}
          </fieldset>
          {messages}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          {backToSignIn}
        </form>
      )}

      {view === 'reset' && recovery === 'checking' && (
        <p className="muted" role="status">
          Checking your reset link…
        </p>
      )}

      {view === 'reset' && recovery === 'invalid' && (
        <div className="cine-stack">
          <p className="form-error" role="alert">
            This reset link is invalid or has expired. Request a new one.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await auth.cancelRecovery()
              go('forgot')
            }}
          >
            Request a new link
          </button>
        </div>
      )}

      {view === 'reset' && recovery === 'ready' && (
        <form onSubmit={submitReset} noValidate aria-busy={busy}>
          <fieldset disabled={busy} className="fields">
            <legend className="visually-hidden">Choose a new password</legend>
            <Field id="auth-password" label="New password" error={errors.password} hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
              <PasswordInput
                id="auth-password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                error={errors.password}
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                inputRef={passwordRef}
                shown={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </Field>
            <Field id="auth-confirm" label="Repeat new password" error={errors.confirm}>
              <PasswordInput
                id="auth-confirm"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                error={errors.confirm}
                inputRef={confirmRef}
                shown={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
            </Field>
          </fieldset>
          {messages}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await auth.cancelRecovery()
            }}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}
