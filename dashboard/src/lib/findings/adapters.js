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

export const ADAPTERS = [databaseAdapter, localFilesAdapter]

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
