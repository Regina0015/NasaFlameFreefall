import test from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from './csv.js'
import { citedRows, investigationDetail } from './investigation.js'
import { OFFICIAL, compare, isDefault, questionFor, reaches } from './lab.js'

test('csv quotes cells and neutralizes spreadsheet formulas', () => {
  const csv = toCsv([{ a: 'x,y', b: '=SUM(A1)', c: 3, d: '-2', e: null, f: 'say "hi"' }], ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ label: k, value: (r) => r[k] })))
  assert.equal(csv, 'a,b,c,d,e,f\r\n"x,y",\'=SUM(A1),3,-2,,"say ""hi"""\r\n')
})

const tests = [
  { test_id: 't1', investigation: 'A', source_table: 'A.csv', source_row: 1, phase: 'solid', fuel: 'PMMA', o2_pct_min: 20, o2_pct_max: 31, pressure_atm_min: 0.5, pressure_atm_max: 1 },
  { test_id: 't2', investigation: 'A', source_table: 'A.csv', source_row: 2, phase: 'solid', fuel: 'PMMA', o2_pct_min: 31, o2_pct_max: 31, pressure_atm_min: 0.9, pressure_atm_max: 0.9 },
  { test_id: 't3', investigation: 'A', source_table: 'A.csv', source_row: 3, phase: 'solid', fuel: 'Nomex', o2_pct_min: null, o2_pct_max: null, pressure_atm_min: 0.1 },
  { test_id: 't4', investigation: 'B', source_table: 'B.csv', source_row: 1, phase: 'gas', fuel: 'CH4', o2_pct_min: 35, o2_pct_max: 35, pressure_atm_min: 0.6, pressure_atm_max: 0.6 },
]
const investigations = [{ id: 'A', tier: 1 }, { id: 'B', tier: 2 }, { id: 'G', type: 'ground', tier: 2 }]

test('lab: the documented reading matches the project rule and a missing value never matches', () => {
  assert.equal(reaches(tests[0], OFFICIAL), true) // highest O2 31 >= 30, lowest pressure 0.5 atm = 7.3 psi
  assert.equal(reaches(tests[1], OFFICIAL), false) // 0.9 atm = 13.2 psi
  assert.equal(reaches(tests[2], OFFICIAL), false) // no oxygen recorded
  assert.equal(isDefault(OFFICIAL), true)
})

test('lab: a different reading changes the counts and names who changed', () => {
  const lab = { ...OFFICIAL, o2Reading: 'lowest' } // t1 lowest O2 is 20, so it drops out
  const r = compare({ tests, investigations, lab })
  const solid = r.phases.find((p) => p.phase === 'solid')
  assert.deepEqual([solid.official, solid.lab], [1, 0])
  assert.deepEqual(r.changed, [{ id: 'A', official: 1, lab: 0, difference: -1 }])
  assert.equal(compare({ tests, investigations, lab: OFFICIAL }).changed.length, 0)
  assert.match(questionFor({ ...OFFICIAL, phase: 'solid' }), /solid fuels/)
})

test('investigation detail joins records, coverage, relations and citing findings', () => {
  const findingItems = [{ id: 'F-1', finding: { evidence: [{ investigation: 'A' }] } }, { id: 'F-2', finding: { evidence: [{ investigation: 'B' }] } }]
  const d = investigationDetail({ id: 'A', investigations, tests, relations: [{ from_id: 'G', to_id: 'A', type: 'reuses_flight_data', source: 'x' }], findingItems })
  assert.equal(d.coverage.total, 3)
  assert.equal(d.related[0].other.id, 'G')
  assert.equal(d.related[0].outgoing, false)
  assert.deepEqual(d.findings.map((f) => f.id), ['F-1'])
  const g = investigationDetail({ id: 'G', investigations, tests, relations: [], findingItems })
  assert.equal(g.coverage.total, 0)
  assert.equal(investigationDetail({ id: 'nope', investigations, tests, relations: [], findingItems }), null)
})

test('cited rows are looked up by source table and row number', () => {
  const some = citedRows({ table: 'A.csv', rows: [1, 3, 99] }, tests)
  assert.deepEqual(some.found.map((t) => t.source_row), [1, 3])
  assert.equal(some.cited, 3)
  const all = citedRows({ table: 'A.csv', rows: 'all' }, tests)
  assert.equal(all.found.length, 3)
  assert.equal(citedRows({ table: 'Z.csv', rows: 'all' }, tests).tableLoaded, 0)
})

test('lab: the documented reading leaves out burner-stream tests; including them is a visible choice', () => {
  const burner = { test_id: 'b1', investigation: 'B', source_table: 'B.csv', source_row: 9, phase: 'gas', fuel: 'C2H4', o2_pct_min: 85, o2_pct_max: 85, pressure_atm_min: 0.5, problems: 'burner stream' }
  assert.equal(reaches(burner, OFFICIAL), false)
  assert.equal(reaches(burner, { ...OFFICIAL, excludeBurner: false }), true)
  assert.equal(compare({ tests: [burner], investigations, lab: { ...OFFICIAL, excludeBurner: false } }).totals.lab, 1)
  assert.equal(compare({ tests: [burner], investigations, lab: { ...OFFICIAL, excludeBurner: false } }).totals.official, 0)
})
