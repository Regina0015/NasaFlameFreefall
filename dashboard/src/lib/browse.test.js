import test from 'node:test'
import assert from 'node:assert/strict'
import { browseInvestigations, coverageByPhase, fuelOptions, hasFilters, testMatches, PSI_PER_ATM } from './browse.js'

const none = { phase: '', fuel: '', o2Min: '', pressureMaxPsi: '' }
const tests = [
  { investigation: 'A', fuel: 'PMMA', phase: 'solid', o2_pct_min: 20, o2_pct_max: 30, pressure_atm_min: 0.5 },
  { investigation: 'A', fuel: 'Nomex', phase: 'solid', o2_pct_min: 21, o2_pct_max: 21, pressure_atm_min: 1 },
  { investigation: 'A', fuel: 'PMMA', phase: 'solid', o2_pct_min: null, o2_pct_max: null, pressure_atm_min: null },
  { investigation: 'B', fuel: 'heptane', phase: 'droplet', o2_pct_min: 35, o2_pct_max: null, pressure_atm_min: null },
]
const investigations = [{ id: 'A' }, { id: 'B' }, { id: 'G', type: 'ground' }]

test('oxygen compares the highest recorded value, and a missing value never matches', () => {
  assert.equal(testMatches(tests[0], { ...none, o2Min: '30' }), true)
  assert.equal(testMatches(tests[1], { ...none, o2Min: '30' }), false)
  assert.equal(testMatches(tests[2], { ...none, o2Min: '0' }), false) // missing is not zero and not a match
  assert.equal(testMatches(tests[3], { ...none, o2Min: '30' }), true) // only a minimum recorded
})

test('pressure is converted from atm and a missing pressure never satisfies the limit', () => {
  assert.equal(testMatches(tests[0], { ...none, pressureMaxPsi: String(0.5 * PSI_PER_ATM + 0.01) }), true)
  assert.equal(testMatches(tests[1], { ...none, pressureMaxPsi: '10.2' }), false)
  assert.equal(testMatches(tests[2], { ...none, pressureMaxPsi: '1000' }), false)
})

test('phase and fuel filters combine on the same test row', () => {
  assert.equal(testMatches(tests[0], { ...none, phase: 'solid', fuel: 'pmma', o2Min: '30' }), true)
  assert.equal(testMatches(tests[1], { ...none, phase: 'solid', fuel: 'pmma' }), false)
  assert.equal(hasFilters(none), false)
  assert.equal(hasFilters({ ...none, fuel: 'x' }), true)
})

test('browse keeps ground studies without rows as "no own rows", never as zero results', () => {
  const rows = browseInvestigations({ investigations, tests, filters: { ...none, o2Min: '30' } })
  const a = rows.find((r) => r.investigation.id === 'A')
  const g = rows.find((r) => r.investigation.id === 'G')
  assert.equal(a.total, 3)
  assert.equal(a.matching, 1)
  assert.equal(a.missingO2, 1)
  assert.equal(g.ownRows, false)
  assert.equal(g.total, 0)
})

test('fuel options and per-phase coverage come from the loaded rows', () => {
  assert.deepEqual(fuelOptions(tests)[0], ['PMMA', 2])
  const solid = coverageByPhase(tests).find((r) => r.phase === 'solid')
  assert.deepEqual([solid.tests, solid.noO2, solid.noPressure], [3, 1, 1])
})

test('burner-stream tests can be left out, as the project does for atmosphere comparisons', () => {
  const burner = { investigation: 'C', fuel: 'C2H4', phase: 'gas', o2_pct_min: 85, o2_pct_max: 85, pressure_atm_min: 0.5, problems: 'burner stream; other note' }
  assert.equal(testMatches(burner, { ...none, o2Min: '30' }), true)
  assert.equal(testMatches(burner, { ...none, o2Min: '30', excludeBurner: true }), false)
  assert.equal(hasFilters({ ...none, excludeBurner: true }), true)
})
