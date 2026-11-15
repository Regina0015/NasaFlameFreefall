import { browseInvestigations } from './browse.js'

const NO_FILTERS = { phase: '', fuel: '', o2Min: '', pressureMaxPsi: '' }

// Everything the dashboard knows about ONE investigation, from loaded records only:
//  record      the investigation row (summary, platform, hardware, DOI, tier, pillar...)
//  coverage    its test rows: counts, phases, fuels, oxygen and pressure ranges, missing values
//  relations   rows of the relations table that touch it
//  findings    loaded findings whose evidence cites it (with their audit verdict)
// Missing pieces stay missing. A ground study with no test rows of its own is not "zero tests".
export function investigationDetail({ id, investigations, tests, relations, findingItems }) {
  const record = investigations.find((i) => i.id === id)
  if (!record) return null
  const [coverage] = browseInvestigations({ investigations: [record], tests: tests.filter((t) => t.investigation === id), filters: NO_FILTERS })
  const byId = new Map(investigations.map((i) => [i.id, i]))

  const related = relations
    .filter((r) => r.from_id === id || r.to_id === id)
    .map((r) => {
      const otherId = r.from_id === id ? r.to_id : r.from_id
      return { other: byId.get(otherId) ?? { id: otherId }, type: r.type, source: r.source ?? null, outgoing: r.from_id === id }
    })

  const findings = findingItems.filter((item) => item.finding?.evidence?.some((e) => e.investigation === id))

  return { record, coverage, related, findings }
}

// The finding evidence rows (table + row numbers) as they appear in the loaded database rows.
// `rows` is 'all' or a list of source row numbers. Returns what was found and how many rows were cited.
export function citedRows(evidence, tests) {
  const inTable = tests.filter((t) => t.source_table === evidence.table)
  const wanted = evidence.rows === 'all' ? null : new Set(evidence.rows)
  const found = wanted ? inTable.filter((t) => wanted.has(t.source_row)) : inTable
  found.sort((a, b) => a.source_row - b.source_row)
  return { found, cited: wanted ? wanted.size : null, tableLoaded: inTable.length }
}
