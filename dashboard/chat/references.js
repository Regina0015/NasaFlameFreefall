// Structured dashboard actions for an answer, built by CODE from what the tools actually returned and were
// asked. Model text is never read, parsed or executed here. Only allowlisted action types with validated values
// are produced; the browser validates them again against the records it has loaded before offering a button.
//
//   { type: 'open_finding', id: 'F-003' }                    a finding the tools returned
//   { type: 'open_investigation', id: 'PSI-25' }             an investigation present in a tool result
//   { type: 'apply_filters', filters: { phase, fuel, o2_min_pct, pressure_max_psi } }   conditions of a query_tests call
//   { type: 'apply_filters', scenario: 'lunar_base' }        a sourced habitat definition evaluated by check_environment
//
// Nothing here navigates by itself. The dashboard shows each action as a button the person chooses to press.

import { tidyArguments } from './tools.js'

const FINDING_ID = /^F-\d{3}$/
const INVESTIGATION_ID = /^PSI-\d+$/
const PHASES = ['solid', 'droplet', 'gas', 'smoke']
const SCENARIOS = ['lunar_base']
const MAX_INVESTIGATIONS = 8
const MAX_ACTIONS = 24

function filtersFrom(rawArgs) {
  const args = tidyArguments(rawArgs)
  const filters = {}
  if (PHASES.includes(args.phase)) filters.phase = args.phase
  if (typeof args.fuel === 'string' && args.fuel.trim() && args.fuel.length <= 60) filters.fuel = args.fuel.trim()
  if (Number.isFinite(args.o2_min_pct) && args.o2_min_pct >= 0 && args.o2_min_pct <= 100) filters.o2_min_pct = args.o2_min_pct
  if (Number.isFinite(args.pressure_max_psi) && args.pressure_max_psi > 0) filters.pressure_max_psi = args.pressure_max_psi
  return Object.keys(filters).length ? filters : null
}

function investigationIds(tool, result) {
  const ids = []
  if (tool.name === 'query_tests') for (const group of result.groups ?? []) ids.push(...(group.investigations ?? []))
  if (tool.name === 'check_environment') ids.push(...(result.investigations ?? []).map((i) => i?.investigation))
  if (tool.name === 'get_findings') ids.push(...(result.investigation_summaries ?? []).map((s) => s?.investigation))
  return ids.filter((id) => typeof id === 'string' && INVESTIGATION_ID.test(id))
}

// `used[i]` is the tool call whose result is `results[i]`.
export function buildActions(used, results) {
  const actions = []
  const seen = new Set()
  const push = (action) => {
    const key = JSON.stringify(action)
    if (seen.has(key) || actions.length >= MAX_ACTIONS) return
    seen.add(key)
    actions.push(action)
  }

  results.forEach((result, index) => {
    const tool = used[index]
    if (!tool || tool.error || result?.error) return

    for (const finding of result.findings ?? []) if (FINDING_ID.test(finding?.id)) push({ type: 'open_finding', id: finding.id })

    for (const id of [...new Set(investigationIds(tool, result))].slice(0, MAX_INVESTIGATIONS)) push({ type: 'open_investigation', id })

    if (tool.name === 'query_tests') {
      const filters = filtersFrom(tool.args)
      if (filters) push({ type: 'apply_filters', filters })
    }
    if (tool.name === 'check_environment' && result.status === 'evaluated') {
      const environment = tidyArguments(tool.args).environment
      if (SCENARIOS.includes(environment)) push({ type: 'apply_filters', scenario: environment })
    }
  })

  return actions
}
