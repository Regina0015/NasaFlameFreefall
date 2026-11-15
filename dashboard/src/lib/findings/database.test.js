import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabaseAdapter, entryFromRow, FINDING_COLUMNS, loadFindings } from './adapters.js'
import { classify } from './eligibility.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..')

// A row exactly as scripts/push_findings.py builds it: the finding's columns plus the audit columns.
async function realRow(id) {
  const finding = JSON.parse(await readFile(path.join(REPO, 'stages/04_calcular/output/findings', `${id}.json`), 'utf8'))
  const audit = JSON.parse(await readFile(path.join(REPO, 'stages/05_auditar/output/audits', `${id}.json`), 'utf8'))
  const row = Object.fromEntries(FINDING_COLUMNS.map((c) => [c, finding[c] ?? null]))
  return { ...row, grade: audit.grade, grade_reasons: audit.reasons, finding_sha256: audit.finding_sha256, audit, audited_at: audit.audited_by?.date }
}

// The few calls of the Supabase client the adapter makes: from().select().order().order() -> { data, error }.
function fakeClient(result) {
  const query = { order: () => query, then: (resolve) => resolve(result) }
  return { from: (table) => (assert.equal(table, 'findings'), { select: () => query }) }
}

test('a real published row is matched and shown as what its grade allows', async () => {
  const row = await realRow('F-001')
  const entry = entryFromRow(row)
  assert.equal(entry.auditStatus, 'matched')
  assert.equal(entry.finding.id, 'F-001')
  assert.equal('grade' in entry.finding, false) // the finding is only the finding's own fields
  const verdict = classify(entry)
  assert.notEqual(verdict.category, 'withheld', verdict.reasons.join(' '))
  assert.equal(verdict.grade, row.grade)
})

test('a row whose audit names another version, SHA-256 or grade gives no grade', async () => {
  const row = await realRow('F-001')
  for (const change of [{ version: row.version + 1 }, { finding_sha256: 'x' }, { grade: 'A' }, { audit: null }]) {
    const entry = entryFromRow({ ...row, ...change })
    assert.equal(entry.auditStatus, 'stale')
    assert.equal(classify(entry).grade, null)
  }
})

test('the database adapter reads the table, keeps the newest version per finding and reports why it cannot', async () => {
  const f1 = await realRow('F-001')
  const older = { ...f1, version: f1.version - 1 }
  const ok = await createDatabaseAdapter(async () => fakeClient({ data: [f1, older], error: null })).load()
  assert.equal(ok.status, 'ok')
  assert.equal(ok.findings.length, 1)
  assert.equal(ok.findings[0].finding.version, f1.version)

  const empty = await createDatabaseAdapter(async () => fakeClient({ data: [], error: null })).load()
  assert.match(empty.message, /no published findings/)
  const missing = await createDatabaseAdapter(async () => fakeClient({ data: null, error: { code: 'PGRST205' } })).load()
  assert.match(missing.message, /no findings table/)
  const none = await createDatabaseAdapter(async () => null).load()
  assert.match(none.message, /not configured/)
})

test('with published rows the database is the source used, before the dev-only endpoints', async () => {
  const db = createDatabaseAdapter(async () => fakeClient({ data: [await realRow('F-005')], error: null }))
  const never = { id: 'never', label: 'never', load: async () => assert.fail('a later source was tried') }
  const result = await loadFindings({ adapters: [db, never] })
  assert.equal(result.source.id, 'database')
  assert.equal(result.items[0].id, 'F-005')
})
