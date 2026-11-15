// Prepares a finding's stored Vega-Lite chart for drawing. Only specs that carry their own inline data and use
// plain marks are supported. Anything else is refused with a reason, never drawn partially.

const ALLOWED_MARKS = new Set(['bar', 'rule', 'text', 'tick', 'point', 'circle', 'square', 'line', 'area', 'rect'])
const NESTED = ['layer', 'concat', 'hconcat', 'vconcat']

function markType(mark) {
  return typeof mark === 'string' ? mark : mark?.type
}

function* units(spec) {
  if (!spec || typeof spec !== 'object') return
  yield spec
  for (const key of NESTED) for (const child of Array.isArray(spec[key]) ? spec[key] : []) yield* units(child)
  if (spec.spec) yield* units(spec.spec)
}

// True when a key named "url" appears anywhere: that would make the viewer's browser fetch a remote file.
function hasUrl(value) {
  if (Array.isArray(value)) return value.some(hasUrl)
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => k === 'url' || hasUrl(v))
  return false
}

export function checkSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'The stored chart is not a specification object.'
  if (typeof spec.$schema === 'string' && !/vega\.github\.io\/schema\/vega-lite\//.test(spec.$schema)) return 'The stored chart is not a Vega-Lite specification.'
  if (hasUrl(spec)) return 'The stored chart points to external data, which is not supported.'
  if (!Array.isArray(spec.data?.values)) return 'The stored chart has no inline data table.'
  for (const unit of units(spec)) {
    const type = unit.mark === undefined ? null : markType(unit.mark)
    if (type !== null && !ALLOWED_MARKS.has(type)) return `The chart uses an unsupported mark ("${type}").`
  }
  return null
}

// A copy of the spec fitted to the drawer and themed. Data and encodings are not touched; only the fixed dark
// gray text colors that the Calculator wrote are replaced with the theme's text color so labels stay readable.
export function prepareSpec(spec, { text, height = 260 } = {}) {
  const problem = checkSpec(spec)
  if (problem) return { ok: false, reason: problem }

  const copy = JSON.parse(JSON.stringify(spec))
  copy.width = 'container'
  copy.height = height
  copy.autosize = { type: 'fit', contains: 'padding' }
  delete copy.config?.view?.continuousWidth
  delete copy.config?.view?.continuousHeight
  if (text) {
    for (const unit of units(copy)) {
      if (unit.mark && typeof unit.mark === 'object' && /^#4{3}(4{3})?$/i.test(unit.mark.color ?? '')) unit.mark.color = text
    }
  }
  return { ok: true, spec: copy }
}

// The rows of the chart's own data table, for the table next to the chart.
export function chartRows(spec) {
  const rows = Array.isArray(spec?.data?.values) ? spec.data.values : []
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))]
  return { columns, rows }
}
