// Evidence overview: descriptive totals from the loaded database rows. These are counts, not findings,
// and none of them has an audit grade. Every metric names its source and scope.

const PHASE_LABELS = {
  solid: 'Solid fuels',
  droplet: 'Liquid droplets',
  gas: 'Gas flames',
  smoke: 'Smoke',
  unclassified: 'Phase not recorded',
}

const GRAVITY_LABELS = {
  microgravity: 'Microgravity',
  earth: 'Earth gravity',
  'not recorded': 'Not recorded',
}

const fmt = (n) => n.toLocaleString('en-US')
const share = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—')

export function formatTime(date) {
  return date ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
}

function Skeleton() {
  return (
    <div className="ev-skeleton" role="status">
      <span className="visually-hidden">Loading evidence totals…</span>
      <div className="sk-row" aria-hidden="true">
        <i /> <i /> <i /> <i />
      </div>
      <div className="sk-block" aria-hidden="true" />
      <div className="sk-block sk-short" aria-hidden="true" />
    </div>
  )
}

function Metric({ label, value, detail }) {
  return (
    <div className="ev-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail && <p>{detail}</p>}
    </div>
  )
}

// A bar split into recorded and not recorded. "Not recorded" is hatched and labeled, never drawn as zero.
function CoverageRow({ label, coverage }) {
  const { recorded, missing, total } = coverage
  return (
    <li className="ev-cov">
      <div className="ev-cov-head">
        <span>{label}</span>
        <span className="muted">{fmt(total)} tests</span>
      </div>
      <div className="ev-bar" aria-hidden="true">
        <span className="ev-bar-fill" style={{ width: `${total ? (recorded / total) * 100 : 0}%` }} />
        <span className="ev-bar-missing" style={{ width: `${total ? (missing / total) * 100 : 0}%` }} />
      </div>
      <p className="ev-cov-text">
        <span>
          <b>Recorded:</b> {fmt(recorded)} ({share(recorded, total)})
        </span>
        <span>
          <b>Not recorded:</b> {fmt(missing)} ({share(missing, total)})
        </span>
      </p>
    </li>
  )
}

export default function Evidence({ evidence, view, headingRef }) {
  const professional = view === 'cientifico'
  const { status, data, error, refreshedAt, refreshing, refresh } = evidence
  const summary = data?.summary
  const load = data?.load

  return (
    <section className="ws-panel ev" aria-labelledby="ev-title" id="evidence">
      <header className="ev-head">
        <h2 id="ev-title" ref={headingRef} tabIndex={-1}>
          Evidence overview
        </h2>
        <span className="tag">Descriptive counts · not findings</span>
      </header>

      {status === 'loading' && <Skeleton />}

      {status === 'unavailable' && (
        <div className="ev-empty">
          <p>
            <strong>No database connection.</strong> This build is not connected to Supabase, so no evidence totals are
            shown. Nothing is estimated or taken from sample files.
          </p>
          <p className="muted">
            The research assistant may read a separate local snapshot; its numbers are never combined with this panel.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="ev-empty" role="alert">
          <p>
            <strong>The evidence totals could not be loaded.</strong> {error}
          </p>
          <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}

      {status === 'ready' && summary && (
        <>
          {error && (
            <p className="ev-banner" role="alert">
              The last refresh failed ({error}). Showing data from {formatTime(refreshedAt)}.
            </p>
          )}

          {!load.complete && (
            <p className="ev-banner" role="status">
              <b>Partial totals.</b>{' '}
              {load.testExpected === null
                ? 'The database did not confirm how many test rows exist, so these totals cannot be called complete.'
                : `Loaded ${fmt(load.testRows)} of ${fmt(load.testExpected)} test rows and ${fmt(load.investigationRows)} of ${fmt(load.investigationExpected ?? 0)} investigations.`}
            </p>
          )}

          <p className="ev-source">
            Source: database tables <code>investigations</code> and <code>tests</code>, NASA PSI scope. Loaded{' '}
            {fmt(load.testRows)} test rows and {fmt(load.investigationRows)} investigations
            {refreshedAt && <> · refreshed {formatTime(refreshedAt)}</>}.
          </p>

          <dl className="ev-metrics">
            <Metric
              label="Investigations"
              value={fmt(summary.investigations.total)}
              detail={`${fmt(summary.investigations.flight)} flight, ${fmt(summary.investigations.ground)} ground studies`}
            />
            <Metric label="Tests" value={fmt(summary.tests.total)} detail="Rows in the PSI test tables" />
            <Metric
              label="With test rows"
              value={`${fmt(summary.investigations.withTestRows)} of ${fmt(summary.investigations.total)}`}
              detail={
                summary.investigations.withoutTestRows
                  ? `${fmt(summary.investigations.withoutTestRows)} have none of their own (ground studies analyze flight data). That is not zero tests.`
                  : 'Every investigation has test rows'
              }
            />
            <Metric
              label="Summaries available"
              value={`${fmt(summary.investigations.summarized)} of ${fmt(summary.investigations.total)}`}
              detail={
                summary.investigations.summarized < summary.investigations.total
                  ? 'The rest are not summarized yet'
                  : 'All investigations have summaries'
              }
            />
          </dl>

          <div className="ev-columns">
            <section aria-labelledby="ev-phases">
              <h3 id="ev-phases">Tests by fuel phase</h3>
              <ul className="ev-list">
                {summary.tests.phases.map((phase) => (
                  <li key={phase.key}>
                    <div className="ev-cov-head">
                      <span>{PHASE_LABELS[phase.key]}</span>
                      <span>
                        <b>{fmt(phase.tests)}</b> <span className="muted">({share(phase.tests, summary.tests.total)})</span>
                      </span>
                    </div>
                    <div className="ev-bar" aria-hidden="true">
                      <span
                        className="ev-bar-fill"
                        style={{ width: `${summary.tests.total ? (phase.tests / summary.tests.total) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="ev-cov">
              <h3 id="ev-cov">Missing-data coverage</h3>
              <ul className="ev-list">
                <CoverageRow label="Oxygen level" coverage={summary.tests.o2} />
                <CoverageRow label="Pressure" coverage={summary.tests.pressure} />
              </ul>
              <p className="muted ev-hint">
                {professional
                  ? 'Recorded means the source table gave a value. Not recorded is missing data, which is different from a value of zero.'
                  : 'Some experiments did not write down oxygen or pressure. We show those as "not recorded", never as zero.'}
              </p>
            </section>
          </div>

          <section className="ev-notes" aria-labelledby="ev-notes">
            <h3 id="ev-notes">Read these numbers with care</h3>
            <ul>
              <li>
                Gravity in these tests:{' '}
                {summary.tests.gravity.map((g, i) => (
                  <span key={g.key}>
                    {i > 0 && ', '}
                    {GRAVITY_LABELS[g.key] ?? g.key} {fmt(g.count)}
                  </span>
                ))}
                . NASA PSI has no partial-gravity combustion data, so microgravity results do not directly describe
                lunar or Mars gravity.
              </li>
              <li>
                Oxygen values are copied from each source table. Some investigations report the burner stream instead
                of the chamber atmosphere, and this overview does not separate them.
              </li>
              <li>These totals describe the data. They are not audited findings and carry no confidence grade.</li>
            </ul>
          </section>

          {professional && (
            <details className="ev-details">
              <summary>Data table and units</summary>
              <div className="ev-table-wrap">
                <table>
                  <caption>Tests per fuel phase, with oxygen and pressure coverage</caption>
                  <thead>
                    <tr>
                      <th scope="col">Phase</th>
                      <th scope="col">Tests</th>
                      <th scope="col">Share</th>
                      <th scope="col">Oxygen recorded</th>
                      <th scope="col">Pressure recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tests.phases.map((phase) => (
                      <tr key={phase.key}>
                        <th scope="row">{PHASE_LABELS[phase.key]}</th>
                        <td>{fmt(phase.tests)}</td>
                        <td>{share(phase.tests, summary.tests.total)}</td>
                        <td>{fmt(phase.o2)}</td>
                        <td>{fmt(phase.pressure)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">All tests</th>
                      <td>{fmt(summary.tests.total)}</td>
                      <td>100%</td>
                      <td>{fmt(summary.tests.o2.recorded)}</td>
                      <td>{fmt(summary.tests.pressure.recorded)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="muted ev-hint">
                Units: oxygen in percent (mole and volume fraction treated as equal), pressure in atm as stored. A row
                counts as recorded when its minimum or maximum value is present. Totals are computed in the browser
                from the loaded rows; no finding calculation happens here.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  )
}
