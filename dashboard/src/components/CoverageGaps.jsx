import { coverageByPhase } from '../lib/browse.js'

const PHASE_LABELS = { solid: 'Solid fuels', droplet: 'Liquid droplets', gas: 'Gas flames', smoke: 'Smoke', unclassified: 'Phase not recorded' }
const fmt = (n) => n.toLocaleString('en-US')
const pct = (n, t) => (t ? `${((n / t) * 100).toFixed(0)}%` : '—')

function Bar({ missing, total }) {
  return (
    <div className="ev-bar" aria-hidden="true">
      <span className="ev-bar-fill" style={{ width: `${total ? ((total - missing) / total) * 100 : 0}%` }} />
      <span className="ev-bar-missing" style={{ width: `${total ? (missing / total) * 100 : 0}%` }} />
    </div>
  )
}

// Where the loaded data is thin: oxygen and pressure not recorded, per fuel phase, and ground studies without
// their own test rows. Everything is about the rows currently loaded. It is not a claim about what NASA has or
// has not done, and "not recorded" is never drawn as zero.
export default function CoverageGaps({ evidence }) {
  const { status, data } = evidence
  if (status !== 'ready' || !data) return null

  const rows = coverageByPhase(data.tests)
  const ground = data.graph.investigations.filter((i) => !data.graph.testCounts[i.id])
  const unreviewed = data.graph.investigations.filter((i) => !i.summary_student).length

  return (
    <section className="ws-panel cg" aria-labelledby="cg-title">
      <header className="ev-head">
        <h2 id="cg-title">Where the data is thin</h2>
        <span className="tag">Loaded rows only</span>
      </header>

      <p className="muted ev-hint">
        "Not recorded" means the source table gave no value. These gaps describe the rows currently loaded; they do not say what NASA has never tested.
      </p>

      <ul className="ev-list">
        {rows.map((r) => (
          <li key={r.phase}>
            <div className="ev-cov-head">
              <span>{PHASE_LABELS[r.phase]}</span>
              <span className="muted">{fmt(r.tests)} tests</span>
            </div>
            <div className="cg-pair">
              <div>
                <Bar missing={r.noO2} total={r.tests} />
                <p className="ev-cov-text">
                  <span>
                    <b>Oxygen not recorded:</b> {fmt(r.noO2)} ({pct(r.noO2, r.tests)})
                  </span>
                </p>
              </div>
              <div>
                <Bar missing={r.noPressure} total={r.tests} />
                <p className="ev-cov-text">
                  <span>
                    <b>Pressure not recorded:</b> {fmt(r.noPressure)} ({pct(r.noPressure, r.tests)})
                  </span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ul className="cg-notes">
        <li>
          {fmt(ground.length)} investigation{ground.length === 1 ? ' has' : 's have'} no test rows of {ground.length === 1 ? 'its' : 'their'} own (for example ground
          studies that analyze flight data). That is not zero tests.
        </li>
        <li>{fmt(unreviewed)} of {fmt(data.graph.investigations.length)} investigations have no published summary yet.</li>
        <li>
          NASA PSI has no partial-gravity combustion data, so microgravity results do not directly describe lunar or Mars gravity.
        </li>
      </ul>
    </section>
  )
}
