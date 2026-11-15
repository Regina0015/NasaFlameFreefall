import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import GradeBadge from './GradeBadge.jsx'
import { citedRows } from '../lib/investigation.js'

const FindingChart = lazy(() => import('./FindingChart.jsx'))
const ProofGraph = lazy(() => import('./ProofGraph.jsx'))

const fmt = (n) => n.toLocaleString('en-US')
const RESULT_LABELS = { pass: 'Passed', fail: 'Did not pass', not_applicable: 'Not applicable' }
const RESULT_ICONS = { pass: '✓', fail: '✕', not_applicable: '–' }

function Step({ number, title, children }) {
  return (
    <section className="fd-step" aria-labelledby={`fd-step-${number}`}>
      <h3 id={`fd-step-${number}`}>
        <span className="fd-step-no" aria-hidden="true">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

const PAGE = 25
const cell = (v) => (v === null || v === undefined || v === '' ? '—' : v)

// The rows a finding cites, as they appear in the loaded database. Matched by source table and row number.
function CitedRows({ evidence, tests }) {
  const [shown, setShown] = useState(PAGE)
  if (!tests) {
    return <p className="muted">The database rows are not loaded, so the cited rows cannot be shown here.</p>
  }
  const { found, cited, tableLoaded } = citedRows(evidence, tests)
  if (tableLoaded === 0) {
    return (
      <p className="muted">
        This table is not in the loaded database rows. The finding was calculated from the local snapshot, and the dashboard will not guess its rows.
      </p>
    )
  }
  return (
    <div>
      <p className="muted">
        {cited === null
          ? `All ${found.length.toLocaleString('en-US')} loaded rows of this table.`
          : `${found.length.toLocaleString('en-US')} of ${cited.toLocaleString('en-US')} cited rows found in the loaded database rows.`}{' '}
        Oxygen in percent; pressure in atm as stored.
      </p>
      <div className="ev-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Fuel</th>
              <th scope="col">Phase</th>
              <th scope="col">O2 min</th>
              <th scope="col">O2 max</th>
              <th scope="col">Pressure min</th>
              <th scope="col">Pressure max</th>
              <th scope="col">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {found.slice(0, shown).map((t) => (
              <tr key={t.test_id}>
                <th scope="row">{t.source_row}</th>
                <td>{cell(t.fuel)}</td>
                <td>{cell(t.phase)}</td>
                <td>{cell(t.o2_pct_min)}</td>
                <td>{cell(t.o2_pct_max)}</td>
                <td>{cell(t.pressure_atm_min)}</td>
                <td>{cell(t.pressure_atm_max)}</td>
                <td>{cell(t.outcome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {found.length > shown && (
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, found.length - shown)} more
        </button>
      )}
    </div>
  )
}

function List({ items, empty }) {
  return items.length ? (
    <ul>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">{empty}</p>
  )
}

// The evidence drawer: claim -> calculation -> source rows -> DOI -> matching audit.
// A nonmodal-looking panel that behaves as a dialog: focus moves in, Tab stays inside, Escape closes.
export default function EvidenceDrawer({ item, view, labelFor, onClose, tests = null }) {
  const professional = view === 'cientifico'
  const { finding, audit, verdict } = item
  const panel = useRef(null)
  const title = useRef(null)
  const [showChart, setShowChart] = useState(false)
  const [showGraph, setShowGraph] = useState(false)

  useEffect(() => {
    title.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = panel.current?.querySelectorAll('button:not([disabled]), a[href], summary, input:not([disabled])')
      if (!nodes?.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const checks = audit?.checks ?? []
  const failed = checks.filter((c) => c.result === 'fail')
  const passed = checks.filter((c) => c.result === 'pass')
  const investigations = [...new Set((finding?.evidence ?? []).map((e) => e.investigation))]
  const dois = [...new Map((finding?.evidence ?? []).map((e) => [e.doi, e.investigation])).entries()]

  return (
    <>
      <div className="fd-scrim" aria-hidden="true" onClick={onClose} />
      <aside ref={panel} className="fd-drawer" role="dialog" aria-modal="true" aria-labelledby="fd-title">
        <header className="fd-drawer-head">
          <div>
            <p className="eyebrow">
              {item.id}
              {professional && finding && ` · version ${finding.version}`}
            </p>
            <h2 id="fd-title" ref={title} tabIndex={-1}>
              {finding?.question ?? item.id}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost btn-compact" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="fd-drawer-body">
          <GradeBadge verdict={verdict} />

          {verdict.reasons.map((reason) => (
            <p key={reason} className="fd-note">
              {reason}
            </p>
          ))}

          {!verdict.showClaim && (
            <Step number="!" title="Why this is not shown as a result">
              <p>
                {verdict.category === 'pending'
                  ? 'This finding has no audit that matches its current version, so its claim is not shown. Nothing here is verified.'
                  : 'The claim of this finding is not shown as a conclusion.'}
              </p>
              <p className="muted">{item.auditNote}</p>
            </Step>
          )}

          {verdict.showClaim && (
            <>
              <Step number="1" title="Claim">
                <p className="fd-claim">{finding.claim}</p>
                <p>{professional ? finding.summary_professional : finding.summary_student}</p>
                {finding.warnings.length > 0 && (
                  <div className="fd-warnings" role="note">
                    <h4>Warnings</h4>
                    <List items={finding.warnings} empty="" />
                  </div>
                )}
                <h4>Limitations</h4>
                <List items={finding.limitations} empty="None stated." />
                {professional && (
                  <>
                    <h4>Assumptions</h4>
                    <List items={finding.assumptions} empty="None stated." />
                  </>
                )}
              </Step>

              <Step number="2" title="Calculation">
                <p>
                  {professional
                    ? `Computed by code (${finding.method.script}, function ${finding.method.function}) over ${fmt(finding.n_tests)} tests.`
                    : `Calculated by code from the cited tables. Checked against ${fmt(finding.n_tests)} tests.`}
                </p>
                {professional && (
                  <>
                    <details className="ev-details">
                      <summary>Method, parameters and formula</summary>
                      <p>{finding.method.formula}</p>
                      <pre className="fd-pre">{JSON.stringify(finding.method.params, null, 2)}</pre>
                    </details>
                    <div className="ev-table-wrap">
                      <table>
                        <caption>Values</caption>
                        <thead>
                          <tr>
                            <th scope="col">Name</th>
                            <th scope="col">Value</th>
                            <th scope="col">Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(finding.values).map(([name, v]) => (
                            <tr key={name}>
                              <th scope="row">{name}</th>
                              <td>{v.value === null ? 'No data' : v.value}</td>
                              <td>{v.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {!professional && <p className="muted">Switch to Professional for the formula and the values table.</p>}
              </Step>

              <Step number="3" title="Source rows">
                {!professional && (
                  <p>
                    From {investigations.map(labelFor).join(' and ')} (NASA PSI).
                  </p>
                )}
                <ul className="fd-sources">
                  {finding.evidence.map((e, i) => (
                    <li key={`${e.table}-${i}`}>
                      <b>{labelFor(e.investigation)}</b>
                      {professional && (
                        <>
                          <br />
                          Table: <code>{e.table}</code>
                          <br />
                          Columns: {e.columns.join('; ')}
                          <br />
                          Rows: {e.rows === 'all' ? 'all rows of the table' : `${fmt(e.rows.length)} rows`}
                          {e.rows !== 'all' && (
                            <details className="ev-details">
                              <summary>Row numbers</summary>
                              <p>{e.rows.join(', ')}</p>
                            </details>
                          )}
                          <details className="ev-details">
                            <summary>Cited rows in the loaded database</summary>
                            <CitedRows evidence={e} tests={tests} />
                          </details>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </Step>

              <Step number="4" title="DOI">
                <ul>
                  {dois.map(([doi, inv]) => (
                    <li key={doi}>
                      {labelFor(inv)}:{' '}
                      <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer">
                        {doi}
                      </a>
                    </li>
                  ))}
                </ul>
              </Step>
            </>
          )}

          <Step number={verdict.showClaim ? '5' : '?'} title="Matching audit">
            <p>{item.auditNote}</p>
            {audit && (
              <>
                <p>
                  {professional
                    ? `${passed.length} of ${checks.length} checks passed, ${failed.length} did not pass, ${checks.length - passed.length - failed.length} not applicable.`
                    : failed.length
                      ? `Some checks did not pass: ${failed.map((c) => c.name).join(', ')}.`
                      : `Every check passed${finding ? `, against ${fmt(finding.n_tests)} tests` : ''}.`}
                </p>

                {professional && (
                  <div className="ev-table-wrap">
                    <table>
                      <caption>Checks C0 to C9 (rules in _config/confidence.md)</caption>
                      <thead>
                        <tr>
                          <th scope="col">Check</th>
                          <th scope="col">Result</th>
                          <th scope="col">Done by</th>
                          <th scope="col">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checks.map((c) => (
                          <tr key={c.id}>
                            <th scope="row">
                              {c.id} {c.name}
                            </th>
                            <td className="fd-result" data-result={c.result}>
                              <span aria-hidden="true">{RESULT_ICONS[c.result]}</span> {RESULT_LABELS[c.result]}
                            </td>
                            <td>{c.done_by}</td>
                            <td className="fd-detail">{c.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {professional && audit.recalculation?.length > 0 && (
                  <details className="ev-details">
                    <summary>Recalculation ({audit.recalculation.length} values)</summary>
                    <div className="ev-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Value</th>
                            <th scope="col">Finding</th>
                            <th scope="col">Recalculated</th>
                            <th scope="col">Unit</th>
                            <th scope="col">Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit.recalculation.map((r) => (
                            <tr key={r.value_name}>
                              <th scope="row">{r.value_name}</th>
                              <td>{r.finding_value ?? 'No data'}</td>
                              <td>{r.recalculated_value ?? 'No data'}</td>
                              <td>{r.unit}</td>
                              <td>{r.match ? '✓ Yes' : '✕ No'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {professional && audit.text_review?.length > 0 && (
                  <details className="ev-details">
                    <summary>Text review (check C8)</summary>
                    <ul>
                      {audit.text_review.map((q, i) => (
                        <li key={`${q.question_id}-${q.field}-${i}`}>
                          <b>
                            {q.question_id} · {q.field}
                          </b>{' '}
                          ({q.done_by}): expected {q.expected}, answered {q.answer ?? 'not answered'}.
                          <br />
                          <span className="muted">{q.reason}</span>
                          {q.dismissed && <span className="muted"> Dismissed by a reviewer.</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <p className="muted">
                  Audited by {audit.audited_by?.script ?? 'the Auditor'}
                  {audit.audited_by?.model ? ` with model ${audit.audited_by.model}` : ' (no model was used for the text review)'}
                  {audit.audited_by?.date ? `, ${new Date(audit.audited_by.date).toLocaleString()}` : ''}.
                </p>
              </>
            )}
          </Step>

          <section className="fd-step" aria-labelledby="fd-visuals">
            <h3 id="fd-visuals">
              <span className="fd-step-no" aria-hidden="true">
                +
              </span>
              Visuals
            </h3>
            <div className="fd-actions">
              {verdict.chart.allowed ? (
                <button type="button" className="btn btn-secondary btn-compact" aria-expanded={showChart} onClick={() => setShowChart((v) => !v)}>
                  {showChart ? 'Hide chart' : 'Load chart'}
                </button>
              ) : (
                <p className="muted">Chart: {verdict.chart.reason}</p>
              )}
              {verdict.graph.allowed ? (
                <button type="button" className="btn btn-secondary btn-compact" aria-expanded={showGraph} onClick={() => setShowGraph((v) => !v)}>
                  {showGraph ? 'Hide proof graph' : 'Show proof graph'}
                </button>
              ) : (
                <p className="muted">Proof graph: {verdict.graph.reason}</p>
              )}
            </div>
            <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
              {showChart && verdict.chart.allowed && <FindingChart chart={finding.chart} />}
              {showGraph && verdict.graph.allowed && <ProofGraph graph={finding.graph} labelFor={labelFor} />}
            </Suspense>
          </section>
        </div>
      </aside>
    </>
  )
}
