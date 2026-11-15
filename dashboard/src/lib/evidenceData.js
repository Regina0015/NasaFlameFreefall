// Evidence overview data. Descriptive totals only: counts and coverage computed from the
// loaded rows. Nothing here is a finding, and nothing is calculated by a model.

export const PAGE_SIZE = 1000 // Supabase returns at most 1,000 rows per request.
const MAX_PAGES = 60
const PHASES = ['solid', 'droplet', 'gas', 'smoke']

const TEST_COLUMNS =
  'test_id,investigation,source_table,source_row,fuel,phase,gravity,o2_pct_min,o2_pct_max,pressure_atm_min,pressure_atm_max,outcome,problems'
const INVESTIGATION_COLUMNS =
  'id,acronym,label,title,doi,type,platform,hardware,tier,tier_reason,pillar,environments,summary_student,summary_professional'
const RELATION_COLUMNS = 'id,from_id,to_id,type,source'

const has = (value) => value !== null && value !== undefined && value !== ''

// Reads one whole table, one page at a time. Reports whether every row was loaded.
export async function fetchAllRows(client, table, columns, orderBy) {
  const rows = []
  let expected = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error, count } = await client
      .from(table)
      .select(columns, { count: 'exact' })
      .eq('scope', 'psi')
      .order(orderBy)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (expected === null && typeof count === 'number') expected = count

    rows.push(...data)
    if (data.length < PAGE_SIZE || (expected !== null && rows.length >= expected)) break
  }

  return { rows, expected, complete: expected === null ? false : rows.length === expected }
}

function coverage(total, recorded) {
  return { recorded, missing: total - recorded, total }
}

// Pure and deterministic: the same rows always give the same summary.
export function summarizeEvidence({ investigations, tests }) {
  const phaseCounts = new Map(PHASES.map((p) => [p, 0]))
  const gravityCounts = new Map()
  const byPhase = new Map()
  const withRows = new Set()
  let unclassified = 0
  let o2 = 0
  let pressure = 0

  const bucket = (key) => {
    if (!byPhase.has(key)) byPhase.set(key, { tests: 0, o2: 0, pressure: 0 })
    return byPhase.get(key)
  }

  for (const test of tests) {
    const hasO2 = has(test.o2_pct_min) || has(test.o2_pct_max)
    const hasPressure = has(test.pressure_atm_min) || has(test.pressure_atm_max)
    const key = PHASES.includes(test.phase) ? test.phase : 'unclassified'

    if (key === 'unclassified') unclassified += 1
    else phaseCounts.set(key, phaseCounts.get(key) + 1)

    const group = bucket(key)
    group.tests += 1
    if (hasO2) group.o2 += 1
    if (hasPressure) group.pressure += 1

    if (hasO2) o2 += 1
    if (hasPressure) pressure += 1

    const gravity = has(test.gravity) ? test.gravity : 'not recorded'
    gravityCounts.set(gravity, (gravityCounts.get(gravity) ?? 0) + 1)
    if (test.investigation) withRows.add(test.investigation)
  }

  const flight = investigations.filter((i) => i.type === 'flight').length
  const ground = investigations.filter((i) => i.type === 'ground').length
  const summarized = investigations.filter((i) => has(i.summary_student) && has(i.summary_professional)).length
  const withTestRows = investigations.filter((i) => withRows.has(i.id)).length

  const phases = [...PHASES, ...(unclassified ? ['unclassified'] : [])].map((key) => ({
    key,
    tests: key === 'unclassified' ? unclassified : phaseCounts.get(key),
    ...(byPhase.get(key) ?? { o2: 0, pressure: 0 }),
  }))

  return {
    investigations: {
      total: investigations.length,
      flight,
      ground,
      otherType: investigations.length - flight - ground,
      withTestRows,
      withoutTestRows: investigations.length - withTestRows,
      summarized,
    },
    tests: {
      total: tests.length,
      phases,
      gravity: [...gravityCounts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      o2: coverage(tests.length, o2),
      pressure: coverage(tests.length, pressure),
    },
  }
}

export async function loadEvidence(client) {
  const [inv, tests, rel] = await Promise.all([
    fetchAllRows(client, 'investigations', INVESTIGATION_COLUMNS, 'id'),
    fetchAllRows(client, 'tests', TEST_COLUMNS, 'test_id'),
    fetchAllRows(client, 'relations', RELATION_COLUMNS, 'id'),
  ])

  return {
    summary: summarizeEvidence({ investigations: inv.rows, tests: tests.rows }),
    // Raw rows for the investigation map: investigations, relations, and tests counted per investigation.
    graph: { investigations: inv.rows, relations: rel.rows, testCounts: countTests(tests.rows) },
    // The loaded test rows (a few fields each), for the investigation browser.
    tests: tests.rows,
    load: {
      investigationRows: inv.rows.length,
      investigationExpected: inv.expected,
      testRows: tests.rows.length,
      testExpected: tests.expected,
      relationRows: rel.rows.length,
      relationExpected: rel.expected,
      complete: inv.complete && tests.complete && rel.complete,
    },
  }
}

// Tests per investigation id, from the loaded rows.
export function countTests(tests) {
  const counts = {}
  for (const test of tests) if (test.investigation) counts[test.investigation] = (counts[test.investigation] ?? 0) + 1
  return counts
}
