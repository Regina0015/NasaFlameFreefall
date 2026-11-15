// Post-login entry transition: one-shot bookkeeping. The cinematic plays once per entry from the login page,
// never on refresh, token refresh, workspace changes or browser history moves. The flag is set when the
// transition starts and cleared whenever the login page is shown again.

const SEEN_KEY = 'flametrace-welcome-seen'
const ATTEMPT_WINDOW_MS = 20000 // a sign-in this recent may turn into the entry transition

export function entrySeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markEntrySeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Without storage the cinematic cannot replay on refresh anyway: the session is restored directly.
  }
}

export function clearEntrySeen() {
  try {
    sessionStorage.removeItem(SEEN_KEY)
  } catch {
    // Nothing stored.
  }
}

export function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Tracks a sign-in the person just made on the login page, so the transition starts only for that
 * and not for a restored session, a token refresh or a session that arrives from elsewhere.
 */
export function createAttempt(now = () => Date.now()) {
  let at = 0
  return {
    begin() {
      at = now()
    },
    clear() {
      at = 0
    },
    // True while a recent sign-in attempt is pending (does not consume it).
    peek() {
      return at > 0 && now() - at <= ATTEMPT_WINDOW_MS
    },
    // Consumes the attempt: true once per begin(), and only while it is recent.
    take() {
      const recent = at > 0 && now() - at <= ATTEMPT_WINDOW_MS
      at = 0
      return recent
    },
  }
}
