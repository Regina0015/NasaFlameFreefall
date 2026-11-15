import { lazy, Suspense, useRef, useState } from 'react'
import { Brand, Segmented, ThemeToggle } from '../components/ui.jsx'
import { MODES } from '../lib/auth.js'

const StationViewer = lazy(() => import('../components/StationViewer.jsx'))

const CONNECTION_NOTES = {
  disconnected: {
    title: 'Sign-in is not connected',
    body: 'This build has no authentication service configured, so accounts cannot be checked. You can still explore the demo.',
  },
  unreachable: {
    title: 'Sign-in service unreachable',
    body: 'The authentication service did not respond. Reload to try again, or explore the demo.',
  },
  'demo-accounts': {
    title: 'Local demo accounts',
    body: 'No sign-in service is configured. The two demo accounts are checked in this browser only, so they are not real security. They choose which view opens.',
  },
}

const MODE_HINTS = {
  student: 'Opens the plain-language view: what each finding means and why it matters.',
  professional: 'Opens the technical view: values, units, number of tests and tested range.',
}

export default function Login({ auth, mode, onModeChange, theme, onToggleTheme, onExploreDemo }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  const connected = auth.status === 'ready' || auth.status === 'demo-accounts'
  const checking = auth.status === 'loading'
  const note = CONNECTION_NOTES[auth.status]

  async function handleSubmit(event) {
    event.preventDefault()
    if (!connected || submitting) return

    // Only checks that the fields are filled in. The service decides if they are valid.
    const errors = {}
    if (!email.trim()) errors.email = 'Enter your email address.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    setFormError(null)
    if (errors.email) return emailRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()

    setSubmitting(true)
    const error = await auth.signIn(email.trim(), password, mode)
    setSubmitting(false)
    if (error) setFormError(error)
  }

  return (
    <div className="login">
      <section className="login-stage" aria-label="About this project">
        <div className="stage-backdrop" aria-hidden="true" />
        <div className="stage-model">
          <Suspense fallback={null}>
            <StationViewer label="Conceptual 3D model of a space station, slowly rotating" />
          </Suspense>
        </div>
        <div className="stage-frame" aria-hidden="true" />

        <header className="stage-top">
          <Brand />
          <span className="tag">NASA Space Apps 2026</span>
        </header>

        <div className="stage-copy">
          <h1>Fire-safety evidence from microgravity combustion</h1>
          <p>
            Summaries and findings drawn from NASA&rsquo;s PSI combustion investigations. Every result is shown with
            its proof chain and an audit grade.
          </p>
          <p className="stage-note">Conceptual station model. Not a real spacecraft and not live telemetry.</p>
        </div>
      </section>

      <main className="login-panel" id="main">
        <div className="login-panel-top">
          <span className="eyebrow">Research access</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <div className="login-card">
          <h2>Sign in</h2>
          <Segmented
            label="Sign-in mode"
            options={MODES}
            value={mode}
            onChange={(next) => {
              onModeChange(next)
              setFormError(null)
            }}
          />
          <p className="muted" aria-live="polite">
            {MODE_HINTS[mode]}
          </p>

          {note && (
            <div className="notice" role="status">
              <strong>{note.title}</strong>
              <span>{note.body}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
            <fieldset disabled={!connected || submitting} className="fields">
              <legend className="visually-hidden">Account credentials</legend>

              <div className="field">
                <label htmlFor="login-email">Email</label>
                <input
                  ref={emailRef}
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={fieldErrors.email ? 'true' : undefined}
                  aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                />
                {fieldErrors.email && (
                  <p className="field-error" id="login-email-error">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="login-password">Password</label>
                <div className="input-with-action">
                  <input
                    ref={passwordRef}
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={fieldErrors.password ? 'true' : undefined}
                    aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="input-action"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                    <span className="visually-hidden"> password</span>
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="field-error" id="login-password-error">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            </fieldset>

            {formError && (
              <p className="form-error" role="alert">
                Sign-in failed: {formError}
              </p>
            )}

            <button type="submit" className={`btn ${connected ? 'btn-primary' : 'btn-secondary'}`} disabled={!connected || submitting}>
              {submitting ? 'Signing in…' : checking ? 'Checking connection…' : `Sign in as ${MODES.find((m) => m.id === mode).label.toLowerCase()}`}
            </button>
          </form>

          <div className="divider" role="presentation">
            <span>or</span>
          </div>

          <button type="button" className={`btn ${connected ? 'btn-secondary' : 'btn-primary'}`} onClick={onExploreDemo}>
            Explore demo
          </button>
          <p className="helper">No account needed. The demo is read-only and uses the sample data bundled with the app.</p>
        </div>

        <p className="login-foot">NasaTwisters · Flame in Freefall</p>
      </main>
    </div>
  )
}
