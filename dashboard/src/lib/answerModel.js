import { validateStructured } from './structured.js'

// The shared presentation model of one assistant answer. Both profiles render THIS object, so switching profile
// changes wording, density and what is open by default, never a value. It is derived only from the validated
// `structured` field (values copied from the read-only tools). Numbers are never read out of the answer's prose.
// Unknown or incomplete output gives type 'text': the sourced text answer, with no chart.
//
// Block types: count, range, categories, comparison, coverage, finding, no_data.
// Every block says what it counts (scope) and carries its own caption, table and caveats.

const PHASE_WORD = { solid: 'solid-fuel', droplet: 'liquid-droplet', gas: 'gas-flame', smoke: 'smoke' }
const PRESSURE_NOTE = 'Pressure is reported only by some experiments; tests without a pressure value are not counted when a pressure limit is used.'
const OXYGEN_NOTE = 'A test counts as reaching an oxygen level when its highest recorded oxygen value does. Tests with no recorded oxygen are reported separately, never as zero.'
const BURNER_NOTE = 'In some gas-flame tests the oxygen value describes the burner stream, not the chamber atmosphere.'

export function describeFilters(f = {}) {
  const parts = []
  if (f.investigation) parts.push(f.investigation)
  if (f.phase) parts.push(`${PHASE_WORD[f.phase] ?? f.phase} tests`)
  if (f.fuel) parts.push(`fuel matching “${f.fuel}”`)
  if (f.gravity) parts.push(f.gravity)
  if (f.o2_min_pct != null) parts.push(`oxygen of at least ${f.o2_min_pct}%`)
  if (f.o2_max_pct != null) parts.push(`oxygen of at most ${f.o2_max_pct}%`)
  if (f.pressure_min_psi != null) parts.push(`pressure of at least ${f.pressure_min_psi} psi`)
  if (f.pressure_max_psi != null) parts.push(`pressure of at most ${f.pressure_max_psi} psi`)
  return parts.length ? parts.join(', ') : 'all tests in the snapshot'
}

export const fmtRange = (r, unit) => (r ? (r.min === r.max ? `${r.min} ${unit}` : `${r.min} to ${r.max} ${unit}`) : null)
const GROUP_LABEL = { phase: 'Fuel phase', fuel: 'Fuel', investigation: 'Investigation', gravity: 'Gravity' }

function fromTests(e) {
  const scope = describeFilters(e.filters)
  const numeric = e.before !== null
  const caveats = []
  if (e.filters.o2_min_pct != null || e.filters.o2_max_pct != null) caveats.push(OXYGEN_NOTE)
  if (e.filters.pressure_min_psi != null || e.filters.pressure_max_psi != null) caveats.push(PRESSURE_NOTE)
  if (e.filters.phase === 'gas' || e.group_by === 'phase') caveats.push(BURNER_NOTE)
  const common = { scope, source: 'snapshot', caveats, filters: e.filters }

  if (e.no_data) {
    return { ...common, type: 'no_data', reason: 'No test in the snapshot matches these filters, so there is nothing to count. This is not a zero result.' }
  }

  const grouped = e.group_by !== 'none' && e.groups.length >= 1
  if (grouped) {
    const withRange = e.groups.filter((g) => g.o2_pct).length
    const rows = e.groups.map((g) => ({ label: g.group, n: g.n_tests, o2: g.o2_pct, pressure: g.pressure_psi, investigations: g.investigations }))
    const base = { ...common, groupLabel: GROUP_LABEL[e.group_by] ?? 'Group', rows, notShown: e.groups_not_shown, total: e.n_tests, of: e.before?.n_tests ?? null }
    if (withRange >= 2) {
      return {
        ...base,
        type: 'comparison',
        caption: 'Each bar spans the lowest to the highest oxygen level recorded for that group. Groups differ in size and in which experiments they cover, so compare ranges, not importance.',
      }
    }
    return { ...base, type: 'categories', caption: 'Each bar is the number of test rows in that group. A group missing from the list has no matching rows in the snapshot.' }
  }

  const only = e.groups[0] ?? null
  if (!numeric && only?.o2_pct) {
    return {
      ...common,
      type: 'range',
      n: e.n_tests,
      o2: only.o2_pct,
      pressure: only.pressure_psi,
      investigations: only.investigations,
      caption: 'The bar spans the lowest to the highest oxygen level recorded across these test rows. It describes what was tested, not what happens between or beyond those levels.',
    }
  }
  return {
    ...common,
    type: 'count',
    n: e.n_tests,
    of: e.before?.n_tests ?? null,
    noneMatch: e.none_match,
    testedO2: e.before?.o2_pct_tested ?? null,
    testedPressure: e.before?.pressure_psi_tested ?? null,
    missingO2: e.before?.excluded_no_o2_value ?? null,
    missingPressure: e.before?.excluded_no_pressure_value ?? null,
    investigations: only?.investigations ?? [],
  }
}

function fromEnvironment(e) {
  if (e.status === 'no_source') {
    return { type: 'no_data', scope: e.environment, source: 'snapshot', caveats: [], reason: e.summary ?? 'This environment has no sourced atmosphere in the project files, so it is not evaluated.' }
  }
  if (e.status !== 'evaluated') return null
  return {
    type: 'coverage',
    scope: e.environment,
    source: 'snapshot',
    conditions: e.conditions,
    atmosphereSource: e.atmosphere_source,
    rows: e.by_phase.map((p) => ({ phase: p.phase, n: p.n_tests, noData: p.no_data, reachO2: p.reach_o2, reachBoth: p.reach_o2_and_pressure, pressureUnknown: p.reach_o2_pressure_unknown })),
    gaps: e.gaps,
    investigations: e.investigations,
    method: e.method,
    noneMatch: e.none_match,
    caveats: [OXYGEN_NOTE, PRESSURE_NOTE, BURNER_NOTE],
    caption: 'For each fuel phase: how many test rows reached the oxygen level, and how many also ran at or below the pressure limit. “No data” means some tests of that phase record no oxygen, so no count is given. It is not zero.',
  }
}

function fromFindings(e) {
  if (e.findings.length) return { type: 'finding', scope: 'findings', source: 'findings', caveats: [], items: e.findings, rejectedNotShown: e.rejected_not_shown }
  if (e.no_data) return { type: 'no_data', scope: 'findings', source: 'findings', caveats: [], reason: 'No stored finding matches this question. That is a gap in what has been written up, not a result about the experiments.' }
  return null
}

export function buildAnswerModel(meta) {
  const entries = validateStructured(meta?.structured)
  const blocks = []
  for (const e of entries) {
    const block = e.kind === 'tests' ? fromTests(e) : e.kind === 'environment' ? fromEnvironment(e) : fromFindings(e)
    if (block) blocks.push(block)
  }
  return { type: blocks[0]?.type ?? 'text', blocks }
}

// Rows for the table alternative of a block (same values as the visual).
export function tableFor(block) {
  switch (block.type) {
    case 'categories':
      return { columns: [block.groupLabel, 'Test rows'], rows: block.rows.map((r) => [r.label, r.n]) }
    case 'comparison':
      return {
        columns: [block.groupLabel, 'Test rows', 'Lowest O2 (%)', 'Highest O2 (%)', 'Pressure (psi)'],
        rows: block.rows.map((r) => [r.label, r.n, r.o2?.min ?? 'No data', r.o2?.max ?? 'No data', fmtRange(r.pressure, 'psi') ?? 'No data']),
      }
    case 'range':
      return { columns: ['Measure', 'Value'], rows: [['Test rows', block.n], ['Lowest O2 (%)', block.o2.min], ['Highest O2 (%)', block.o2.max], ['Pressure', fmtRange(block.pressure, 'psi') ?? 'No data']] }
    case 'coverage':
      return {
        columns: ['Fuel phase', 'Test rows', 'Reached the O2 level', 'Also at or below the pressure limit', 'Pressure not recorded'],
        rows: block.rows.map((r) => [r.phase, r.n, r.noData ? 'No data' : r.reachO2, r.noData ? 'No data' : r.reachBoth, r.noData ? 'No data' : (r.pressureUnknown ?? 'No data')]),
      }
    default:
      return null
  }
}
