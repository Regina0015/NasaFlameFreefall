import { useMemo, useState } from 'react'
import { browseInvestigations } from '../lib/browse.js'
import { SCENARIOS } from '../lib/scenarios.js'
import { Segmented } from './ui.jsx'

const NO_FILTERS = { phase: '', fuel: '', o2Min: '', pressureMaxPsi: '' }
const METRICS = [
  { id: 'o2', label: 'Oxygen' },
  { id: 'pressure', label: 'Pressure' },
]
const fmt = (n) => n.toLocaleString('en-US')
const num = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''))

// The conditions the loaded tests actually covered, per investigation, drawn from the loaded rows only.
// One axis per chart. An investigation with no recorded value gets a hatched row labeled "Not recorded", never a bar
// at zero. The optional line is the sourced lunar base definition. This chart is descriptive, not a finding.
export default function OxygenChart({ evidence }) {
  const { status, data } = evidence
  const [metric, setMetric] = useState('o2')
  const [showDefinition, setShowDefinition] = useState(false)

  const rows = useMemo(() => {
    if (!data) return []
    return browseInvestigations({ investigations: data.graph.investigations, tests: data.tests, filters: NO_FILTERS })
      .filter((r) => r.ownRows)
      .sort((a, b) => b.total - a.total)
  }, [data])

  if (status !== 'ready' || !data) return null

  const scenario = SCENARIOS.find((s) => s.id === 'lunar_base')
  const isO2 = metric === 'o2'
  const range = (r) => (isO2 ? r.o2 : r.pressurePsi)
  const missing = (r) => (isO2 ? r.missingO2 : r.missingPressure)
  const unit = isO2 ? '%' : 'psi'
  const max = isO2 ? 100 : Math.max(20, Math.ceil(Math.max(...rows.map((r) => range(r)?.max ?? 0), scenario.pressureMaxPsi) / 5) * 5)
  const line = isO2 ? scenario.o2Min : scenario.pressureMaxPsi
  const pos = (v) => `${Math.min(Math.max((v / max) * 100, 0), 100)}%`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))

  return (
    <section className="ws-panel oc" aria-labelledby="oc-title">
      <header className="ev-head">
        <h2 id="oc-title">Conditions tested</h2>
        <span className="tag">Loaded rows · not findings</span>
      </header>

      <div className="mp-toolbar">
        <Segmented label="Condition" options={METRICS} value={metric} onChange={setMetric} />
        <label className="mp-check">
          <input type="checkbox" checked={showDefinition} onChange={(e) => setShowDefinition(e.target.checked)} />
          <span>
            Show the lunar base definition ({scenario.o2Min}% oxygen, {scenario.pressureMaxPsi} psi)
          </span>
        </label>
      </div>

      <p className="muted ev-hint">
        Each bar spans the lowest to the highest {isO2 ? 'oxygen level' : 'pressure'} recorded for an investigation's tests. {isO2 ? 'Oxygen in percent.' : 'Pressure in psi, converted from the stored atm.'}{' '}
        A hatched row means no value was recorded, which is not the same as zero.
      </p>

      <div className="oc-axis" aria-hidden="true">
        <span />
        <div className="oc-ticks">
          {ticks.map((t) => (
            <span key={t} style={{ left: pos(t) }}>
              {t}
            </span>
          ))}
        </div>
        <span />
      </div>

      <ul className="oc-rows">
        {rows.map((r) => {
          const v = range(r)
          return (
            <li key={r.investigation.id} className="oc-row">
              <span className="oc-label">{r.investigation.label || r.investigation.acronym || r.investigation.id}</span>
              <div className={`oc-track${v ? '' : ' oc-track-missing'}`} aria-hidden="true">
                {v && <span className="oc-range" style={{ left: pos(v.min), width: `max(${pos(v.max - v.min)}, 4px)` }} />}
                {showDefinition && <span className="oc-line" style={{ left: pos(line) }} />}
              </div>
              <span className="oc-text">
                {v ? `${num(v.min)}–${num(v.max)} ${unit}` : 'Not recorded'} · {fmt(r.total)} tests{missing(r) > 0 && v ? ` · ${fmt(missing(r))} without` : ''}
              </span>
            </li>
          )
        })}
      </ul>

      {showDefinition && (
        <p className="fd-note" role="note">
          Dashed line: the {isO2 ? `${scenario.o2Min}% oxygen` : `${scenario.pressureMaxPsi} psi`} of the lunar base definition. Source: {scenario.source}. {scenario.limitation}
        </p>
      )}

      <details className="ev-details">
        <summary>Show this chart as a table</summary>
        <div className="ev-table-wrap">
          <table>
            <caption>{isO2 ? 'Oxygen' : 'Pressure'} range per investigation</caption>
            <thead>
              <tr>
                <th scope="col">Investigation</th>
                <th scope="col">Lowest ({unit})</th>
                <th scope="col">Highest ({unit})</th>
                <th scope="col">Tests</th>
                <th scope="col">Not recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.investigation.id}>
                  <th scope="row">{r.investigation.label || r.investigation.id}</th>
                  <td>{range(r) ? num(range(r).min) : 'Not recorded'}</td>
                  <td>{range(r) ? num(range(r).max) : 'Not recorded'}</td>
                  <td>{fmt(r.total)}</td>
                  <td>{fmt(missing(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="muted ev-hint">Some investigations report burner-stream oxygen rather than chamber atmosphere (for example up to 85% in one burner study); this chart does not separate them. Every test here is microgravity.</p>
    </section>
  )
}
