import { lazy, memo, Suspense, useMemo, useState } from 'react'
import GradeBadge from './GradeBadge.jsx'
import AnswerVisual, { hasVisual } from './AnswerVisual.jsx'
import { buildAnswerModel, fmtRange } from '../lib/answerModel.js'
import { termsFor } from '../lib/glossary.js'
import { actionsFrom } from '../chat/actions.js'

const FindingChart = lazy(() => import('./FindingChart.jsx'))

// One question and its answer in the research history. Student and Professional render the SAME answer model and
// the SAME audit states; they differ in wording, density and what is open by default. Nothing here calls the model
// again, so switching profile or opening details never changes a value.
// An answer is always "ungraded": a finding's grade is shown only next to that finding, never for the whole answer.

function paragraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

// Fixed wording that explains HOW to read the values. It describes the counting, never advises and never judges risk.
function meaningFor(block) {
  switch (block?.type) {
    case 'count':
      return `The assistant counted ${block.n}${block.of != null ? ` of ${block.of}` : ''} test rows for: ${block.scope}.${block.noneMatch ? ' None of those rows met the conditions. That describes the rows in this snapshot only; it does not say what happens at conditions that were not tested.' : ''}`
    case 'range':
      return `The test rows counted here recorded oxygen from ${block.o2.min}% to ${block.o2.max}%. Oxygen levels outside that span are not covered by these rows.`
    case 'categories':
      return `The ${block.total} test rows are split by ${block.groupLabel.toLowerCase()}. A longer bar means more rows. It does not mean a better, worse or riskier result.`
    case 'comparison':
      return 'Each group is drawn with the oxygen levels its tests covered. Groups used different experiments, so the bars show what was covered, not how any group performed.'
    case 'coverage':
      return `The conditions checked were: ${block.conditions}. A phase marked “No data” cannot be counted because some of its tests record no oxygen. That is not the same as zero.`
    case 'no_data':
      return block.reason
    case 'finding':
      return 'The assistant looked up stored findings. Their audit state is read by the dashboard from the matching audit file, not from the assistant.'
    default:
      return 'This answer is text only. No structured values came with it, so nothing is drawn. Check its sources.'
  }
}

function statsFor(block) {
  if (!block) return []
  const s = []
  switch (block.type) {
    case 'count':
      s.push(['Test rows counted', block.n])
      if (block.of != null) s.push(['Rows in scope', block.of])
      if (block.testedO2) s.push(['Oxygen recorded in scope', fmtRange(block.testedO2, '% O2')])
      if (block.testedPressure) s.push(['Pressure recorded in scope', fmtRange(block.testedPressure, 'psi')])
      if (block.missingO2 != null) s.push(['Rows with no oxygen value', block.missingO2])
      if (block.missingPressure != null) s.push(['Rows with no pressure value', block.missingPressure])
      break
    case 'range':
      s.push(['Test rows', block.n], ['Lowest oxygen', `${block.o2.min}% O2`], ['Highest oxygen', `${block.o2.max}% O2`])
      if (block.pressure) s.push(['Pressure recorded', fmtRange(block.pressure, 'psi')])
      break
    case 'categories':
    case 'comparison':
      s.push(['Test rows', block.total])
      if (block.of != null) s.push(['Rows in scope', block.of])
      s.push(['Groups shown', block.rows.length])
      if (block.notShown) s.push(['Groups not shown', block.notShown])
      break
    case 'coverage':
      s.push(['Conditions', block.conditions], ['Phases', block.rows.length])
      break
    default:
  }
  return s
}

function Stats({ items }) {
  if (!items.length) return null
  return (
    <dl className="rt-stats">
      {items.map(([label, value]) => (
        <div key={label} className="rt-stat">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function BigStatement({ block }) {
  if (block.type === 'count') {
    return (
      <div className="rt-big">
        <p className="rt-big-value">
          {block.n}
          {block.of != null && <span> of {block.of}</span>}
        </p>
        <p className="rt-big-label">test rows for: {block.scope}</p>
        {block.noneMatch && <p className="rt-big-note">None met the conditions. This is a count within the snapshot, not “no data”.</p>}
      </div>
    )
  }
  if (block.type === 'no_data') {
    return (
      <div className="rt-big rt-big-nodata">
        <p className="rt-big-value">No data</p>
        <p className="rt-big-label">{block.reason}</p>
      </div>
    )
  }
  return null
}

function SourcesList({ meta, professional }) {
  return (
    <>
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
        {meta.check?.ok ? 'Every number in the answer text was found in the data the assistant checked.' : 'Some numbers in the answer text were not found in the data checked (see warnings).'} The assistant reads a local snapshot, which can differ from the
        database shown elsewhere in this dashboard.
      </p>
    </>
  )
}

// What the matching finding file records about itself: scope, method, evidence rows, limitations. Shown only for
// fields that exist; nothing is derived here. Student sees the plain parts, Professional also the method and rows.
function FindingDetails({ finding, professional }) {
  if (!finding) return null
  const evidence = Array.isArray(finding.evidence) ? finding.evidence : []
  const method = finding.method && typeof finding.method === 'object' ? finding.method : null
  const rowsOf = (e) => (e.rows === 'all' ? 'all rows of the table' : Array.isArray(e.rows) ? `${e.rows.length} row${e.rows.length === 1 ? '' : 's'}` : null)
  return (
    <details className="rt-finding-details">
      <summary>Finding details (version {finding.version})</summary>
      <dl className="rt-glossary">
        {finding.n_tests != null && (
          <div>
            <dt>Tests behind it</dt>
            <dd>{finding.n_tests}</dd>
          </div>
        )}
        {professional && method?.function && (
          <div>
            <dt>Method</dt>
            <dd>
              <code>{method.function}</code>
              {method.formula ? ` — ${method.formula}` : ''}
              {method.params ? <code className="rt-block-code">{JSON.stringify(method.params)}</code> : null}
            </dd>
          </div>
        )}
        {evidence.length > 0 && (
          <div>
            <dt>Evidence</dt>
            <dd>
              <ul className="rr-list">
                {evidence.map((e, i) => (
                  <li key={i}>
                    {e.investigation}
                    {professional && e.table ? `, ${e.table}` : ''}
                    {rowsOf(e) ? `, ${rowsOf(e)}` : ''}
                    {e.doi ? `, DOI ${e.doi}` : ''}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {finding.limitations?.length > 0 && (
          <div>
            <dt>Limitations</dt>
            <dd>
              <ul className="rr-list">
                {finding.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {finding.warnings?.length > 0 && (
          <div>
            <dt>Warnings</dt>
            <dd>
              <ul className="rr-list">
                {finding.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </details>
  )
}

function AuditList({ consulted, onOpenEvidence, professional }) {
  const [chartOpen, setChartOpen] = useState(null)
  if (consulted.length === 0) {
    return <p>No stored finding was consulted, so this answer has no audit status of its own. It stays an ungraded answer.</p>
  }
  return (
    <ul className="rr-findings">
      {consulted.map(({ reported, item }) => (
        <li key={reported.id} className="fs-item">
          <strong>{reported.id}</strong>
          {item ? (
            <>
              <GradeBadge verdict={item.verdict} />
              <p className="rr-q">{item.finding?.question}</p>
              <FindingDetails finding={item.finding} professional={professional} />
              {item.verdict.grade !== reported.grade && (
                <p className="muted">The assistant reported grade {String(reported.grade)}. The dashboard shows the status of the audit that matches the current finding file.</p>
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
  )
}

function Actions({ acts, extraFindings, labelFor, onSeeStatus, onApplyBrowser, onOpenMap, onOpenEvidence }) {
  const has = acts.filters.length + acts.investigations.length + extraFindings.length > 0
  if (!has) {
    return (
      <p className="muted">
        This answer carries no dashboard actions, so nothing is opened automatically. You can browse the{' '}
        <button type="button" className="mp-link" onClick={onSeeStatus}>
          research overview
        </button>
        .
      </p>
    )
  }
  return (
    <>
      <p className="muted">Nothing opens on its own. Each button was built from the data the assistant actually looked up.</p>
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
  )
}

function Glossary({ blocks }) {
  const terms = termsFor(blocks.map((b) => b.type))
  return (
    <dl className="rt-glossary">
      {terms.map((t) => (
        <div key={t.term}>
          <dt>{t.term}</dt>
          <dd>{t.definition}</dd>
        </div>
      ))}
    </dl>
  )
}

// Professional: every condition and value the tool returned for the lead block, as one table. Nothing is computed.
const FILTER_ROWS = [
  ['investigation', 'Investigation'],
  ['phase', 'Fuel phase'],
  ['fuel', 'Fuel (partial match)'],
  ['gravity', 'Gravity'],
  ['o2_min_pct', 'Oxygen, at least (% O2)'],
  ['o2_max_pct', 'Oxygen, at most (% O2)'],
  ['pressure_min_psi', 'Pressure, at least (psi)'],
  ['pressure_max_psi', 'Pressure, at most (psi)'],
]

function ValuesTable({ block }) {
  const rows = []
  if (block.filters) for (const [key, label] of FILTER_ROWS) if (block.filters[key] != null) rows.push([label, String(block.filters[key])])
  if (block.conditions) rows.push(['Conditions', block.conditions])
  rows.push(...statsFor(block).map(([k, v]) => [k, String(v)]))
  if (block.type === 'no_data') rows.push(['Result', 'No data'])
  if (!rows.length) return null
  return (
    <details className="av-table" open>
      <summary>Values and conditions</summary>
      <div className="av-table-scroll" tabIndex={0} role="region" aria-label="Values and conditions, scrollable">
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function ResponseTurn({ turn, number, view, findings, investigations, labelFor, isLatest, seconds, busy, onRetry, onStop, onOpenEvidence, onApplyBrowser, onOpenMap, onSeeStatus }) {
  const professional = view === 'cientifico'
  const meta = turn.reply?.meta
  const answered = turn.reply && !turn.reply.error && !meta?.rejected
  const model = useMemo(() => (answered ? buildAnswerModel(meta) : { type: 'text', blocks: [] }), [answered, meta])
  const consulted = useMemo(() => {
    if (!answered) return []
    return (meta.findings ?? []).map((f) => ({ reported: f, item: findings.find((i) => i.id === f.id) ?? null }))
  }, [answered, meta, findings])
  const acts = useMemo(() => (answered ? actionsFrom(meta, { investigations, findingItems: findings }) : null), [answered, meta, investigations, findings])
  const consultedIds = new Set(consulted.map((c) => c.reported.id))
  const extraFindings = acts ? acts.findings.filter((f) => !consultedIds.has(f.id)) : []

  const main = model.blocks.find((b) => hasVisual(b)) ?? model.blocks.find((b) => b.type === 'count' || b.type === 'no_data') ?? null
  const lead = main ?? model.blocks[0] ?? null
  const caveats = [...new Set(model.blocks.flatMap((b) => b.caveats ?? []))]
  const warnings = answered ? [...(meta.warnings ?? [])] : []
  const paras = answered ? paragraphs(turn.reply.content) : []
  const sources = [...new Set(model.blocks.flatMap((b) => (b.investigations ?? []).map((i) => (typeof i === 'string' ? i : i.investigation))))]
  const dois = model.blocks.flatMap((b) => (b.type === 'coverage' ? b.investigations.filter((i) => i.doi) : []))

  const extraVisuals = answered ? model.blocks.filter((blk) => blk !== main && hasVisual(blk)).slice(0, professional ? 2 : 1) : []

  const answerSection = answered ? (
    <section className="rt-answer" aria-label={professional ? 'Technical answer' : 'Short answer'}>
      <div className="rt-answer-head">
        <h4>{professional ? 'Answer' : 'Short answer'}</h4>
        <span className="tag">Ungraded answer</span>
      </div>
      {professional ? paras.map((p, i) => <p key={i}>{p}</p>) : <p>{paras[0]}</p>}
      {!professional && paras.length > 1 && (
        <details className="rt-more">
          <summary>Read the full answer</summary>
          {paras.slice(1).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </details>
      )}
      <p className="rt-status-note">
        {professional
          ? 'Ungraded: generated from read-only tool output on the local snapshot. Not an audited finding.'
          : 'This answer is ungraded. It is not a checked finding. The numbers come from the assistant’s data tools, and the sources are listed below.'}
      </p>
    </section>
  ) : null

  const warningsSection =
    answered && (warnings.length > 0 || caveats.length > 0 || meta.no_tools || !meta.check?.ok || model.blocks.some((blk) => blk.gaps?.length)) ? (
      <section className="rt-warnings" aria-label="Warnings and limitations">
        <h4>Warnings and limitations</h4>
        <ul className="rr-list">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
          {model.blocks.flatMap((blk) => blk.gaps ?? []).map((g) => (
            <li key={g}>{g}</li>
          ))}
          {caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {meta.no_tools && <li>This answer did not check the data. Treat it as guidance only.</li>}
          {!meta.check?.ok && <li>Numbers not found in the data checked: {meta.check?.unsourced_numbers?.join(', ')}. Verify them.</li>}
        </ul>
      </section>
    ) : null

  return (
    <article className={`rt ${professional ? 'rt-pro' : 'rt-student'}`} id={`turn-${turn.id}`} data-turn={turn.id} aria-labelledby={`turn-${turn.id}-q`}>
      <header className="rt-head">
        <p className="rt-eyebrow">Question {number}</p>
        <h3 id={`turn-${turn.id}-q`} className="rt-question">
          {turn.question}
        </h3>
      </header>

      {turn.pending && (
        <section className="rt-state" role="status">
          <div className="ev-skeleton" aria-hidden="true">
            <div className="sk-block sk-short" />
          </div>
          <p>Checking the data… {seconds >= 8 ? `${seconds} s so far. The local model can be slow.` : ''}</p>
          <button type="button" className="btn btn-secondary btn-compact" onClick={onStop}>
            Stop waiting
          </button>
        </section>
      )}

      {!turn.pending && !turn.reply && (
        <section className="rt-state" role="alert">
          <p>This question has no answer. It may have been cleared or interrupted.</p>
        </section>
      )}

      {turn.reply?.error && (
        <section className="rt-state" role="alert">
          <p className="rr-error">{turn.reply.content}</p>
          {isLatest && !busy && (
            <button type="button" className="btn btn-secondary btn-compact" onClick={onRetry}>
              Retry this question
            </button>
          )}
        </section>
      )}

      {turn.reply && !turn.reply.error && meta?.rejected && (
        <section className="rt-state" role="status">
          <h4>Not answered</h4>
          <p>{turn.reply.content}</p>
        </section>
      )}

      {answered && (
        <>
          {professional ? (
            <div className="rt-pro-grid">
              <div className="rt-pro-main">
                {answerSection}
                {main && (hasVisual(main) ? <AnswerVisual block={main} tableOpen /> : <BigStatement block={main} />)}
                {extraVisuals.map((blk, i) => (
                  <AnswerVisual key={i} block={blk} tableOpen />
                ))}
                {lead && <ValuesTable block={lead} />}
                {warningsSection}
              </div>
              <aside className="rt-pro-side" aria-label="Conditions, method and provenance">
                <dl className="rt-scope">
                  <div>
                    <dt>Source scope</dt>
                    <dd>{lead?.source === 'findings' ? 'Stored findings' : lead ? 'Local snapshot of PSI test rows (microgravity)' : 'No structured data returned'}</dd>
                  </div>
                  <div>
                    <dt>Scope counted</dt>
                    <dd>{lead?.scope ?? 'Not stated'}</dd>
                  </div>
                  <div>
                    <dt>Units</dt>
                    <dd>Oxygen in % O2 (by volume or mole, treated as equal); pressure in psi (source tables in atm)</dd>
                  </div>
                  <div>
                    <dt>Audit state</dt>
                    <dd>{consulted.length ? `${consulted.length} stored finding${consulted.length > 1 ? 's' : ''} consulted (see Audit)` : 'None consulted; the answer itself is ungraded'}</dd>
                  </div>
                </dl>
                <div className="rt-details">
                  <details open>
                    <summary>Method and parameters</summary>
                    {model.blocks.filter((blk) => blk.method).map((blk) => (
                      <p key={blk.scope} className="muted">
                        Recorded method: <code>{blk.method.function}</code> in <code>{blk.method.script}</code>.
                      </p>
                    ))}
                    <SourcesList meta={meta} professional />
                  </details>
                  <details open>
                    <summary>Provenance</summary>
                    {sources.length || dois.length ? (
                      <ul className="rr-list">
                        {sources.length > 0 && <li>Investigations in these rows: {sources.join(', ')}</li>}
                        {dois.map((d) => (
                          <li key={d.investigation}>
                            {d.investigation}: DOI {d.doi}
                          </li>
                        ))}
                        {model.blocks.some((blk) => blk.atmosphereSource) && <li>Habitat definition: {model.blocks.find((blk) => blk.atmosphereSource).atmosphereSource}</li>}
                      </ul>
                    ) : (
                      <p className="muted">No investigation list or DOI was returned with this answer. Rows can be traced through the investigation browser.</p>
                    )}
                  </details>
                  <details open>
                    <summary>Audit</summary>
                    <AuditList consulted={consulted} onOpenEvidence={onOpenEvidence} professional />
                  </details>
                  <details>
                    <summary>Related actions</summary>
                    <Actions acts={acts} extraFindings={extraFindings} labelFor={labelFor} onSeeStatus={onSeeStatus} onApplyBrowser={onApplyBrowser} onOpenMap={onOpenMap} onOpenEvidence={onOpenEvidence} />
                  </details>
                  <details>
                    <summary>Definitions</summary>
                    <Glossary blocks={model.blocks} />
                  </details>
                </div>
              </aside>
            </div>
          ) : (
            <>
              {answerSection}

              <section className="rt-meaning" aria-label="What this means">
                <h4>What this means</h4>
                <p>{meaningFor(lead)}</p>
              </section>

              {main && (hasVisual(main) ? <AnswerVisual block={main} tableOpen={false} student /> : <BigStatement block={main} />)}
              {extraVisuals.slice(0, 1).map((blk, i) => (
                <AnswerVisual key={i} block={blk} tableOpen={false} student />
              ))}

              <Stats items={statsFor(main)} />

              <section className="rt-guide" aria-label="Terms used in this answer">
                <h4>Terms used here</h4>
                <Glossary blocks={model.blocks} />
              </section>

              {warningsSection}

              <details className="rt-explore">
                <summary>Explore the evidence</summary>
                <div className="rt-details">
                  <h5>Where the numbers came from</h5>
                  <SourcesList meta={meta} professional={false} />
                  <h5>Audit status</h5>
                  <AuditList consulted={consulted} onOpenEvidence={onOpenEvidence} professional={false} />
                  <h5>Open in the dashboard</h5>
                  <Actions acts={acts} extraFindings={extraFindings} labelFor={labelFor} onSeeStatus={onSeeStatus} onApplyBrowser={onApplyBrowser} onOpenMap={onOpenMap} onOpenEvidence={onOpenEvidence} />
                </div>
              </details>
            </>
          )}
        </>
      )}
    </article>
  )
}

export default memo(ResponseTurn)
