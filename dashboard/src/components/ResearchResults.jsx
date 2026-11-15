import { lazy, Suspense, useMemo, useState } from 'react'
import GradeBadge from './GradeBadge.jsx'
import ResearchSearch from './ResearchSearch.jsx'
import { actionsFrom } from '../chat/actions.js'

const FindingChart = lazy(() => import('./FindingChart.jsx'))

// The research results view. It replaces the overview in the main workspace; nothing is overlaid.
// It shows ONE turn of the shared conversation: the question, its state, the answer in sections, its sources and
// warnings, the audit status of any finding the assistant consulted (read from the real matching audit, not from
// the assistant's words), related records, and optional actions. Assistant answers stay ungraded.
function paragraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export default function ResearchResults({ chat, view, findings, investigations, labelFor, activeId, onActive, onSubmit, onSeeStatus, onOpenEvidence, onApplyBrowser, onOpenMap }) {
  const professional = view === 'cientifico'
  const { turns } = chat
  const latest = turns.at(-1) ?? null
  const turn = turns.find((t) => t.id === activeId) ?? latest
  const isLatest = turn && latest && turn.id === latest.id
  const [chartOpen, setChartOpen] = useState(null) // finding id whose stored chart was requested

  const meta = turn?.reply?.meta
  const consulted = useMemo(() => {
    if (!meta || meta.rejected) return []
    return (meta.findings ?? []).map((f) => ({ reported: f, item: findings.items.find((i) => i.id === f.id) ?? null }))
  }, [meta, findings.items])
  // Optional actions: validated against the records this browser has loaded; each one is a button the person presses.
  const acts = useMemo(() => actionsFrom(meta, { investigations, findingItems: findings.items }), [meta, investigations, findings.items])
  const consultedIds = new Set(consulted.map((c) => c.reported.id))
  const extraFindings = acts.findings.filter((f) => !consultedIds.has(f.id))
  const hasActions = acts.filters.length + acts.investigations.length + extraFindings.length > 0

  return (
    <section className="ws-panel rr" aria-labelledby="rr-title">
      <header className="rr-head">
        <h2 id="rr-title" tabIndex={-1}>
          Research results
        </h2>
        <button type="button" className="btn btn-secondary btn-compact" onClick={onSeeStatus}>
          See status
        </button>
      </header>

      <ResearchSearch chat={chat} onSubmit={onSubmit} heading="Ask a follow-up" />

      {turns.length > 1 && (
        <nav className="rr-turns" aria-label="Questions in this conversation">
          <h3>Questions</h3>
          <ol>
            {turns.map((t, index) => (
              <li key={t.id}>
                <button type="button" className="rs-chip" aria-current={turn && t.id === turn.id ? 'true' : undefined} onClick={() => onActive(t.id === latest.id ? null : t.id)}>
                  {index + 1}. {t.question.length > 70 ? `${t.question.slice(0, 69)}…` : t.question}
                </button>
              </li>
            ))}
          </ol>
          {!isLatest && (
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => onActive(null)}>
              Go to the latest result
            </button>
          )}
        </nav>
      )}

      {!turn && (
        <p className="ev-empty">
          <span>
            <strong>No question yet.</strong> Ask about NASA combustion evidence above. The answer will appear here.
          </span>
        </p>
      )}

      {turn && (
        <article className="rr-turn" aria-labelledby="rr-question">
          <section className="rr-section">
            <h3 id="rr-question">Your question</h3>
            <p className="rr-q">{turn.question}</p>
          </section>

          {turn.pending && (
            <section className="rr-section" role="status">
              <h3>Answer</h3>
              <div className="ev-skeleton" aria-hidden="true">
                <div className="sk-block sk-short" />
              </div>
              <p>
                Checking the data… {chat.seconds >= 8 ? `${chat.seconds} s so far. The local model can be slow.` : ''}
              </p>
              <button type="button" className="btn btn-secondary btn-compact" onClick={chat.stop}>
                Stop waiting
              </button>
            </section>
          )}

          {!turn.pending && !turn.reply && (
            <section className="rr-section" role="alert">
              <h3>Answer</h3>
              <p>This question has no answer. It may have been cleared or interrupted.</p>
            </section>
          )}

          {turn.reply?.error && (
            <section className="rr-section" role="alert">
              <h3>Answer</h3>
              <p className="rr-error">{turn.reply.content}</p>
              {isLatest && !chat.busy && (
                <button type="button" className="btn btn-secondary btn-compact" onClick={chat.retry}>
                  Retry this question
                </button>
              )}
            </section>
          )}

          {turn.reply && !turn.reply.error && meta?.rejected && (
            <section className="rr-section" role="status">
              <h3>Not answered</h3>
              <p>{turn.reply.content}</p>
            </section>
          )}

          {turn.reply && !turn.reply.error && !meta?.rejected && (
            <>
              <section className="rr-section" aria-labelledby="rr-answer">
                <div className="rr-section-head">
                  <h3 id="rr-answer">Answer</h3>
                  <span className="tag">Ungraded answer</span>
                </div>
                <p className="fd-note">
                  This answer is ungraded. It is not an audited finding, and the dashboard cannot verify its wording. Check its sources below.
                </p>
                {paragraphs(turn.reply.content).map((p, i) => (
                  <p key={i} className="rr-answer">
                    {p}
                  </p>
                ))}
              </section>

              {(meta.warnings?.length > 0 || meta.no_tools || !meta.check?.ok) && (
                <section className="rr-section" aria-labelledby="rr-warnings">
                  <h3 id="rr-warnings">Warnings</h3>
                  <ul className="rr-list">
                    {meta.warnings?.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {meta.no_tools && <li>This answer did not check the data. Treat it as guidance only.</li>}
                    {!meta.check?.ok && <li>Numbers not found in the data checked: {meta.check?.unsourced_numbers?.join(', ')}. Verify them.</li>}
                  </ul>
                </section>
              )}

              <section className="rr-section" aria-labelledby="rr-sources">
                <h3 id="rr-sources">Sources and checks</h3>
                {meta.tools?.length ? (
                  <ul className="rr-list">
                    {meta.tools.map((t, i) => (
                      <li key={i}>
                        {t.name === 'query_tests' && 'Counted test rows in the local data snapshot.'}
                        {t.name === 'check_environment' && 'Compared tests with a sourced habitat definition, in the local data snapshot.'}
                        {t.name === 'get_findings' && 'Looked up findings and investigation summaries.'}
                        {!['query_tests', 'check_environment', 'get_findings'].includes(t.name) && `Ran ${t.name}.`}
                        {t.error && ` It failed: ${t.error}`}
                        {professional && (
                          <>
                            {' '}
                            <code>
                              {t.name}({JSON.stringify(t.args)})
                            </code>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No data tool ran for this answer.</p>
                )}
                {meta.notes?.map((n) => (
                  <p key={n} className="muted">
                    {n}
                  </p>
                ))}
                <p className="muted">
                  {meta.check?.ok ? 'Every number in the answer was found in the data the assistant checked.' : 'Some numbers were not found in the data checked (see warnings).'} The assistant reads a local snapshot, which can differ from the database
                  shown elsewhere in this dashboard.
                </p>
              </section>

              <section className="rr-section" aria-labelledby="rr-audit">
                <h3 id="rr-audit">Audit status</h3>
                {consulted.length === 0 ? (
                  <p>No finding was consulted for this answer, so it has no audit status. It stays an ungraded answer.</p>
                ) : (
                  <ul className="rr-findings">
                    {consulted.map(({ reported, item }) => (
                      <li key={reported.id} className="fs-item">
                        <strong>{reported.id}</strong>
                        {item ? (
                          <>
                            <GradeBadge verdict={item.verdict} />
                            <p className="rr-q">{item.finding?.question}</p>
                            {item.verdict.grade !== reported.grade && (
                              <p className="muted">
                                The assistant reported grade {String(reported.grade)}. The dashboard shows the status of the audit that matches the current finding file.
                              </p>
                            )}
                            <div className="fd-actions">
                              <button type="button" className="btn btn-secondary btn-compact" aria-haspopup="dialog" onClick={(e) => onOpenEvidence(item.id, e.currentTarget)}>
                                Open evidence
                              </button>
                              {item.verdict.chart.allowed ? (
                                <button type="button" className="btn btn-secondary btn-compact" aria-expanded={chartOpen === item.id} onClick={() => setChartOpen((c) => (c === item.id ? null : item.id))}>
                                  {chartOpen === item.id ? 'Hide stored chart' : 'Load stored chart'}
                                </button>
                              ) : (
                                <span className="muted">Chart: {item.verdict.chart.reason}</span>
                              )}
                            </div>
                            {chartOpen === item.id && item.verdict.chart.allowed && (
                              <Suspense fallback={<p className="muted" role="status">Loading chart…</p>}>
                                <FindingChart chart={item.finding.chart} />
                              </Suspense>
                            )}
                          </>
                        ) : (
                          <p className="muted">This finding is not in the findings source the dashboard loaded, so its audit status cannot be shown.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rr-section" aria-labelledby="rr-records">
                <h3 id="rr-records">Open in the dashboard</h3>
                {!hasActions ? (
                  <p className="muted">
                    This answer carries no dashboard actions, so nothing is opened automatically. Findings it consulted are listed under Audit status. You can also browse the{' '}
                    <button type="button" className="mp-link" onClick={onSeeStatus}>
                      research overview
                    </button>
                    .
                  </p>
                ) : (
                  <>
                    <p className="muted">Nothing opens on its own. Each button below was built from the data the assistant actually looked up.</p>
                    <ul className="rr-list">
                      {acts.filters.map((action) => (
                        <li key={action.description}>
                          Tests counted with: {action.description}.{' '}
                          <button type="button" className="btn btn-secondary btn-compact" onClick={() => onApplyBrowser(action)}>
                            Apply in the investigation browser
                          </button>
                        </li>
                      ))}
                      {acts.investigations.map((record) => (
                        <li key={record.id}>
                          <button type="button" className="mp-link" onClick={() => onOpenMap(record.id)}>
                            View {labelFor(record.id)} on the map
                          </button>{' '}
                          <span className="muted">{record.title && record.title !== labelFor(record.id) ? record.title : record.id}</span>
                        </li>
                      ))}
                      {extraFindings.map((item) => (
                        <li key={item.id}>
                          <GradeBadge verdict={item.verdict} />{' '}
                          <button type="button" className="mp-link" aria-haspopup="dialog" onClick={(e) => onOpenEvidence(item.id, e.currentTarget)}>
                            Open evidence for {item.id}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section className="rr-section" aria-labelledby="rr-charts">
                <h3 id="rr-charts">Charts</h3>
                <p className="muted">
                  The assistant does not generate charts. A chart appears only from the stored chart of a consulted finding whose audit passed the chart check (see Audit status).
                </p>
              </section>
            </>
          )}
        </article>
      )}
    </section>
  )
}
