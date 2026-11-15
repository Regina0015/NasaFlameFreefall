import { classify } from './eligibility.js'

// Findings source adapters. Each one answers { id, label, status, message, findings }:
//   status 'ok'          -> findings is an array of { id, finding, audit, auditStatus, auditNote }
//   status 'unavailable' -> this source cannot supply findings here; message says exactly why
// Adapters are tried in order and the first that is ok is used. To connect a real source later (for example
// a findings table in the database), add an adapter to ADAPTERS; nothing else has to change.
// Nothing is invented: if no adapter is ok, the dashboard shows an honest empty state with every reason.

// The database has no findings table yet (supabase/schema.sql defines investigations, tests and relations only)
// and the publish step (stage 06) is a stub, so there is nothing to read. This adapter says so and does not query.
export const databaseAdapter = {
  id: 'database',
  label: 'Database',
  async load() {
    return {
      status: 'unavailable',
      message: 'The database has no findings table yet, and the publish step (stage 06) is not built.',
    }
  },
}

// Findings and matching audits read from the repository's files by the local dev server (/api/findings).
// It exists only with `npm run dev` or `npm run preview`, never on Vercel.
export const localFilesAdapter = {
  id: 'local-files',
  label: 'Local repository files',
  async load({ fetchImpl = fetch } = {}) {
    let response
    try {
      response = await fetchImpl('/api/findings', { headers: { Accept: 'application/json' } })
    } catch {
      return { status: 'unavailable', message: 'The local findings endpoint could not be reached.' }
    }

    let body
    try {
      body = await response.json()
    } catch {
      return {
        status: 'unavailable',
        message: 'The local findings endpoint does not exist here. It only runs with npm run dev, not on a deployed site.',
      }
    }

    if (!response.ok) return { status: 'unavailable', message: body?.error || `The local findings endpoint answered ${response.status}.` }
    if (!Array.isArray(body?.findings)) return { status: 'unavailable', message: 'The local findings endpoint returned an unexpected shape.' }
    return { status: 'ok', findings: body.findings, generatedAt: body.generatedAt ?? null }
  },
}

// Findings and grades from the Auditor gateway, read through the server-side proxy (/api/auditor). The proxy holds the
// gateway address and API key; the browser never sees them. A grade counts only when the gateway says the audit is
// not stale AND the full audit it returns names the same finding version, SHA-256 and grade. Anything else is
// "not audited yet", never a grade. A missing setting, an unreachable gateway or a rejected key makes this source
// unavailable.
export const auditorGatewayAdapter = {
  id: 'auditor-gateway',
  label: 'Auditor gateway',
  async load({ fetchImpl = fetch } = {}) {
    const get = async (path) => {
      const response = await fetchImpl(`/api/auditor${path}`, { headers: { Accept: 'application/json' } })
      let body = null
      try {
        body = await response.json()
      } catch {
        // Not JSON: handled below.
      }
      return { response, body }
    }

    let listing
    try {
      listing = await get('/findings?include_rejected=true')
    } catch {
      return { status: 'unavailable', message: 'The Auditor proxy could not be reached.' }
    }
    if (!listing.body) return { status: 'unavailable', message: 'The Auditor proxy does not exist here. It only runs with npm run dev.' }
    if (!listing.response.ok) return { status: 'unavailable', message: listing.body.error || `The Auditor proxy answered ${listing.response.status}.` }
    const rows = listing.body.findings
    if (!Array.isArray(rows) || !rows.every((r) => r && typeof r.finding_id === 'string' && r.finding && typeof r.finding === 'object')) {
      return { status: 'unavailable', message: 'The Auditor gateway returned an unexpected shape.' }
    }

    const entries = await Promise.all(
      rows.map(async (row) => {
        const id = row.finding_id
        const base = { id, finding: row.finding, sha256: row.finding_sha256 ?? null, audit: null }
        if (row.grade === 'pending audit') return { ...base, auditStatus: 'none', auditNote: 'The gateway has no audit for this finding yet.' }
        if (row.stale_audit) return { ...base, auditStatus: 'stale', auditNote: 'The gateway says this finding changed after its audit, so the audit verifies nothing.' }
        try {
          const { response, body } = await get(`/audits/${id}`)
          const audit = body?.audit
          if (!response.ok || !audit) throw new Error('no audit')
          const same = audit.finding_version === row.finding?.version && audit.finding_sha256 === row.finding_sha256 && audit.grade === row.grade
          if (!same) {
            return { ...base, auditStatus: 'stale', auditNote: 'The audit the gateway returned does not match this version of the finding (version, SHA-256 or grade differ).' }
          }
          return { ...base, audit, auditStatus: 'matched', auditNote: `Audit of version ${audit.finding_version} matches this finding (SHA-256 verified by the gateway and checked again here).` }
        } catch {
          return { ...base, auditStatus: 'stale', auditNote: 'The full audit could not be read from the gateway, so no grade is shown.' }
        }
      }),
    )
    return { status: 'ok', findings: entries, generatedAt: new Date().toISOString() }
  },
}

export const ADAPTERS = [databaseAdapter, auditorGatewayAdapter, localFilesAdapter]

// Tries each adapter in order and classifies what the first usable one returns.
export async function loadFindings({ adapters = ADAPTERS, fetchImpl, policy } = {}) {
  const attempts = []
  for (const adapter of adapters) {
    let result
    try {
      result = await adapter.load({ fetchImpl })
    } catch (error) {
      result = { status: 'unavailable', message: error?.message || 'The source failed.' }
    }
    attempts.push({ id: adapter.id, label: adapter.label, status: result.status, message: result.message ?? null })
    if (result.status === 'ok') {
      const items = result.findings.map((entry) => ({ ...entry, verdict: classify(entry, policy) }))
      return { source: { id: adapter.id, label: adapter.label, generatedAt: result.generatedAt ?? null }, items, attempts }
    }
  }
  return { source: null, items: [], attempts }
}
