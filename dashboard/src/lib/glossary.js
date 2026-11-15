// Short, neutral definitions used by both profiles. They define words; they say nothing about risk or safety.
export const GLOSSARY = [
  { term: 'O2 concentration', definition: 'The share of the gas that is oxygen, in percent. Earth air is about 21%.' },
  { term: 'Pressure', definition: 'How hard the gas pushes, shown in psi (and atm in the source tables). Sea-level air is 14.7 psi.' },
  { term: 'Fuel phase', definition: 'The form of the burning material: solid, liquid droplet, gas or smoke.' },
  { term: 'Microgravity', definition: 'The near-weightless condition on the space station. Every test in this snapshot was run in it.' },
  { term: 'Test row', definition: 'One row of an experiment table from NASA PSI. Some tables list test days instead of single tests.' },
  { term: 'Burner-stream oxygen', definition: 'In some gas-flame tests the oxygen value describes the burner flow, not the air in the chamber.' },
  { term: 'No data', definition: 'No record in the snapshot answers the question. It is not zero, and it says nothing about safety.' },
  { term: 'Snapshot', definition: 'The local copy of the tests table that the assistant reads. It can differ from the database shown elsewhere.' },
]

const BY_TERM = new Map(GLOSSARY.map((g) => [g.term, g]))

// Terms a block type needs, so each answer shows only the definitions it uses.
export function termsFor(types) {
  const wanted = new Set(['No data', 'Snapshot', 'Microgravity'])
  for (const t of types) {
    if (['count', 'range', 'comparison', 'coverage'].includes(t)) {
      wanted.add('O2 concentration')
      wanted.add('Test row')
    }
    if (['range', 'coverage', 'comparison'].includes(t)) wanted.add('Pressure')
    if (['categories', 'coverage'].includes(t)) wanted.add('Fuel phase')
    if (['coverage', 'comparison'].includes(t)) wanted.add('Burner-stream oxygen')
  }
  return [...wanted].map((t) => BY_TERM.get(t)).filter(Boolean)
}
