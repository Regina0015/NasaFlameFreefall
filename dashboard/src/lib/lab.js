import { PHASES, PSI_PER_ATM, isBurnerStream } from './browse.js'

// Interpretation lab: "what if the data were read differently?" It recounts LOADED test rows under reading
// choices the data really supports, next to the project's documented reading. It is a sensitivity check on counts.
// It is not a finding, not graded, and not a prediction. Choices that need data the database does not hold are
// listed as unavailable (see UNAVAILABLE) instead of being faked.
//
// The documented reading (scripts/functions.py, _config/environments.md): a test reaches the oxygen when its highest
// recorded oxygen is at least the threshold; it meets the pressure when its lowest recorded pressure is at or below
// the limit; a test with no oxygen or no pressure never matches; burner-stream tests (marked in `problems`) are left out
// because their oxygen is the burner stream, not the chamber. 30% oxygen and 10.2 psi are the lunar base definition.

export const OFFICIAL = { o2Min: 30, o2Reading: 'highest', pressureMaxPsi: 10.2, pressureReading: 'lowest', tier: 'all', phase: '', fuel: '', excludeBurner: true }

export const UNAVAILABLE = [
  { label: 'Pressure column: initial, mean or final', need: 'The database keeps only each row’s lowest and highest pressure. The original initial/mean/final columns are not normalized.' },
  { label: 'Oxygen unit: fraction or percent; mole or volume', need: 'Oxygen is stored as a percent, with mole and volume fraction treated as equal. There is no field to separate them.' },
  { label: 'Save a lab result', need: 'There is no place to store lab output, and nothing from the lab is a finding. A result worth keeping must be asked as a real question so it is calculated and audited.' },
]

const has = (v) => v !== null && v !== undefined && v !== ''
const num = (v) => (has(v) ? Number(v) : null)

function oxygen(test, reading) {
  const low = num(test.o2_pct_min)
  const high = num(test.o2_pct_max)
  return reading === 'lowest' ? (low ?? high) : (high ?? low)
}

function pressurePsi(test, reading) {
  const low = num(test.pressure_atm_min)
  const high = num(test.pressure_atm_max)
  const atm = reading === 'highest' ? (high ?? low) : (low ?? high)
  return atm === null ? null : atm * PSI_PER_ATM
}

export function reaches(test, choice) {
  if (choice.phase && test.phase !== choice.phase) return false
  if (choice.excludeBurner && isBurnerStream(test)) return false
  if (choice.fuel && !(test.fuel ?? '').toLowerCase().includes(choice.fuel.toLowerCase())) return false
  const o2 = oxygen(test, choice.o2Reading)
  const psi = pressurePsi(test, choice.pressureReading)
  if (o2 === null || psi === null) return false // missing is never a match
  return o2 >= Number(choice.o2Min) && psi <= Number(choice.pressureMaxPsi)
}

// Counts per fuel phase for the documented reading and the lab's reading, plus which investigations differ.
// Tier 1 only restricts both columns, so it never changes the comparison by itself.
export function compare({ tests, investigations, lab }) {
  const tierOf = new Map(investigations.map((i) => [i.id, i.tier]))
  const inScope = (t) => lab.tier === 'all' || tierOf.get(t.investigation) === 1
  const scope = tests.filter(inScope)
  const official = { ...OFFICIAL, phase: lab.phase, fuel: lab.fuel }

  const phases = [...PHASES, 'unclassified'].map((phase) => {
    const own = scope.filter((t) => (PHASES.includes(t.phase) ? t.phase : 'unclassified') === phase)
    return {
      phase,
      tests: own.length,
      official: own.filter((t) => reaches(t, official)).length,
      lab: own.filter((t) => reaches(t, lab)).length,
      noO2: own.filter((t) => oxygen(t, lab.o2Reading) === null).length,
      noPressure: own.filter((t) => pressurePsi(t, lab.pressureReading) === null).length,
    }
  })

  const byInvestigation = new Map()
  for (const t of scope) {
    const row = byInvestigation.get(t.investigation) ?? { official: 0, lab: 0 }
    if (reaches(t, official)) row.official += 1
    if (reaches(t, lab)) row.lab += 1
    byInvestigation.set(t.investigation, row)
  }
  const changed = [...byInvestigation]
    .filter(([, r]) => r.official !== r.lab)
    .map(([id, r]) => ({ id, official: r.official, lab: r.lab, difference: r.lab - r.official }))
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

  const total = (key) => phases.reduce((sum, p) => sum + p[key], 0)
  return { phases, totals: { tests: total('tests'), official: total('official'), lab: total('lab') }, changed }
}

export function isDefault(lab) {
  return Object.keys(OFFICIAL).every((k) => String(lab[k]) === String(OFFICIAL[k]))
}

export function questionFor(lab) {
  const parts = [`at least ${lab.o2Min}% oxygen (${lab.o2Reading} recorded value)`, `at most ${lab.pressureMaxPsi} psi (${lab.pressureReading} recorded pressure)`]
  if (lab.phase) parts.push(`${lab.phase} fuels`)
  if (lab.fuel) parts.push(`fuel ${lab.fuel}`)
  if (lab.tier === 1) parts.push('Tier 1 investigations only')
  if (!lab.excludeBurner) parts.push('burner-stream tests included')
  return `How many PSI tests had ${parts.join(', ')}?`
}
