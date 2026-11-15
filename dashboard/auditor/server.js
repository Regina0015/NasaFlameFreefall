// Read-only proxy to the Auditor gateway (api/), mounted by vite.config.js at /api/auditor
// (npm run dev and npm run preview). This is the documented architecture (DASHBOARD.md section 8): the gateway needs
// an X-API-Key, and anything in the browser bundle is public, so the browser never sees the gateway address or key.
//
//   GET /api/auditor/health            -> gateway /health
//   GET /api/auditor/findings          -> gateway /findings   (?include_rejected=true)
//   GET /api/auditor/findings/F-001    -> gateway /findings/F-001
//   GET /api/auditor/audits            -> gateway /audits
//   GET /api/auditor/audits/F-001      -> gateway /audits/F-001
//
// Server-side variables (never VITE_): AUDITOR_URL and AUDITOR_API_KEY. Nothing else is forwarded: not the browser's
// headers, not other paths, not other methods. A missing setting, an unreachable gateway and a rejected key all
// come back as errors, never as a grade.

const FINDING_ID = /^F-\d{3}$/
const TIMEOUT_MS = 8000

// Maps the incoming path to the gateway path, or null when it is not on the allowlist.
export function gatewayPath(pathname, searchParams) {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  if (parts.length === 1 && parts[0] === 'health') return '/health'
  if (parts.length === 1 && parts[0] === 'audits') return '/audits'
  if (parts.length === 1 && parts[0] === 'findings') return searchParams.get('include_rejected') === 'true' ? '/findings?include_rejected=true' : '/findings'
  if (parts.length === 2 && ['findings', 'audits'].includes(parts[0]) && FINDING_ID.test(parts[1])) return `/${parts[0]}/${parts[1]}`
  return null
}

export function missingSettings(env) {
  return ['AUDITOR_URL', 'AUDITOR_API_KEY'].filter((name) => !env[name])
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function createAuditorHandler(env, fetchImpl = fetch) {
  return async function handler(req, res) {
    if (req.method !== 'GET') return send(res, 405, { error: 'Use GET.' })

    const url = new URL(req.url, 'http://local')
    const path = gatewayPath(url.pathname, url.searchParams)
    if (!path) return send(res, 404, { error: 'This path is not part of the Auditor proxy.' })

    const missing = missingSettings(env)
    if (missing.length) {
      return send(res, 503, { error: `The Auditor gateway is not configured. Set ${missing.join(' and ')} in the server environment (not a VITE_ variable).`, missing })
    }

    let base
    try {
      base = new URL(env.AUDITOR_URL)
      if (!['http:', 'https:'].includes(base.protocol)) throw new Error('not http')
    } catch {
      return send(res, 503, { error: 'AUDITOR_URL is not a valid http(s) address.', missing: [] })
    }

    // /health needs no key; every other route sends it. The key never leaves this server.
    const headers = path === '/health' ? {} : { 'X-API-Key': env.AUDITOR_API_KEY }
    let upstream
    try {
      upstream = await fetchImpl(new URL(path, base.origin + base.pathname.replace(/\/?$/, '/')), { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      return send(res, 502, { error: `The Auditor gateway could not be reached (${error?.name === 'TimeoutError' ? 'timed out' : 'network error'}).` })
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return send(res, 502, { error: 'The Auditor gateway rejected the server\'s API key. Check AUDITOR_API_KEY.' })
    }
    let body
    try {
      body = await upstream.json()
    } catch {
      return send(res, 502, { error: 'The Auditor gateway returned something that is not JSON.' })
    }
    if (!upstream.ok) return send(res, upstream.status === 404 ? 404 : 502, { error: body?.detail ?? `The Auditor gateway answered ${upstream.status}.` })
    return send(res, 200, body)
  }
}
