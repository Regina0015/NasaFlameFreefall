import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnswerModel, describeFilters, tableFor } from './answerModel.js'
import { structuredFrom, buildStructured, validateStructured } from './structured.js'

const query = (over = {}) => ({
  filters: { investigation: null, phase: 'solid', gravity: null, fuel: null, o2_min_pct: 30, o2_max_pct: null, pressure_min_psi: null, pressure_max_psi: null },
  summary: '0 of 138 tests meet the numeric conditions.',
  n_tests: 0,
  groups: [],
  groups_not_shown: 0,
  no_data: false,
  none_match: true,
  before_numeric_filters: { n_tests: 138, o2_pct_tested: { min: 13.6, max: 22.2 }, pressure_psi_tested: null, excluded_no_o2_value: 12, excluded_no_pressure_value: 0 },
  source: 'snapshot',
  ...over,
})

test('a none-match count is a real zero of a scope, never "no data"', () => {
  const [entry] = buildStructured([{ name: 'query_tests', args: { phase: 'solid', o2_min_pct: 30 } }], [query()])
  const model = buildAnswerModel({ structured: [entry] })
  assert.equal(model.type, 'count')
  const b = model.blocks[0]
  assert.equal(b.n, 0)
  assert.equal(b.of, 138)
  assert.equal(b.noneMatch, true)
  assert.deepEqual(b.testedO2, { min: 13.6, max: 22.2 })
  assert.equal(b.missingO2, 12)
})

test('no matching tests give a no-data block that says it is not zero', () => {
  const [entry] = buildStructured([{ name: 'query_tests', args: { fuel: 'xyz' } }], [query({ no_data: true, none_match: false, before_numeric_filters: undefined })])
  const model = buildAnswerModel({ structured: [entry] })
  assert.equal(model.type, 'no_data')
  assert.match(model.blocks[0].reason, /not a zero/)
})

test('grouped tests with oxygen ranges become a comparison, with a table twin', () => {
  const groups = [
    { group: 'PSI-25', n_tests: 129, investigations: ['PSI-25'], o2_pct: { min: 13.6, max: 22.2 }, pressure_psi: null, example_test_ids: [] },
    { group: 'PSI-69', n_tests: 274, investigations: ['PSI-69'], o2_pct: { min: 12, max: 34 }, pressure_psi: { min: 1, max: 14.7 }, example_test_ids: [] },
  ]
  const [entry] = buildStructured([{ name: 'query_tests', args: { group_by: 'investigation' } }], [query({ filters: {}, n_tests: 403, groups, none_match: false, before_numeric_filters: undefined })])
  const model = buildAnswerModel({ structured: [entry] })
  assert.equal(model.type, 'comparison')
  const table = tableFor(model.blocks[0])
  assert.equal(table.rows.length, 2)
  assert.deepEqual(table.rows[0].slice(0, 4), ['PSI-25', 129, 13.6, 22.2])
  assert.equal(table.rows[0][4], 'No data')
})

test('coverage keeps "No data" phases apart from zero', () => {
  const result = {
    environment: 'lunar_base', status: 'evaluated', conditions: 'O2 >= 30% and pressure <= 10.2 psi', atmosphere_source: 'Challenge text',
    by_phase: [
      { phase: 'solid', n_tests: 264, no_data: true, reach_o2: null, reach_o2_and_pressure: null, reach_o2_pressure_unknown: null },
      { phase: 'droplet', n_tests: 369, no_data: false, reach_o2: 32, reach_o2_and_pressure: 8, reach_o2_pressure_unknown: 0 },
      { phase: 'smoke', n_tests: 117, no_data: false, reach_o2: 0, reach_o2_and_pressure: 0, reach_o2_pressure_unknown: 0 },
    ],
    gaps: ['No data for solid: some of its tests report no oxygen.'], investigations: [{ investigation: 'PSI-69', doi: '10.1/x' }], no_data: false, none_match: false, source: 'snapshot',
  }
  const model = buildAnswerModel({ structured: buildStructured([{ name: 'check_environment', args: { environment: 'lunar_base' } }], [result]) })
  assert.equal(model.type, 'coverage')
  const table = tableFor(model.blocks[0])
  assert.equal(table.rows[0][2], 'No data')
  assert.equal(table.rows[2][2], 0)
})

test('unknown or incomplete output falls back to text and nothing is drawn', () => {
  assert.equal(buildAnswerModel({}).type, 'text')
  assert.equal(buildAnswerModel({ structured: [{ kind: 'tests', n_tests: 'many' }] }).type, 'text')
  assert.equal(structuredFrom('query_tests', {}, { error: 'boom' }), null)
  assert.equal(structuredFrom('other_tool', {}, query()), null)
  assert.equal(buildAnswerModel({ structured: 'not a list' }).type, 'text')
  // A coverage row without its counts is rejected, not guessed.
  assert.equal(structuredFrom('check_environment', {}, { environment: 'lunar_base', status: 'evaluated', by_phase: [{ phase: 'solid', n_tests: 3, no_data: false }] }), null)
})

test('the browser rebuilds an entry from known fields only', () => {
  const [entry] = buildStructured([{ name: 'query_tests', args: {} }], [query()])
  const dirty = { ...entry, extra: '<script>' }
  const [clean] = validateStructured([dirty])
  assert.equal(clean.extra, undefined)
  assert.equal(describeFilters(clean.filters), 'solid-fuel tests, oxygen of at least 30%')
})

test('finding blocks carry ids and reported grades only; the audit state comes from the dashboard', () => {
  const result = { findings: [{ id: 'F-001', version: 2, grade: 'C', failed_checks: ['C8'], status: 'has_data', question: 'Q?', n_tests: 403, claim: 'ignored' }], availability: { rejected_not_shown: 2 }, no_data: false }
  const model = buildAnswerModel({ structured: buildStructured([{ name: 'get_findings', args: {} }], [result]) })
  assert.equal(model.type, 'finding')
  assert.equal(model.blocks[0].items[0].claim, undefined)
  assert.equal(model.blocks[0].rejectedNotShown, 2)
})
