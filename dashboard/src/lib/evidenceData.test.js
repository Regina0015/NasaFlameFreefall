import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllRows, summarizeEvidence, PAGE_SIZE } from './evidenceData.js'

// A fake client that behaves like PostgREST: pages are capped at 1,000 rows.
function fakeClient(tables) {
  return {
    from(name) {
      const rows = tables[name]
      let from = 0
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range(start, end) {
          from = start
          return Promise.resolve({
            data: rows.slice(from, Math.min(end + 1, from + PAGE_SIZE)),
            error: null,
            count: rows.length,
          })
        },
      }
      return query
    },
  }
}

test('fetchAllRows pages past the 1,000-row limit and reports completeness', async () => {
  const rows = Array.from({ length: 2350 }, (_, i) => ({ test_id: `T${i}` }))
  const result = await fetchAllRows(fakeClient({ tests: rows }), 'tests', 'test_id', 'test_id')
  assert.equal(result.rows.length, 2350)
  assert.equal(result.expected, 2350)
  assert.equal(result.complete, true)
})

test('fetchAllRows handles an exact multiple of the page size', async () => {
  const rows = Array.from({ length: 2000 }, (_, i) => ({ test_id: `T${i}` }))
  const result = await fetchAllRows(fakeClient({ tests: rows }), 'tests', 'test_id', 'test_id')
  assert.equal(result.rows.length, 2000)
  assert.equal(result.complete, true)
})

test('fetchAllRows throws database errors', async () => {
  const client = {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: () => Promise.resolve({ data: null, error: new Error('boom'), count: null }),
      }
      return query
    },
  }
  await assert.rejects(fetchAllRows(client, 'tests', 'x', 'x'), /boom/)
})

test('summarizeEvidence keeps missing values separate from zero', () => {
  const summary = summarizeEvidence({
    investigations: [
      { id: 'PSI-1', type: 'flight', summary_student: 'a', summary_professional: 'b' },
      { id: 'PSI-2', type: 'flight' },
      { id: 'PSI-3', type: 'ground' },
    ],
    tests: [
      { investigation: 'PSI-1', phase: 'solid', gravity: 'microgravity', o2_pct_min: 0, o2_pct_max: 0, pressure_atm_min: 1 },
      { investigation: 'PSI-1', phase: 'solid', gravity: 'microgravity', o2_pct_min: null, o2_pct_max: null },
      { investigation: 'PSI-2', phase: null, gravity: 'microgravity', o2_pct_min: 21, o2_pct_max: 21 },
    ],
  })

  assert.equal(summary.investigations.total, 3)
  assert.equal(summary.investigations.ground, 1)
  assert.equal(summary.investigations.withTestRows, 2)
  assert.equal(summary.investigations.withoutTestRows, 1)
  assert.equal(summary.investigations.summarized, 1)
  assert.equal(summary.tests.total, 3)
  // An oxygen value of 0 is a recorded value; a null is not recorded.
  assert.deepEqual(summary.tests.o2, { recorded: 2, missing: 1, total: 3 })
  assert.deepEqual(summary.tests.pressure, { recorded: 1, missing: 2, total: 3 })
  assert.equal(summary.tests.phases.find((p) => p.key === 'solid').tests, 2)
  assert.equal(summary.tests.phases.find((p) => p.key === 'unclassified').tests, 1)
  assert.equal(summary.tests.phases.find((p) => p.key === 'gas').tests, 0)
})
