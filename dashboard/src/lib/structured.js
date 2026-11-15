// The additive, structured part of a chat reply. It is built by CODE from what the read-only tools returned
// (never from the model's prose) and validated twice: on the server before it is sent (chat/agent.js) and again in
// the browser before anything is drawn (lib/answerModel.js). A tool result that does not fit these shapes is
// dropped, so an unknown or incomplete output falls back to a sourced text answer, never an invented visual.
//
// Entry shapes (all values are copied from the tool result; nothing is computed here):
//   { kind: 'tests', filters, group_by, n_tests, scope_n, groups: [{ group, n_tests, investigations, o2_pct, pressure_psi }],
//     groups_not_shown, no_data, none_match, before, source }
//   { kind: 'environment', environment, status, conditions, atmosphere_source, by_phase: [...], gaps, investigations, no_data, none_match, source }
//   { kind: 'findings', findings: [{ id, version, grade, failed_checks, status, question, n_tests }], rejected_not_shown, no_data }

const PHASES = ['solid', 'droplet', 'gas', 'smoke']
const GROUP_BY = ['none', 'phase', 'fuel', 'investigation', 'gravity']
const ENV_STATUS = ['evaluated', 'no_source', 'reference_point']
const MAX_ENTRIES = 6
const MAX_GROUPS = 12
const MAX_TEXT = 300

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)
const text = (v, limit = MAX_TEXT) => (typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : null)
const list = (v, item, max) => (Array.isArray(v) ? v.map(item).filter((x) => x !== null).slice(0, max) : [])

function range(v) {
  if (!isObject(v)) return null
  const min = num(v.min)
  const max = num(v.max)
  return min === null || max === null || min > max ? null : { min, max }
}

function testsEntry(args, r) {
  const n = count(r.n_tests)
  if (n === null || !Array.isArray(r.groups)) return null
  const groupBy = GROUP_BY.includes(args?.group_by) ? args.group_by : 'none'
  const groups = []
  for (const g of r.groups.slice(0, MAX_GROUPS)) {
    if (!isObject(g) || text(g.group, 120) === null || count(g.n_tests) === null) return null
    groups.push({
      group: text(g.group, 120),
      n_tests: g.n_tests,
      investigations: list(g.investigations, (x) => (typeof x === 'string' && /^PSI-\d+$/.test(x) ? x : null), 12),
      o2_pct: range(g.o2_pct),
      pressure_psi: range(g.pressure_psi),
    })
  }
  const f = isObject(r.filters) ? r.filters : {}
  const filters = {}
  for (const key of ['investigation', 'gravity', 'fuel']) if (text(f[key], 60)) filters[key] = text(f[key], 60)
  if (PHASES.includes(f.phase)) filters.phase = f.phase
  for (const key of ['o2_min_pct', 'o2_max_pct', 'pressure_min_psi', 'pressure_max_psi']) if (num(f[key]) !== null) filters[key] = f[key]
  const b = isObject(r.before_numeric_filters) ? r.before_numeric_filters : null
  const before = b && count(b.n_tests) !== null
    ? {
        n_tests: b.n_tests,
        o2_pct_tested: range(b.o2_pct_tested),
        pressure_psi_tested: range(b.pressure_psi_tested),
        excluded_no_o2_value: count(b.excluded_no_o2_value),
        excluded_no_pressure_value: count(b.excluded_no_pressure_value),
      }
    : null
  return {
    kind: 'tests',
    filters,
    group_by: groupBy,
    n_tests: n,
    groups,
    groups_not_shown: count(r.groups_not_shown) ?? 0,
    no_data: r.no_data === true,
    none_match: r.none_match === true,
    before,
    source: r.source === 'snapshot' ? 'snapshot' : null,
  }
}

function environmentEntry(args, r) {
  if (!ENV_STATUS.includes(r.status) || text(r.environment, 40) === null) return null
  const phases = []
  if (r.status === 'evaluated') {
    if (!Array.isArray(r.by_phase)) return null
    for (const p of r.by_phase.slice(0, 8)) {
      if (!isObject(p) || !PHASES.includes(p.phase) || count(p.n_tests) === null) return null
      const noData = p.no_data === true
      const row = { phase: p.phase, n_tests: p.n_tests, no_data: noData, reach_o2: null, reach_o2_and_pressure: null, reach_o2_pressure_unknown: null }
      if (!noData) {
        row.reach_o2 = count(p.reach_o2)
        row.reach_o2_and_pressure = count(p.reach_o2_and_pressure)
        row.reach_o2_pressure_unknown = count(p.reach_o2_pressure_unknown)
        if (row.reach_o2 === null || row.reach_o2_and_pressure === null) return null
      }
      phases.push(row)
    }
  }
  return {
    kind: 'environment',
    environment: text(r.environment, 40),
    status: r.status,
    conditions: text(r.conditions, 120),
    atmosphere_source: text(r.atmosphere_source, 200),
    summary: text(r.summary, 300),
    by_phase: phases,
    gaps: list(r.gaps, (x) => text(x, 200), 8),
    investigations: list(r.investigations, (x) => (isObject(x) && /^PSI-\d+$/.test(x.investigation) ? { investigation: x.investigation, doi: text(x.doi, 80) } : null), 10),
    method: isObject(r.method) && text(r.method.function, 60) && text(r.method.script, 120) ? { function: text(r.method.function, 60), script: text(r.method.script, 120) } : null,
    no_data: r.no_data === true,
    none_match: r.none_match === true,
    source: r.source === 'snapshot' ? 'snapshot' : null,
  }
}

function findingsEntry(args, r) {
  if (!Array.isArray(r.findings)) return null
  const items = list(
    r.findings,
    (f) => {
      if (!isObject(f) || !/^F-\d{3}$/.test(f.id)) return null
      return {
        id: f.id,
        version: count(f.version),
        grade: text(f.grade, 20),
        failed_checks: list(f.failed_checks, (c) => (typeof c === 'string' && /^C\d$/.test(c) ? c : null), 10),
        status: f.status === 'no_data' ? 'no_data' : f.status === 'has_data' ? 'has_data' : null,
        question: text(f.question, 240),
        n_tests: count(f.n_tests),
      }
    },
    6,
  )
  const a = isObject(r.availability) ? r.availability : {}
  return { kind: 'findings', findings: items, rejected_not_shown: count(a.rejected_not_shown), no_data: r.no_data === true }
}

const BUILDERS = { query_tests: testsEntry, check_environment: environmentEntry, get_findings: findingsEntry }

// One tool call and its result -> an entry, or null when the result does not fit the expected shape.
export function structuredFrom(name, args, result) {
  if (!isObject(result) || result.error || !BUILDERS[name]) return null
  try {
    return BUILDERS[name](isObject(args) ? args : {}, result)
  } catch {
    return null
  }
}

export function buildStructured(used, results) {
  return results.map((result, i) => structuredFrom(used[i]?.name, used[i]?.args, result)).filter(Boolean).slice(0, MAX_ENTRIES)
}

// The browser re-checks what it receives. Re-running the same builder on an entry validates it: the builders
// accept only their own output shape (their output is a valid input for the checks above, apart from a few
// renamed fields), so an entry is rebuilt from known fields and anything else is discarded.
export function validateStructured(entries) {
  if (!Array.isArray(entries)) return []
  const out = []
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    if (!isObject(e)) continue
    if (e.kind === 'tests') {
      const rebuilt = testsEntry({ group_by: e.group_by }, { ...e, before_numeric_filters: e.before, source: e.source })
      if (rebuilt) out.push(rebuilt)
    } else if (e.kind === 'environment') {
      const rebuilt = environmentEntry({}, e)
      if (rebuilt) out.push(rebuilt)
    } else if (e.kind === 'findings') {
      const rebuilt = findingsEntry({}, { findings: e.findings, availability: { rejected_not_shown: e.rejected_not_shown }, no_data: e.no_data })
      if (rebuilt) out.push(rebuilt)
    }
  }
  return out
}
