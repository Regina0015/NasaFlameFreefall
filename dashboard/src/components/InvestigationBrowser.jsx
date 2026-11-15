import { useEffect, useMemo, useState } from 'react'
import { PHASES, PSI_PER_ATM, browseInvestigations, fuelOptions, hasFilters, testMatches } from '../lib/browse.js'
import { downloadText, toCsv } from '../lib/csv.js'
import { Segmented } from './ui.jsx'
import { SCENARIOS } from '../lib/scenarios.js'

const PHASE_LABELS = { solid: 'Solid fuels', droplet: 'Liquid droplets', gas: 'Gas flames', smoke: 'Smoke' }
const EMPTY = { phase: '', fuel: '', o2Min: '', pressureMaxPsi: '' }
const PAGE = 10

const fmt = (n) => n.toLocaleString('en-US')
const num = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''))

// Investigation browser: filter the loaded test rows by fuel, phase, oxygen and pressure, and see which
// investigations have matching tests. Counts are descriptive (recorded rows), not findings.
export default function InvestigationBrowser({ evidence, view, onOpenMap, onOpenDetails, preset = null, onBackToResults = null }) {
  const professional = view === 'cientifico'
  const { status, data, error, refresh, refreshing } = evidence
  const [filters, setFilters] = useState(EMPTY)
  const [scenario, setScenario] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [display, setDisplay] = useState('cards')
  const [fromResult, setFromResult] = useState(null) // the conditions came from a research result the person chose to apply

  // An explicit action from a research result can set the conditions (preset = { filters, scenarioId, n }).
  useEffect(() => {
    if (!preset) return
    setFilters({ ...EMPTY, ...preset.filters })
    setScenario(preset.scenarioId ?? null)
    setFromResult(preset.description ?? null)
    setShowAll(false)
  }, [preset])

  const rows = useMemo(() => {
    if (!data) return []
    return browseInvestigations({ investigations: data.graph.investigations, tests: data.tests, filters })
  }, [data, filters])
  const fuels = useMemo(() => (data ? fuelOptions(data.tests) : []), [data])

  const active = hasFilters(filters)
  const shown = rows
    .filter((r) => (active ? r.matching > 0 : true))
    .sort((a, b) => (active ? b.matching - a.matching : b.total - a.total) || a.investigation.id.localeCompare(b.investigation.id, 'en', { numeric: true }))
  const visible = showAll ? shown : shown.slice(0, PAGE)
  const matchingTests = rows.reduce((sum, r) => sum + r.matching, 0)
  const ground = rows.filter((r) => !r.ownRows).length
  const activeScenario = SCENARIOS.find((s) => s.id === scenario)

  // The loaded test rows that match the filters, as a CSV for modeling. Units: oxygen in percent, pressure in atm as stored.
  const downloadRows = () => {
    const matching = data.tests.filter((t) => testMatches(t, filters))
    const columns = ['test_id', 'investigation', 'source_table', 'source_row', 'fuel', 'phase', 'gravity', 'o2_pct_min', 'o2_pct_max', 'pressure_atm_min', 'pressure_atm_max', 'outcome']
    downloadText(`flametrace-tests-${matching.length}-rows.csv`, toCsv(matching, columns.map((c) => ({ label: c, value: (row) => row[c] }))))
  }

  const set = (patch) => {
    setFromResult(null)
    setScenario(null)
    setShowAll(false)
    setFilters((f) => ({ ...f, ...patch }))
  }
  const applyScenario = (s) => {
    setFromResult(null)
    setScenario(s.id)
    setShowAll(false)
    setFilters({ ...EMPTY, o2Min: String(s.o2Min), pressureMaxPsi: String(s.pressureMaxPsi) })
  }

  return (
    <section className="ws-panel ib" id="investigations" aria-labelledby="ib-title">
      <header className="ev-head">
        <h2 id="ib-title" tabIndex={-1}>
          Investigation browser
        </h2>
        <span className="tag">Recorded test rows · not findings</span>
      </header>

      {status === 'loading' && (
        <div className="ev-skeleton" role="status">
          <span className="visually-hidden">Loading investigations…</span>
          <div className="sk-block" aria-hidden="true" />
        </div>
      )}

      {status === 'unavailable' && (
        <div className="ev-empty">
          <p>
            <strong>The browser needs the database.</strong> This build is not connected to Supabase, so there are no investigations or test rows to
            browse. Nothing is taken from sample files.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="ev-empty" role="alert">
          <p>
            <strong>The investigations could not be loaded.</strong> {error}
          </p>
          <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}

      {status === 'ready' && data && (
        <>
          <p className="muted ib-intro">
            Find which investigations tested a fuel, phase or condition. A test with no oxygen or no pressure value does not match a filter on that value.
          </p>

          <div className="ib-scenarios" role="group" aria-label="Scenario presets">
            <span className="muted">Preset:</span>
            {SCENARIOS.map((s) => (
              <button key={s.id} type="button" className="hv-chip" aria-pressed={scenario === s.id} onClick={() => applyScenario(s)}>
                {s.label}
              </button>
            ))}
          </div>
          {fromResult && (
            <p className="fd-note" role="note">
              Conditions set from your research result: {fromResult}. They are counts of recorded rows, not findings.{' '}
              {onBackToResults && (
                <button type="button" className="mp-link" onClick={onBackToResults}>
                  Back to results
                </button>
              )}
            </p>
          )}
          {activeScenario && (
            <p className="fd-note" role="note">
              {activeScenario.label}: at least {activeScenario.o2Min}% oxygen and at most {activeScenario.pressureMaxPsi} psi. Source: {activeScenario.source}.{' '}
              {activeScenario.limitation}
            </p>
          )}

          <form className="ib-filters" onSubmit={(e) => e.preventDefault()}>
            <label className="mp-field">
              <span>Fuel phase</span>
              <select value={filters.phase} onChange={(e) => set({ phase: e.target.value })}>
                <option value="">All phases</option>
                {PHASES.map((p) => (
                  <option key={p} value={p}>
                    {PHASE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>

            <label className="mp-field">
              <span>Fuel or material</span>
              <input list="ib-fuels" value={filters.fuel} onChange={(e) => set({ fuel: e.target.value })} placeholder="For example PMMA" />
              <datalist id="ib-fuels">
                {fuels.map(([fuel, count]) => (
                  <option key={fuel} value={fuel}>
                    {fuel} ({count} tests)
                  </option>
                ))}
              </datalist>
            </label>

            <label className="mp-field">
              <span>Oxygen at least (%)</span>
              <input type="number" min="0" max="100" step="any" inputMode="decimal" value={filters.o2Min} onChange={(e) => set({ o2Min: e.target.value })} />
            </label>

            <label className="mp-field">
              <span>Pressure at most (psi)</span>
              <input type="number" min="0" step="any" inputMode="decimal" value={filters.pressureMaxPsi} onChange={(e) => set({ pressureMaxPsi: e.target.value })} />
            </label>

            <button
              type="button"
              className="btn btn-ghost btn-compact"
              disabled={!active}
              onClick={() => {
                setFilters(EMPTY)
                setFromResult(null)
                setScenario(null)
                setShowAll(false)
              }}
            >
              Clear filters
            </button>
          </form>

          <p className="mp-count" role="status">
            {active
              ? `${fmt(shown.length)} of ${fmt(rows.length - ground)} investigations with test rows have ${fmt(matchingTests)} matching tests of ${fmt(data.tests.length)} loaded.`
              : `${fmt(rows.length - ground)} investigations have test rows (${fmt(data.tests.length)} tests loaded). Choose a filter to narrow them.`}
            {ground > 0 && ` ${fmt(ground)} ground ${ground === 1 ? 'study has' : 'studies have'} no test rows of their own and ${ground === 1 ? 'is' : 'are'} not filtered.`}
          </p>

          <div className="ib-tools">
            <Segmented
              label="Investigation list display"
              options={[
                { id: 'cards', label: 'Cards' },
                { id: 'table', label: 'Table' },
              ]}
              value={display}
              onChange={setDisplay}
            />
            {professional && (
              <button type="button" className="btn btn-secondary btn-compact" onClick={downloadRows}>
                Download matching tests (CSV)
              </button>
            )}
          </div>

          {display === 'table' && shown.length > 0 && (
            <div className="ev-table-wrap">
              <table>
                <caption>Investigations with their recorded tests</caption>
                <thead>
                  <tr>
                    <th scope="col">Investigation</th>
                    <th scope="col">{active ? 'Matching' : 'Tests'}</th>
                    <th scope="col">Of total</th>
                    <th scope="col">Phases</th>
                    <th scope="col">Oxygen (%)</th>
                    <th scope="col">Pressure (psi)</th>
                    <th scope="col">Oxygen not recorded</th>
                    <th scope="col">Pressure not recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.investigation.id}>
                      <th scope="row">
                        <button type="button" className="mp-link" onClick={() => onOpenDetails(r.investigation.id)}>
                          {r.investigation.label || r.investigation.acronym || r.investigation.id}
                        </button>
                      </th>
                      <td>{fmt(r.matching)}</td>
                      <td>{fmt(r.total)}</td>
                      <td>{r.phases.map(([p, n]) => `${PHASE_LABELS[p] ?? p} ${fmt(n)}`).join(', ') || '—'}</td>
                      <td>{r.o2 ? `${num(r.o2.min)}–${num(r.o2.max)}` : 'Not recorded'}</td>
                      <td>{r.pressurePsi ? `${num(r.pressurePsi.min)}–${num(r.pressurePsi.max)}` : 'Not recorded'}</td>
                      <td>{fmt(r.missingO2)}</td>
                      <td>{fmt(r.missingPressure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shown.length === 0 ? (
            <p className="ev-empty">
              <span>
                <strong>No matching tests in the loaded data.</strong> This describes the current database rows. It does not mean NASA has never run
                such an experiment.
              </span>
            </p>
          ) : display === 'table' ? null : (
            <ul className="ib-list">
              {visible.map((r) => (
                <li key={r.investigation.id} className="ib-item">
                  <div className="ib-item-head">
                    <h3>{r.investigation.label || r.investigation.acronym || r.investigation.id}</h3>
                    <span className="muted ib-id">{r.investigation.id}</span>
                    {r.investigation.tier && <span className="tag">Tier {r.investigation.tier}</span>}
                  </div>
                  {r.investigation.title && r.investigation.title !== r.investigation.label && <p className="muted">{r.investigation.title}</p>}
                  <p>
                    <b>{fmt(r.matching)}</b> of {fmt(r.total)} tests {active ? 'match' : 'recorded'}
                    {r.phases.length > 0 && <> · {r.phases.map(([p, n]) => `${PHASE_LABELS[p] ?? p} ${fmt(n)}`).join(', ')}</>}
                  </p>
                  {r.fuels.length > 0 && (
                    <p className="muted">
                      Fuels: {r.fuels.slice(0, 4).map(([f]) => f).join(', ')}
                      {r.fuels.length > 4 && ` and ${r.fuels.length - 4} more`}
                    </p>
                  )}
                  {professional ? (
                    <p className="muted ib-cond">
                      Oxygen: {r.o2 ? `${num(r.o2.min)}–${num(r.o2.max)} %` : 'not recorded'} ({fmt(r.missingO2)} tests without) · Pressure:{' '}
                      {r.pressurePsi ? `${num(r.pressurePsi.min)}–${num(r.pressurePsi.max)} psi` : 'not recorded'} ({fmt(r.missingPressure)} without)
                    </p>
                  ) : (
                    (r.missingO2 > 0 || r.missingPressure > 0) && <p className="muted">Some tests did not record oxygen or pressure.</p>
                  )}
                  <div className="fd-actions">
                    <button type="button" className="btn btn-secondary btn-compact" aria-haspopup="dialog" onClick={() => onOpenDetails(r.investigation.id)}>
                      Details
                    </button>
                    <button type="button" className="btn btn-ghost btn-compact" onClick={() => onOpenMap(r.investigation.id)}>
                      View on the map
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {shown.length > PAGE && (
            <button type="button" className="btn btn-secondary btn-compact ib-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${fmt(shown.length)}`}
            </button>
          )}

          <p className="muted ev-hint">
            Oxygen compares each test's highest recorded value, in percent. Pressure compares its lowest recorded value, stored in atm and shown in psi
            ({PSI_PER_ATM} psi per atm). Some investigations report burner-stream oxygen rather than chamber atmosphere; this browser does not separate them.
          </p>
        </>
      )}
    </section>
  )
}
