import { useEffect, useRef } from 'react'
import GradeBadge from './GradeBadge.jsx'

const fmt = (n) => n.toLocaleString('en-US')
const num = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''))
const PHASE_LABELS = { solid: 'Solid fuels', droplet: 'Liquid droplets', gas: 'Gas flames', smoke: 'Smoke' }
const TIER_STUDENT = { 1: 'Directly about fire safety', 2: 'Supporting science' }
const RELATION_LABELS = { same_hardware: 'Same hardware', same_fuel: 'Same fuel', related_in_psi: 'Related in PSI', reuses_flight_data: 'Reuses flight data' }

// Details of one investigation, from loaded records only. Missing pieces say so; a ground study with no test
// rows of its own is never shown as zero tests. Same drawer behaviour as the evidence drawer.
export default function InvestigationDetails({ detail, view, onClose, onSelect, onOpenMap, onOpenEvidence }) {
  const professional = view === 'cientifico'
  const { record, coverage, related, findings } = detail
  const panel = useRef(null)
  const title = useRef(null)

  useEffect(() => {
    title.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = panel.current?.querySelectorAll('button:not([disabled]), a[href], summary')
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
  }, [onClose, record.id])

  const label = record.label || record.acronym || record.id
  const summary = professional ? record.summary_professional : record.summary_student

  return (
    <>
      <div className="fd-scrim" aria-hidden="true" onClick={onClose} />
      <aside ref={panel} className="fd-drawer" role="dialog" aria-modal="true" aria-labelledby="id-title">
        <header className="fd-drawer-head">
          <div>
            <p className="eyebrow">{record.id} · {record.type === 'ground' ? 'Ground study' : record.type === 'flight' ? 'Flight investigation' : 'Investigation'}</p>
            <h2 id="id-title" ref={title} tabIndex={-1}>
              {label}
            </h2>
            {record.title && record.title !== label && <p className="muted">{record.title}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-compact" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="fd-drawer-body">
          <section className="fd-step" aria-labelledby="id-summary">
            <h3 id="id-summary">Summary</h3>
            {summary ? <p>{summary}</p> : <p className="muted">Not summarized yet. The Investigator's review has not been published for this investigation.</p>}
          </section>

          <section className="fd-step" aria-labelledby="id-facts">
            <h3 id="id-facts">Record</h3>
            <dl className="mp-facts">
              <div>
                <dt>Pillar</dt>
                <dd>{record.pillar ? record.pillar[0].toUpperCase() + record.pillar.slice(1) : 'Not reviewed yet'}</dd>
              </div>
              <div>
                <dt>Tier</dt>
                <dd>
                  {professional
                    ? `${record.tier ? `Tier ${record.tier}` : 'Not set'}${record.tier_reason ? `. ${record.tier_reason}` : ''}`
                    : (TIER_STUDENT[record.tier] ?? 'Not set')}
                </dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{record.platform || 'Not stated'}</dd>
              </div>
              {professional && (
                <div>
                  <dt>Hardware</dt>
                  <dd>{record.hardware || 'Not stated'}</dd>
                </div>
              )}
              <div>
                <dt>DOI</dt>
                <dd>
                  {record.doi ? (
                    <a href={`https://doi.org/${record.doi}`} target="_blank" rel="noopener noreferrer">
                      {record.doi}
                    </a>
                  ) : (
                    'Not stated'
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="fd-step" aria-labelledby="id-coverage">
            <h3 id="id-coverage">Test coverage</h3>
            {!coverage.ownRows ? (
              <p>
                {record.type === 'ground'
                  ? 'Ground study: it analyzes flight data and has no test rows of its own. That is not zero tests.'
                  : 'No test rows are loaded for this investigation.'}
              </p>
            ) : (
              <>
                <p>
                  <b>{fmt(coverage.total)}</b> tests recorded · {coverage.phases.map(([p, n]) => `${PHASE_LABELS[p] ?? p} ${fmt(n)}`).join(', ')}
                </p>
                {coverage.fuels.length > 0 && (
                  <p className="muted">
                    Fuels: {coverage.fuels.slice(0, 8).map(([f, n]) => (professional ? `${f} (${fmt(n)})` : f)).join(', ')}
                    {coverage.fuels.length > 8 && ` and ${coverage.fuels.length - 8} more`}
                  </p>
                )}
                {professional ? (
                  <ul>
                    <li>Oxygen: {coverage.o2 ? `${num(coverage.o2.min)}–${num(coverage.o2.max)} %` : 'not recorded'}. Not recorded in {fmt(coverage.missingO2)} tests.</li>
                    <li>Pressure: {coverage.pressurePsi ? `${num(coverage.pressurePsi.min)}–${num(coverage.pressurePsi.max)} psi` : 'not recorded'}. Not recorded in {fmt(coverage.missingPressure)} tests.</li>
                  </ul>
                ) : (
                  (coverage.missingO2 > 0 || coverage.missingPressure > 0) && <p className="muted">Some tests did not record oxygen or pressure.</p>
                )}
                <p className="muted">Some investigations report burner-stream oxygen rather than chamber atmosphere; this view does not separate them.</p>
              </>
            )}
          </section>

          <section className="fd-step" aria-labelledby="id-related">
            <h3 id="id-related">Related investigations ({related.length})</h3>
            {related.length ? (
              <ul>
                {related.map((r, i) => (
                  <li key={`${r.other.id}-${r.type}-${i}`}>
                    <button type="button" className="mp-link" onClick={() => onSelect(r.other.id)}>
                      {r.other.label || r.other.acronym || r.other.id}
                    </button>{' '}
                    <span className="muted">
                      {RELATION_LABELS[r.type] ?? r.type}
                      {r.type === 'reuses_flight_data' ? (r.outgoing ? ' (this reuses its flight data)' : ' (reuses this flight data)') : ''}
                      {professional && r.source ? ` · source: ${r.source}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No relations are recorded for this investigation.</p>
            )}
          </section>

          <section className="fd-step" aria-labelledby="id-findings">
            <h3 id="id-findings">Findings that cite it ({findings.length})</h3>
            {findings.length ? (
              <ul className="fd-sources">
                {findings.map((item) => (
                  <li key={item.id}>
                    <GradeBadge verdict={item.verdict} />
                    <p>{item.finding.question}</p>
                    <button type="button" className="btn btn-secondary btn-compact" aria-haspopup="dialog" onClick={() => onOpenEvidence(item.id)}>
                      Open evidence
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No loaded finding cites this investigation.</p>
            )}
          </section>

          <div className="fd-actions">
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenMap(record.id)}>
              View on the map
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
