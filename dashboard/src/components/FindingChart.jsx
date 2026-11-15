import { useEffect, useRef, useState } from 'react'
import { chartRows, prepareSpec } from '../lib/findings/chartSpec.js'

// Draws a finding's stored Vega-Lite chart. The renderer loads only when this component mounts (on request).
// The chart's own data table is always available next to it. Nothing is drawn if the spec is not supported.

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function themeConfig() {
  const text = cssVar('--text')
  const muted = cssVar('--text-muted')
  const grid = cssVar('--border')
  return {
    background: 'transparent',
    view: { stroke: 'transparent' },
    axis: { labelColor: text, titleColor: muted, domainColor: cssVar('--border-strong'), tickColor: cssVar('--border-strong'), gridColor: grid, labelFontSize: 12, titleFontSize: 12 },
    title: { color: text, fontSize: 14 },
    legend: { labelColor: text, titleColor: muted },
    text: { color: text },
  }
}

export default function FindingChart({ chart }) {
  const host = useRef(null)
  const [state, setState] = useState({ status: 'loading', message: null })
  const [themeTick, setThemeTick] = useState(0)

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let view = null
    let live = true
    const prepared = prepareSpec(chart, { text: cssVar('--text') })
    if (!prepared.ok) {
      setState({ status: 'unsupported', message: prepared.reason })
      return undefined
    }
    setState({ status: 'loading', message: null })

    import('vega-embed')
      .then(({ default: embed }) =>
        embed(host.current, prepared.spec, { actions: false, renderer: 'svg', config: themeConfig(), tooltip: true }),
      )
      .then((result) => {
        if (!live) return result.finalize()
        view = result
        setState({ status: 'ready', message: null })
        return undefined
      })
      .catch((error) => {
        if (live) setState({ status: 'error', message: error?.message || 'The chart renderer failed.' })
      })

    return () => {
      live = false
      view?.finalize()
    }
  }, [chart, themeTick])

  const { columns, rows } = chartRows(chart)

  return (
    <figure className="fd-chart">
      <figcaption className="visually-hidden">{chart.title}</figcaption>
      {state.status === 'loading' && <p className="muted" role="status">Loading chart…</p>}
      {(state.status === 'unsupported' || state.status === 'error') && (
        <p className="fd-note" role="alert">
          The chart could not be drawn. {state.message}
        </p>
      )}
      <div ref={host} className="fd-chart-host" role="img" aria-label={`${chart.title}. The same numbers are in the table below.`} hidden={state.status !== 'ready'} />
      <details className="ev-details" open>
        <summary>Chart data as a table</summary>
        <div className="ev-table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{row[c] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
