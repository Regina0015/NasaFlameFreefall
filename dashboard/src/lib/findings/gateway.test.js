// MOCKED tests: they use fake gateway responses to check the dashboard's own rules. They do not touch a real gateway.
import test from 'node:test'
import assert from 'node:assert/strict'
import { auditorGatewayAdapter, loadFindings } from './adapters.js'
import { createAuditorHandler, gatewayPath } from '../../../auditor/server.js'

const SHA = 'a'.repeat(64)
const finding = (id) => ({
  id, version: 1, question: 'Q?', status: 'has_data', claim: 'C.', summary_student: 's', summary_professional: 'p',
  values: { n: { value: 3, unit: 'tests' } },
  method: { script: 'x.py', function: 'f', params: {}, formula: 'count' },
  evidence: [{ investigation: 'PSI-1', doi: '10.1/x', table: 't.csv', columns: ['a'], rows: 'all' }],
  n_tests: 3, assumptions: [], limitations: ['L'], warnings: [], environments: [], tier: 1, pillar: null,
  visual_offer: { chart: { available: false, idea: null }, graph: { available: false, idea: null }, footnote: null },
  chart: null, graph: null, generated_by: { agent: 'a', model: 'm', date: '2026-01-01T00:00:00Z' },
})
const row = (id, over = {}) => ({ finding_id: id, finding_version: 1, grade: 'C', failed_checks: ['C8'], stale_audit: false, finding_sha256: SHA, finding: finding(id), ...over })
const audit = (id, over = {}) => ({ audit: { finding_id: id, finding_version: 1, finding_sha256: SHA, grade: 'C', checks: [{ id: 'C9', result: 'not_applicable' }], reasons: [], ...over } })

const router = (map) => async (url) => {
  const hit = map[String(url).replace('/api/auditor', '')]
  return hit ? Response.json(hit.body, { status: hit.status ?? 200 }) : Response.json({ error: 'not found' }, { status: 404 })
}

test('gateway adapter: a matching audit is accepted; stale, pending and mismatched ones are not', async () => {
  const fetchImpl = router({
    '/findings?include_rejected=true': {
      body: {
        findings: [row('F-900'), row('F-901', { stale_audit: true }), row('F-902', { grade: 'pending audit' }), row('F-903'), row('F-904', { grade: 'rejected' })],
      },
    },
    '/audits/F-900': { body: audit('F-900') },
    '/audits/F-903': { body: audit('F-903', { finding_sha256: 'b'.repeat(64) }) },
    '/audits/F-904': { body: audit('F-904', { grade: 'rejected' }) },
  })
  const result = await loadFindings({ adapters: [auditorGatewayAdapter], fetchImpl })
  const by = Object.fromEntries(result.items.map((i) => [i.id, i.verdict]))
  assert.equal(result.source.id, 'auditor-gateway')
  assert.equal(by['F-900'].category, 'indication')
  assert.equal(by['F-901'].grade, null) // stale
  assert.equal(by['F-902'].category, 'pending')
  assert.equal(by['F-903'].grade, null) // SHA-256 differs from the audit
  assert.equal(by['F-904'].category, 'withheld') // rejected is never a result
})

test('gateway adapter: not configured or unreachable is reported, never turned into a grade', async () => {
  const notConfigured = await auditorGatewayAdapter.load({ fetchImpl: async () => Response.json({ error: 'The Auditor gateway is not configured. Set AUDITOR_URL and AUDITOR_API_KEY' }, { status: 503 }) })
  assert.equal(notConfigured.status, 'unavailable')
  assert.match(notConfigured.message, /AUDITOR_URL/)
  assert.equal((await auditorGatewayAdapter.load({ fetchImpl: async () => { throw new Error('offline') } })).status, 'unavailable')
  assert.equal((await auditorGatewayAdapter.load({ fetchImpl: async () => new Response('<html>', { status: 200 }) })).status, 'unavailable')
})

function call(handler, url, method = 'GET') {
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v
      },
      end(body) {
        resolve({ status: this.statusCode, body: JSON.parse(body) })
      },
    }
    handler({ url, method }, res)
  })
}

test('auditor proxy: allowlist, the key stays server-side, errors are honest', async () => {
  assert.equal(gatewayPath('/findings', new URLSearchParams()), '/findings')
  assert.equal(gatewayPath('/audits/F-001', new URLSearchParams()), '/audits/F-001')
  assert.equal(gatewayPath('/audits/../../etc/passwd', new URLSearchParams()), null)
  assert.equal(gatewayPath('/audit', new URLSearchParams()), null)

  const seen = []
  const upstream = async (url, init) => {
    seen.push({ url: String(url), key: init.headers['X-API-Key'] ?? null })
    return Response.json({ findings: [] })
  }
  const env = { AUDITOR_URL: 'http://gateway.local:8000', AUDITOR_API_KEY: 'SECRET-KEY-VALUE' }

  const ok = await call(createAuditorHandler(env, upstream), '/findings?include_rejected=true')
  assert.equal(ok.status, 200)
  assert.equal(JSON.stringify(ok).includes('SECRET-KEY-VALUE'), false)
  assert.equal(seen[0].key, 'SECRET-KEY-VALUE')
  assert.equal(seen[0].url, 'http://gateway.local:8000/findings?include_rejected=true')

  await call(createAuditorHandler(env, upstream), '/health')
  assert.equal(seen[1].key, null) // /health needs no key

  assert.equal((await call(createAuditorHandler(env, upstream), '/findings', 'POST')).status, 405)
  assert.equal((await call(createAuditorHandler(env, upstream), '/secrets')).status, 404)

  const none = await call(createAuditorHandler({}, upstream), '/findings')
  assert.equal(none.status, 503)
  assert.deepEqual(none.body.missing, ['AUDITOR_URL', 'AUDITOR_API_KEY'])

  const wrongKey = await call(createAuditorHandler(env, async () => Response.json({ detail: 'Missing or wrong X-API-Key header.' }, { status: 401 })), '/findings')
  assert.equal(wrongKey.status, 502)
  assert.equal(JSON.stringify(wrongKey).includes('SECRET-KEY-VALUE'), false)

  assert.equal((await call(createAuditorHandler(env, async () => { throw new Error('ECONNREFUSED') }), '/findings')).status, 502)
})
