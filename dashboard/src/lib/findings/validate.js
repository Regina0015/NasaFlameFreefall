// A light structural check of a finding against schemas/finding.schema.json. It is not a full JSON Schema
// validator: it catches files the dashboard could not display safely (missing fields, wrong types).
// A finding that fails is withheld and says why; it is never patched up or shown as if valid.

const ENVIRONMENTS = ['transit_vehicle', 'space_station', 'lunar_base', 'mars_base', 'pressurized_rover']

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isString = (v) => typeof v === 'string' && v.length > 0
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

export function validateFinding(f) {
  const problems = []
  const need = (ok, message) => {
    if (!ok) problems.push(message)
  }

  if (!isObject(f)) return ['the file is not a JSON object']

  need(typeof f.id === 'string' && /^F-\d{3}$/.test(f.id), 'id is not in the F-001 form')
  need(Number.isInteger(f.version) && f.version >= 1, 'version is not a positive integer')
  for (const key of ['question', 'claim', 'summary_student', 'summary_professional']) need(isString(f[key]), `${key} is missing`)
  need(f.status === 'has_data' || f.status === 'no_data', 'status is not has_data or no_data')

  need(isObject(f.values), 'values is missing')
  if (isObject(f.values)) {
    for (const [name, v] of Object.entries(f.values)) {
      need(isObject(v) && 'value' in v && typeof v.unit === 'string' && (v.value === null || typeof v.value === 'number'), `value "${name}" needs a number (or null) and a unit`)
    }
  }

  need(isObject(f.method) && ['script', 'function', 'formula'].every((k) => typeof f.method[k] === 'string') && isObject(f.method.params), 'method is incomplete')

  need(Array.isArray(f.evidence), 'evidence is missing')
  if (Array.isArray(f.evidence)) {
    f.evidence.forEach((e, i) => {
      need(
        isObject(e) &&
          typeof e.investigation === 'string' &&
          typeof e.doi === 'string' &&
          typeof e.table === 'string' &&
          isStringArray(e.columns) &&
          (e.rows === 'all' || (Array.isArray(e.rows) && e.rows.length > 0 && e.rows.every(Number.isInteger))),
        `evidence[${i}] is incomplete`,
      )
    })
  }

  need(Number.isInteger(f.n_tests) && f.n_tests >= 0, 'n_tests is not a non-negative integer')
  need(isStringArray(f.assumptions), 'assumptions is missing')
  need(isStringArray(f.limitations) && f.limitations.length > 0, 'limitations must list at least one item')
  need(isStringArray(f.warnings), 'warnings is missing')
  need(Array.isArray(f.environments) && f.environments.every((e) => ENVIRONMENTS.includes(e)), 'environments has an unknown value')
  need([1, 2, null].includes(f.tier), 'tier is not 1, 2 or null')
  need(['prevention', 'detection', 'suppression', null].includes(f.pillar), 'pillar is not a known pillar or null')
  need(isObject(f.visual_offer), 'visual_offer is missing')

  need(f.chart === null || (isObject(f.chart) && typeof f.chart.title === 'string' && Array.isArray(f.chart.data?.values)), 'chart is neither null nor a spec with inline data')
  need(f.graph === null || (isObject(f.graph) && Array.isArray(f.graph.nodes) && Array.isArray(f.graph.edges)), 'graph is neither null nor nodes and edges')
  need(isObject(f.generated_by), 'generated_by is missing')

  return problems
}
