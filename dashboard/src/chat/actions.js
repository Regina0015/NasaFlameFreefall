// Turns the STRUCTURED part of an assistant response (the tools it actually ran, with their arguments) into
// optional dashboard actions. Model text is never parsed or executed. Only allowlisted tool names and
// validated argument values produce an action, and every action is a visible button the person chooses to press.
//
//   query_tests { phase, fuel, o2_min_pct, pressure_max_psi }  -> "Apply these conditions in the investigation browser"
//   check_environment { environment: 'lunar_base' }            -> the sourced lunar base preset of the browser
//   query_tests / get_findings { investigation }               -> "View on the map" for investigations that exist
//
// Anything else (unknown tools, bad values, unknown ids) is ignored.

import { PHASES } from '../lib/browse.js'
import { SCENARIOS } from '../lib/scenarios.js'

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

// The investigation filter in a tool call is a PSI id ("PSI-25") or an acronym ("BASS-II").
export function resolveInvestigation(value, investigations) {
  if (typeof value !== 'string' || !value.trim() || value.length > 60) return null
  const key = norm(value)
  const match = investigations.find((i) => norm(i.id) === key || norm(i.label ?? '') === key || norm(i.acronym ?? '') === key)
  return match ? match.id : null
}

// Browser conditions from the tools of one answer: { filters, scenarioId, description } or null.
export function browserActionFrom(tools) {
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (!tool || tool.error) continue
    const args = tool.args && typeof tool.args === 'object' ? tool.args : {}

    if (tool.name === 'check_environment' && args.environment === 'lunar_base') {
      const scenario = SCENARIOS.find((s) => s.id === 'lunar_base')
      if (scenario) {
        return {
          filters: { phase: '', fuel: '', o2Min: String(scenario.o2Min), pressureMaxPsi: String(scenario.pressureMaxPsi) },
          scenarioId: scenario.id,
          description: `${scenario.label}: at least ${scenario.o2Min}% oxygen and at most ${scenario.pressureMaxPsi} psi`,
        }
      }
    }

    if (tool.name === 'query_tests') {
      const filters = { phase: '', fuel: '', o2Min: '', pressureMaxPsi: '' }
      const parts = []
      if (PHASES.includes(args.phase)) {
        filters.phase = args.phase
        parts.push(`phase ${args.phase}`)
      }
      if (typeof args.fuel === 'string' && args.fuel.trim() && args.fuel.length <= 60) {
        filters.fuel = args.fuel.trim()
        parts.push(`fuel "${filters.fuel}"`)
      }
      if (isNumber(args.o2_min_pct) && args.o2_min_pct >= 0 && args.o2_min_pct <= 100) {
        filters.o2Min = String(args.o2_min_pct)
        parts.push(`oxygen at least ${args.o2_min_pct}%`)
      }
      if (isNumber(args.pressure_max_psi) && args.pressure_max_psi > 0) {
        filters.pressureMaxPsi = String(args.pressure_max_psi)
        parts.push(`pressure at most ${args.pressure_max_psi} psi`)
      }
      if (parts.length) return { filters, scenarioId: null, description: parts.join(', ') }
    }
  }
  return null
}

// Existing investigation ids named by the tools of one answer.
export function investigationsFrom(tools, investigations) {
  const ids = []
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (!tool || tool.error || !['query_tests', 'get_findings'].includes(tool.name)) continue
    const id = resolveInvestigation(tool.args?.investigation, investigations)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

const FINDING_ID = /^F-\d{3}$/
const INVESTIGATION_ID = /^PSI-\d+$/

// Browser conditions from one validated apply_filters action: { filters, scenarioId, description } or null.
function filtersAction(action) {
  if (action.scenario !== undefined) {
    const scenario = SCENARIOS.find((s) => s.id === action.scenario)
    if (!scenario) return null
    return {
      filters: { phase: '', fuel: '', o2Min: String(scenario.o2Min), pressureMaxPsi: String(scenario.pressureMaxPsi) },
      scenarioId: scenario.id,
      description: `${scenario.label}: at least ${scenario.o2Min}% oxygen and at most ${scenario.pressureMaxPsi} psi`,
    }
  }
  const f = action.filters
  if (!f || typeof f !== 'object') return null
  return browserActionFrom([{ name: 'query_tests', args: { phase: f.phase, fuel: f.fuel, o2_min_pct: f.o2_min_pct, pressure_max_psi: f.pressure_max_psi } }])
}

// Everything a result may offer, validated against the records this browser has actually loaded:
//   findings       existing findings the person can open (evidence drawer)
//   investigations existing investigations the person can open on the map
//   filters        conditions the person can apply in the investigation browser
// Actions come from meta.actions (built by the backend from tool results). If the backend sent none (an older
// backend), the structured tool calls are used instead. Model text is never used.
export function actionsFrom(meta, { investigations, findingItems }) {
  if (!meta || meta.rejected) return { findings: [], investigations: [], filters: [] }
  const hasActions = Array.isArray(meta.actions)

  if (!hasActions) {
    const browser = browserActionFrom(meta.tools)
    return {
      findings: [],
      investigations: investigationsFrom(meta.tools, investigations).map((id) => investigations.find((i) => i.id === id)).filter(Boolean),
      filters: browser ? [browser] : [],
    }
  }

  const out = { findings: [], investigations: [], filters: [] }
  for (const action of meta.actions) {
    if (!action || typeof action !== 'object') continue
    if (action.type === 'open_finding' && typeof action.id === 'string' && FINDING_ID.test(action.id)) {
      const item = findingItems.find((i) => i.id === action.id)
      if (item && !out.findings.some((f) => f.id === item.id)) out.findings.push(item)
    } else if (action.type === 'open_investigation' && typeof action.id === 'string' && INVESTIGATION_ID.test(action.id)) {
      const record = investigations.find((i) => i.id === action.id)
      if (record && !out.investigations.some((i) => i.id === record.id)) out.investigations.push(record)
    } else if (action.type === 'apply_filters') {
      const applied = filtersAction(action)
      if (applied && !out.filters.some((f) => f.description === applied.description)) out.filters.push(applied)
    }
  }
  return out
}
