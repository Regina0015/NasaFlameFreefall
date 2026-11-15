import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classify, tally } from './eligibility.js'
import { loadFindings, localFilesAdapter } from './adapters.js'
import { validateFinding } from './validate.js'
import { collectFindings } from '../../../findings/server.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FINDINGS = path.resolve(HERE, '../../../../stages/04_calcular/output/findings')
const AUDITS = path.resolve(HERE, '../../../../stages/05_auditar/output/audits')

function sample(overrides = {}) {
  return {
    id: 'F-900', version: 1, question: 'Q?', status: 'has_data', claim: 'C.', summary_student: 's', summary_professional: 'p',
    values: { n: { value: 3, unit: 'tests' } },
    method: { script: 'x.py', function: 'f', params: {}, formula: 'count' },
    evidence: [{ investigation: 'PSI-1', doi: '10.1/x', table: 't.csv', columns: ['a'], rows: 'all' }],
    n_tests: 3, assumptions: [], limitations: ['L'], warnings: [], environments: [], tier: 1, pillar: null,
    visual_offer: { chart: { available: false, idea: null }, graph: { available: false, idea: null }, footnote: null },
    chart: null, graph: null, generated_by: { agent: 'a', model: 'm', date: '2026-01-01T00:00:00Z' },
    ...overrides,
  }
}
const audit = (grade, extra = {}) => ({ grade, reasons: [], checks: [{ id: 'C9', result: 'pass' }], ...extra })
const entry = (grade, overrides = {}, auditStatus = 'matched') => ({ finding: sample(overrides), audit: grade ? audit(grade) : null, auditStatus })

test('A and B are verified; C is an indication; rejected is withheld; pending has no grade', () => {
  assert.equal(classify(entry('A')).category, 'verified')
  assert.equal(classify(entry('B')).category, 'verified')
  assert.equal(classify(entry('C')).category, 'indication')
  assert.equal(classify(entry('rejected')).category, 'withheld')
  const pending = classify(entry(null, {}, 'none'))
  assert.equal(pending.category, 'pending')
  assert.equal(pending.grade, null)
  assert.equal(pending.showClaim, false)
})

test('a stale audit verifies nothing', () => {
  const v = classify({ finding: sample(), audit: null, auditStatus: 'stale', auditNote: 'old' })
  assert.equal(v.category, 'pending')
  assert.equal(v.grade, null)
})

test('no_data needs a no_data finding, and a mismatch is withheld', () => {
  assert.equal(classify(entry('no_data', { status: 'no_data' })).category, 'gap')
  assert.equal(classify(entry('no_data')).category, 'withheld')
  assert.equal(classify(entry('A', { status: 'no_data' })).category, 'withheld')
})

test('Grade C can be withheld by policy', () => {
  const v = classify(entry('C'), { verifiedGrades: ['A', 'B'], indicationGrades: [], chartCategories: [], graphCategories: [], chartRequiresC9: true })
  assert.equal(v.category, 'withheld')
})

test('charts need an audit that passed C9', () => {
  const chart = { title: 't', data: { values: [{ a: 1 }] } }
  assert.equal(classify(entry('A', { chart })).chart.allowed, true)
  const noC9 = { finding: sample({ chart }), audit: audit('A', { checks: [{ id: 'C9', result: 'not_applicable' }] }), auditStatus: 'matched' }
  assert.equal(classify(noC9).chart.allowed, false)
  assert.equal(classify(entry(null, { chart }, 'none')).chart.allowed, false)
})

test('an invalid finding is withheld with the reason', () => {
  const v = classify({ finding: { id: 'F-901' }, audit: null, auditStatus: 'none' })
  assert.equal(v.category, 'withheld')
  assert.match(v.reasons[0], /schema/)
  assert.ok(validateFinding(sample()).length === 0)
})

test('the adapters report why each source is unavailable and never invent findings', async () => {
  const none = await loadFindings({ fetchImpl: async () => new Response('<!doctype html>', { status: 200 }) })
  assert.equal(none.source, null)
  assert.equal(none.items.length, 0)
  assert.equal(none.attempts.length, 2)
  assert.match(none.attempts[0].message, /no findings table/)
  assert.match(none.attempts[1].message, /npm run dev/)

  const ok = await loadFindings({ fetchImpl: async () => Response.json({ findings: [{ id: 'F-900', ...entry('A') }] }) })
  assert.equal(ok.source.id, 'local-files')
  assert.equal(ok.items[0].verdict.category, 'verified')

  const failing = await localFilesAdapter.load({ fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(failing.status, 'unavailable')
})

test('the real repository findings are matched to audits by version and SHA-256', async () => {
  const items = await collectFindings({ findingsDir: FINDINGS, auditsDir: AUDITS })
  assert.ok(items.length > 0)
  const files = (await readdir(FINDINGS)).filter((n) => /^F-\d{3}\.json$/.test(n))
  assert.equal(items.length, files.length)
  for (const item of items) {
    const verdict = classify(item)
    if (item.auditStatus === 'matched') {
      assert.equal(item.audit.finding_version, item.finding.version)
    } else {
      assert.notEqual(verdict.category, 'verified')
      assert.equal(verdict.grade, null)
    }
    assert.notEqual(verdict.grade === 'rejected' && verdict.category, 'verified')
  }
  const counts = tally(items.map((i) => ({ ...i, verdict: classify(i) })))
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), items.length)
  void readFile
})
