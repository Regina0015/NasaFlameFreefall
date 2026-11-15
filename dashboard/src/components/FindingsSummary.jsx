import GradeBadge from './GradeBadge.jsx'
import { tally } from '../lib/findings/eligibility.js'

// A short, honest view of findings on the overview: counts by audit state, and the findings eligible to be read
// (verified, indication, knowledge gap) with a way to inspect their evidence. Pending, stale and withheld findings
// are only counted here. The full list is in the Findings workspace.
export default function FindingsSummary({ findings, onOpen, onGoFindings }) {
  const { status, items, source, attempts, refresh, refreshing } = findings
  const counts = tally(items)
  const eligible = items.filter((i) => ['verified', 'indication', 'gap'].includes(i.verdict.category))

  return (
    <section className="ws-panel fs" aria-labelledby="fs-title">
      <header className="ev-head">
        <h2 id="fs-title">Findings and their audits</h2>
        <span className="tag">Checked answers</span>
      </header>

      {status === 'loading' && (
        <div className="ev-skeleton" role="status">
          <span className="visually-hidden">Loading findings…</span>
          <div className="sk-block sk-short" aria-hidden="true" />
        </div>
      )}

      {status === 'unavailable' && (
        <div className="ev-empty" role="alert">
          <p>
            <strong>No findings source is available.</strong> Nothing has been published here.
          </p>
          <ul className="fd-attempts">
            {attempts.map((a) => (
              <li key={a.id}>
                <b>{a.label}:</b> {a.message}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Trying again…' : 'Retry'}
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="fd-summary" role="status">
            {counts.verified} verified · {counts.indication} indication{counts.indication === 1 ? '' : 's'} · {counts.gap} knowledge gap
            {counts.gap === 1 ? '' : 's'} · {counts.pending} not audited yet · {counts.withheld} withheld
          </p>
          <p className="muted ev-hint">Source: {source.label}. An audit counts only when it matches the finding's current version.</p>

          {eligible.length === 0 ? (
            <p className="ev-empty">
              <span>
                <strong>No finding can be read as a result yet.</strong> None has a matching audit with a published grade. Nothing is shown as verified.
              </span>
            </p>
          ) : (
            <ul className="fs-list">
              {eligible.slice(0, 4).map((item) => (
                <li key={item.id} className="fs-item">
                  <GradeBadge verdict={item.verdict} />
                  <p>{item.finding.question}</p>
                  <button type="button" className="btn btn-secondary btn-compact" aria-haspopup="dialog" onClick={(e) => onOpen(item.id, e.currentTarget)}>
                    Open evidence
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="btn btn-ghost btn-compact fs-all" onClick={onGoFindings}>
            See all {items.length} findings
          </button>
        </>
      )}
    </section>
  )
}
