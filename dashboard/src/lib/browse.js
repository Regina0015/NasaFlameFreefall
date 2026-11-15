// The investigation browser: filters the LOADED test rows and groups them by investigation.
// These are descriptive counts of recorded rows, not findings and not calculations of results.
// Rules follow the project's chat tools and scripts/functions.py:
//  - oxygen "at least X %" compares the highest recorded oxygen of the row (o2_pct_max, else o2_pct_min);
//  - pressure "at or below Y psi" compares the row's lowest pressure (pressure_atm_min) after converting atm to psi;
//  - a row with no oxygen or no pressure never satisfies a filter on it. Missing is not zero and not a match.

export const PSI_PER_ATM = 14.6959 // scripts/functions.py
export const PHASES = ['solid', 'droplet', 'gas', 'smoke']

const has = (v) => v !== null && v !== undefined && v !== ''
const num = (v) => (has(v) ? Number(v) : null)

export function o2High(test) {
  return num(test.o2_pct_max) ?? num(test.o2_pct_min)
}
export function o2Low(test) {
  return num(test.o2_pct_min) ?? num(test.o2_pct_max)
}
export function pressureLowPsi(test) {
  const atm = num(test.pressure_atm_min)
  return atm === null ? null : atm * PSI_PER_ATM
}

export function hasFilters(f) {
  return Boolean(f.phase || f.fuel.trim() || f.o2Min !== '' || f.pressureMaxPsi !== '')
}

export function testMatches(test, f) {
  if (f.phase && test.phase !== f.phase) return false
  if (f.fuel.trim() && !(test.fuel ?? '').toLowerCase().includes(f.fuel.trim().toLowerCase())) return false
  if (f.o2Min !== '') {
    const high = o2High(test)
    if (high === null || high < Number(f.o2Min)) return false
  }
  if (f.pressureMaxPsi !== '') {
    const psi = pressureLowPsi(test)
    if (psi === null || psi > Number(f.pressureMaxPsi)) return false
  }
  return true
}

function range(values) {
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null
}

// One row per investigation. `total` is every loaded test of it; `matching` are those that pass the filters.
export function browseInvestigations({ investigations, tests, filters }) {
  const byInvestigation = new Map()
  for (const test of tests) {
    if (!byInvestigation.has(test.investigation)) byInvestigation.set(test.investigation, [])
    byInvestigation.get(test.investigation).push(test)
  }

  return investigations.map((investigation) => {
    const own = byInvestigation.get(investigation.id) ?? []
    const matching = own.filter((t) => testMatches(t, filters))
    const phases = new Map()
    const fuels = new Map()
    for (const t of own) {
      if (t.phase) phases.set(t.phase, (phases.get(t.phase) ?? 0) + 1)
      if (t.fuel) fuels.set(t.fuel, (fuels.get(t.fuel) ?? 0) + 1)
    }
    return {
      investigation,
      total: own.length,
      matching: matching.length,
      phases: [...phases].sort((a, b) => b[1] - a[1]),
      fuels: [...fuels].sort((a, b) => b[1] - a[1]),
      o2: range(own.map(o2High).filter((v) => v !== null)),
      pressurePsi: range(own.map(pressureLowPsi).filter((v) => v !== null)),
      missingO2: own.filter((t) => o2High(t) === null).length,
      missingPressure: own.filter((t) => pressureLowPsi(t) === null).length,
      ownRows: own.length > 0,
    }
  })
}

// Distinct fuels with their test counts, most common first, for the fuel filter's suggestions.
export function fuelOptions(tests, limit = 40) {
  const counts = new Map()
  for (const t of tests) if (t.fuel) counts.set(t.fuel, (counts.get(t.fuel) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
}

// Coverage of oxygen and pressure per fuel phase, from the loaded rows.
export function coverageByPhase(tests) {
  const rows = new Map()
  for (const t of tests) {
    const key = PHASES.includes(t.phase) ? t.phase : 'unclassified'
    const r = rows.get(key) ?? { phase: key, tests: 0, noO2: 0, noPressure: 0 }
    r.tests += 1
    if (o2High(t) === null) r.noO2 += 1
    if (pressureLowPsi(t) === null) r.noPressure += 1
    rows.set(key, r)
  }
  return [...PHASES, 'unclassified'].map((k) => rows.get(k)).filter(Boolean)
}
