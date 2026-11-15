import test from 'node:test'
import assert from 'node:assert/strict'
import { actionsFrom, browserActionFrom, investigationsFrom, resolveInvestigation } from './actions.js'
import { toTurns } from './useChat.js'

const investigations = [
  { id: 'PSI-25', label: 'BASS-II', acronym: 'BASS-II' },
  { id: 'PSI-69', label: 'FLEX' },
]

test('query_tests arguments become browser conditions, validated', () => {
  const a = browserActionFrom([{ name: 'query_tests', args: { phase: 'solid', o2_min_pct: 30, pressure_max_psi: 10.2, fuel: ' PMMA ' } }])
  assert.deepEqual(a.filters, { phase: 'solid', fuel: 'PMMA', o2Min: '30', pressureMaxPsi: '10.2' })
  assert.equal(browserActionFrom([{ name: 'query_tests', args: { phase: 'plasma', o2_min_pct: 500, pressure_max_psi: -1 } }]), null)
})

test('only allowlisted tools produce actions, and failed tools are ignored', () => {
  assert.equal(browserActionFrom([{ name: 'run_shell', args: { phase: 'solid' } }]), null)
  assert.equal(browserActionFrom([{ name: 'query_tests', args: { phase: 'solid' }, error: 'boom' }]), null)
  assert.equal(browserActionFrom(null), null)
})

test('the lunar base environment maps to the sourced preset', () => {
  const a = browserActionFrom([{ name: 'check_environment', args: { environment: 'lunar_base' } }])
  assert.equal(a.scenarioId, 'lunar_base')
  assert.equal(browserActionFrom([{ name: 'check_environment', args: { environment: 'mars_base' } }]), null)
})

test('investigation names resolve only to investigations that exist', () => {
  assert.equal(resolveInvestigation('bass ii', investigations), 'PSI-25')
  assert.equal(resolveInvestigation('PSI-69', investigations), 'PSI-69')
  assert.equal(resolveInvestigation('PSI-999', investigations), null)
  assert.deepEqual(investigationsFrom([{ name: 'query_tests', args: { investigation: 'FLEX' } }, { name: 'get_findings', args: { investigation: 'nope' } }], investigations), ['PSI-69'])
})

test('turns pair each question with its reply and mark only the unanswered one as pending', () => {
  const messages = [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' },
  ]
  const turns = toTurns(messages, true)
  assert.equal(turns.length, 2)
  assert.equal(turns[0].reply.content, 'a1')
  assert.equal(turns[0].pending, false)
  assert.equal(turns[1].reply, null)
  assert.equal(turns[1].pending, true)
})

const ctx = { investigations, findingItems: [{ id: 'F-003' }] }

test('actionsFrom keeps only actions that point at records that exist', () => {
  const meta = {
    actions: [
      { type: 'open_finding', id: 'F-003' },
      { type: 'open_finding', id: 'F-777' }, // not loaded
      { type: 'open_investigation', id: 'PSI-25' },
      { type: 'open_investigation', id: 'PSI-999' }, // not loaded
      { type: 'apply_filters', filters: { phase: 'solid', o2_min_pct: 30 } },
      { type: 'apply_filters', filters: { phase: 'plasma' } }, // nothing valid
      { type: 'apply_filters', scenario: 'mars_base' }, // no sourced definition
      { type: 'delete_everything', id: 'F-003' }, // not allowlisted
      null,
    ],
  }
  const a = actionsFrom(meta, ctx)
  assert.deepEqual(a.findings.map((f) => f.id), ['F-003'])
  assert.deepEqual(a.investigations.map((i) => i.id), ['PSI-25'])
  assert.equal(a.filters.length, 1)
  assert.equal(a.filters[0].filters.phase, 'solid')
})

test('actionsFrom falls back to the tool calls only when the backend sent no actions', () => {
  const tools = [{ name: 'query_tests', args: { phase: 'solid', investigation: 'FLEX' } }]
  const old = actionsFrom({ tools }, ctx)
  assert.equal(old.filters.length, 1)
  assert.deepEqual(old.investigations.map((i) => i.id), ['PSI-69'])
  const none = actionsFrom({ tools, actions: [] }, ctx)
  assert.deepEqual(none, { findings: [], investigations: [], filters: [] })
  assert.deepEqual(actionsFrom({ rejected: true, actions: [{ type: 'open_finding', id: 'F-003' }] }, ctx), { findings: [], investigations: [], filters: [] })
})
