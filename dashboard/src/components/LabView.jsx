import { useMemo, useState } from 'react'
import { PHASES } from '../lib/browse.js'
import { OFFICIAL, UNAVAILABLE, compare, isDefault, questionFor } from '../lib/lab.js'
import { SCENARIOS } from '../lib/scenarios.js'

const PHASE_LABELS = { solid: 'Solid fuels', droplet: 'Liquid droplets', gas: 'Gas flames', smoke: 'Smoke', unclassified: 'Phase not recorded' }
const fmt = (n) => n.toLocaleString('en-US')
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0')

// The interpretation lab: a sensitivity check on counts of loaded test rows under reading choices the data supports.
// It is NOT a predictive fire simulator, it is not a finding, and nothing here is saved. Controls that need data
// the database does not hold are listed as unavailable with the missing requirement.
export default function LabView({ evidence, view, labelFor }) {
  const professional = view === 'cientifico'
  const { status, data, error, refresh, refreshing } = evidence
  const [lab, setLab] = useState({ ...OFFICIAL })
  const [copied, setCopied] = useState(false)

  const result = useMemo(() => (data ? compare({ tests: data.tests, investigations: data.graph.investigations, lab }) : null), [data, lab])
  const set = (patch) => {
    setCopied(false)
    setLab((l) => ({ ...l, ...patch }))
  }
  const same = result && result.totals.official === result.totals.lab && result.changed.length === 0
  const question = questionFor(lab)
  const scenario = SCENARIOS.find((s) => s.id === 'lunar_base')

  return (
    <section className="ws-panel lab" aria-labelledby="lab-title">
      <header className="ev-head">
        <h2 id="lab-title" tabIndex={-1}>
          Interpretation lab
        </h2>
        <span className="tag lab-tag">Exploration, ungraded. Not a finding.</span>
      </header>

      <p className="fd-note" role="note">
        Exploration, ungraded. Not a finding. The lab recounts the loaded test rows under a different reading to see whether a count holds. It is not a
        prediction, not a fire simulator, and nothing you set here is saved.
      </p>

      {status === 'loading' && (
        <div className="ev-skeleton" role="status">
          <span className="visually-hidden">Loading the data…</span>
          <div className="sk-block" aria-hidden="true" />
        </div>
      )}
      {status === 'unavailable' && (
        <div className="ev-empty">
          <p>
            <strong>The lab needs the database.</strong> This build is not connected to Supabase, so there are no test rows to recount. Nothing is taken from sample files.
          </p>
        </div>
      )}
      {status === 'error' && (
        <div className="ev-empty" role="alert">
          <p>
            <strong>The data could not be loaded.</strong> {error}
          </p>
          <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && result && (
        <>
          <form className="ib-filters" onSubmit={(e) => e.preventDefault()} aria-label="Reading choices">
            <label className="mp-field">
              <span>Oxygen threshold (%)</span>
              <input type="number" min="0" max="100" step="any" inputMode="decimal" value={lab.o2Min} onChange={(e) => set({ o2Min: e.target.value })} />
            </label>
            <label className="mp-field">
              <span>Oxygen value read from each test</span>
              <select value={lab.o2Reading} onChange={(e) => set({ o2Reading: e.target.value })}>
                <option value="highest">Highest recorded value (documented)</option>
                <option value="lowest">Lowest recorded value</option>
              </select>
            </label>
            <label className="mp-field">
              <span>Pressure limit (psi)</span>
              <input type="number" min="0" step="any" inputMode="decimal" value={lab.pressureMaxPsi} onChange={(e) => set({ pressureMaxPsi: e.target.value })} />
            </label>
            <label className="mp-field">
              <span>Pressure value read from each test</span>
              <select value={lab.pressureReading} onChange={(e) => set({ pressureReading: e.target.value })}>
                <option value="lowest">Lowest recorded value (documented)</option>
                <option value="highest">Highest recorded value</option>
              </select>
            </label>
            <label className="mp-field">
              <span>Investigations</span>
              <select value={lab.tier} onChange={(e) => set({ tier: e.target.value === 'all' ? 'all' : 1 })}>
                <option value="all">All tiers</option>
                <option value="1">Tier 1 only</option>
              </select>
            </label>
            <label className="mp-field">
              <span>Fuel phase</span>
              <select value={lab.phase} onChange={(e) => set({ phase: e.target.value })}>
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
              <input value={lab.fuel} onChange={(e) => set({ fuel: e.target.value })} placeholder="For example PMMA" />
            </label>
            <button type="button" className="btn btn-ghost btn-compact" disabled={isDefault(lab)} onClick={() => set({ ...OFFICIAL })}>
              Back to the documented reading
            </button>
          </form>

          <p className="muted ev-hint">
            Documented reading: a test counts when its highest recorded oxygen is at least {OFFICIAL.o2Min}% and its lowest recorded pressure is at most {OFFICIAL.pressureMaxPsi} psi. The{' '}
            {scenario.label.toLowerCase()} is sourced from {scenario.source}. A test with no oxygen or no pressure value never counts.
          </p>

          <div className="ev-table-wrap">
            <table aria-describedby="lab-verdict">
              <caption>Tests that reach both conditions, by fuel phase</caption>
              <thead>
                <tr>
                  <th scope="col">Fuel phase</th>
                  <th scope="col">Tests</th>
                  <th scope="col">Documented reading</th>
                  <th scope="col">Your reading</th>
                  <th scope="col">Difference</th>
                  <th scope="col">Oxygen not recorded</th>
                  <th scope="col">Pressure not recorded</th>
                </tr>
              </thead>
              <tbody>
                {result.phases
                  .filter((p) => p.tests > 0)
                  .map((p) => (
                    <tr key={p.phase}>
                      <th scope="row">{PHASE_LABELS[p.phase]}</th>
                      <td>{fmt(p.tests)}</td>
                      <td>{fmt(p.official)}</td>
                      <td>{fmt(p.lab)}</td>
                      <td>{signed(p.lab - p.official)}</td>
                      <td>{fmt(p.noO2)}</td>
                      <td>{fmt(p.noPressure)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All</th>
                  <td>{fmt(result.totals.tests)}</td>
                  <td>{fmt(result.totals.official)}</td>
                  <td>{fmt(result.totals.lab)}</td>
                  <td>{signed(result.totals.lab - result.totals.official)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p id="lab-verdict" className="lab-verdict" role="status">
            {same
              ? 'Robust to these choices: the counts are the same under your reading and the documented reading.'
              : `These choices change the count by ${signed(result.totals.lab - result.totals.official)} tests, across ${result.changed.length} investigation${result.changed.length === 1 ? '' : 's'}.`}
            {isDefault(lab) && ' You are using the documented reading, so the two columns are identical by design.'}
          </p>

          {result.changed.length > 0 && (
            <details className="ev-details" open>
              <summary>Investigations whose count changes ({result.changed.length})</summary>
              <ul>
                {result.changed.map((c) => (
                  <li key={c.id}>
                    {labelFor(c.id)}: {fmt(c.official)} documented, {fmt(c.lab)} yours ({signed(c.difference)})
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="lab-ask" aria-labelledby="lab-ask-title">
            <h3 id="lab-ask-title">Keep a result as a real question</h3>
            <p>
              A lab result is not a finding. To get one that is calculated by code and independently audited, ask it as a question through <code>/ask</code> in Claude Code.
              The browser cannot start that.
            </p>
            <p className="rr-q">{question}</p>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`/ask "${question}"`)
                  setCopied(true)
                } catch {
                  setCopied(false)
                }
              }}
            >
              Copy as an /ask command
            </button>
            {copied && <span role="status"> Copied.</span>}
          </section>

          <section aria-labelledby="lab-missing-title">
            <h3 id="lab-missing-title">Not available yet</h3>
            <ul className="lab-unavailable">
              {UNAVAILABLE.map((u) => (
                <li key={u.label}>
                  <b>{u.label}.</b> <span className="muted">{u.need}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="muted ev-hint">
            Counts use the loaded database rows ({fmt(data.tests.length)} tests). Some investigations report burner-stream oxygen rather than chamber atmosphere, and the lab does not separate them. Every test is
            microgravity, so none of this describes lunar gravity.{professional ? ' Pressure is stored in atm and converted to psi (14.6959 psi per atm).' : ''}
          </p>
        </>
      )}
    </section>
  )
}
