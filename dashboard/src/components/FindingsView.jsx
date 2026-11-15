import { useMemo } from 'react'
import GradeBadge from './GradeBadge.jsx'
import { tally } from '../lib/findings/eligibility.js'
import { formatTime } from './Evidence.jsx'

const ENV_LABELS = {
  space_station: 'Space station',
  transit_vehicle: 'Transit vehicle',
  lunar_base: 'Lunar base',
  mars_base: 'Mars base',
  pressurized_rover: 'Pressurized rover',
}
const PILLAR_LABELS = { prevention: 'Prevention', detection: 'Detection', suppression: 'Suppression' }
const PARTIAL_GRAVITY = ['lunar_base', 'mars_base', 'pressurized_rover']

const SECTIONS = [
  {
    key: 'verified',
    title: 'Verified findings',
    empty: (n) => `No finding is verified yet. ${n} finding${n === 1 ? ' has' : 's have'} no matching audit with grade A or B.`,
  },
  {
    key: 'indication',
    title: 'Indications, not verified',
    note: 'Grade C is an indication, not a conclusion. The team has not decided whether Grade C findings with unreviewed checks may be published, so they are not presented as verified.',
    empty: () => 'No Grade C findings.',
  },
  { key: 'gap', title: 'Knowledge gaps', empty: () => 'No knowledge gap has a matching audit yet.' },
  {
    key: 'pending',
    title: 'Not audited yet',
    note: 'These have no audit that matches their current version. Their claims are not shown and they have no grade.',
    empty: () => 'Every finding has a matching audit.',
  },
]

function studentLine(item) {
  const n = item.finding.n_tests.toLocaleString('en-US')
  switch (item.verdict.grade) {
    case 'A':
      return `Checked against ${n} tests; every check passed.`
    case 'B':
      return 'Checked, but based on few tests.'
    case 'C':
      return 'Use with care: some checks did not pass.'
    case 'no_data':
      return 'NASA has not tested this yet.'
    default:
      return ''
  }
}

function Card({ item, view, onOpen }) {
  const { finding, verdict } = item
  const professional = view === 'cientifico'
  const chips = finding
    ? [
        ...finding.environments.map((e) => ENV_LABELS[e]),
        finding.pillar ? PILLAR_LABELS[finding.pillar] : null,
        finding.tier ? `Tier ${finding.tier}` : null,
      ].filter(Boolean)
    : []
  const partial = finding?.environments.some((e) => PARTIAL_GRAVITY.includes(e))

  return (
    <article className="fd-card" data-category={verdict.category}>
      <header>
        <GradeBadge verdict={verdict} />
        <span className="muted fd-id">
          {item.id}
          {professional && finding ? ` · v${finding.version}` : ''}
        </span>
      </header>

      <h4>{finding?.question ?? item.id}</h4>

      {verdict.showClaim ? (
        <>
          <p>{finding.claim}</p>
          <p className="muted">
            {professional
              ? `${finding.n_tests.toLocaleString('en-US')} tests · ${finding.evidence.length} source table${finding.evidence.length === 1 ? '' : 's'}`
              : studentLine(item)}
          </p>
        </>
      ) : (
        <p className="muted">{verdict.reasons[0]}</p>
      )}

      {verdict.showClaim && finding.warnings.length > 0 && (
        <ul className="fd-card-warnings">
          {finding.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {verdict.showClaim && partial && !finding.warnings.some((w) => /partial-gravity/i.test(w)) && (
        <p className="fd-note">PSI has no partial-gravity combustion data; microgravity results do not directly describe lunar or Mars gravity.</p>
      )}

      {chips.length > 0 && (
        <ul className="fd-chips" aria-label="Context">
          {chips.map((c) => (
            <li key={c} className="tag">
              {c}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-secondary btn-compact" aria-haspopup="dialog" onClick={(e) => onOpen(item.id, e.currentTarget)}>
        {verdict.showClaim ? 'Open evidence' : 'Why not shown?'}
      </button>
    </article>
  )
}

export default function FindingsView({ findings, view, onOpen }) {
  const { status, items, source, attempts, refreshedAt, refreshing, refresh } = findings
  const counts = useMemo(() => tally(items), [items])
  const withheld = items.filter((i) => i.verdict.category === 'withheld')

  return (
    <section className="ws-panel fd" aria-labelledby="fd-heading">
      <header className="ev-head">
        <h2 id="fd-heading" tabIndex={-1}>
          Findings
        </h2>
        <span className="tag">Checked answers · each with its audit</span>
      </header>

      {status === 'loading' && (
        <div className="ev-skeleton" role="status">
          <span className="visually-hidden">Loading findings…</span>
          <div className="sk-block" aria-hidden="true" />
          <div className="sk-block sk-short" aria-hidden="true" />
        </div>
      )}

      {status === 'unavailable' && (
        <div className="ev-empty" role="alert">
          <p>
            <strong>No findings source is available.</strong> Nothing is shown, because nothing has been published.
          </p>
          <ul className="fd-attempts">
            {attempts.map((a) => (
              <li key={a.id}>
                <b>{a.label}:</b> {a.message}
              </li>
            ))}
          </ul>
          <p className="muted">
            The legacy sample file in <code>public/data/</code> is not used: it does not match the finding schema.
          </p>
          <button type="button" className="btn btn-secondary btn-compact" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Trying again…' : 'Retry'}
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="ev-source">
            Source: <b>{source.label}</b>
            {source.id === 'local-files' && ' (findings and audits read from the repository by the local dev server; this is not the database)'}.{' '}
            {items.length} finding{items.length === 1 ? '' : 's'} loaded
            {refreshedAt && <> · refreshed {formatTime(refreshedAt)}</>}.{' '}
            {attempts
              .filter((a) => a.status !== 'ok')
              .map((a) => `${a.label} unavailable: ${a.message}`)
              .join(' ')}
          </p>

          <p className="fd-summary" role="status">
            {counts.verified} verified · {counts.indication} indication{counts.indication === 1 ? '' : 's'} · {counts.gap} knowledge gap
            {counts.gap === 1 ? '' : 's'} · {counts.pending} not audited yet · {counts.withheld} withheld
          </p>

          {SECTIONS.map((section) => {
            const list = items.filter((i) => i.verdict.category === section.key)
            return (
              <section key={section.key} className="fd-section" aria-labelledby={`fd-sec-${section.key}`}>
                <h3 id={`fd-sec-${section.key}`}>
                  {section.title} <span className="muted">({list.length})</span>
                </h3>
                {section.note && list.length > 0 && <p className="fd-note">{section.note}</p>}
                {list.length ? (
                  <div className="fd-grid">
                    {list.map((item) => (
                      <Card key={item.id} item={item} view={view} onOpen={onOpen} />
                    ))}
                  </div>
                ) : (
                  <p className="muted">{section.empty(items.length)}</p>
                )}
              </section>
            )
          })}

          <details className="fd-section ev-details">
            <summary>Withheld ({withheld.length})</summary>
            <p className="muted">Rejected or invalid findings are never shown as results. Only the reason is listed.</p>
            {withheld.length ? (
              <div className="fd-grid">
                {withheld.map((item) => (
                  <Card key={item.id} item={item} view={view} onOpen={onOpen} />
                ))}
              </div>
            ) : (
              <p className="muted">Nothing is withheld.</p>
            )}
          </details>
        </>
      )}
    </section>
  )
}
