// Audit status badge. The status is always an icon plus a word, never color alone (DASHBOARD.md section 1).
// Audit confidence is not fire-risk severity: these colors only say how well a finding was checked.

const ICONS = { good: '✓', warning: '!', serious: '~', neutral: '∅', critical: '✕' }

export default function GradeBadge({ verdict }) {
  const icon = verdict.category === 'pending' ? '○' : ICONS[verdict.tone]
  return (
    <span className="gb" data-tone={verdict.tone}>
      <span className="gb-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        {verdict.grade && verdict.grade !== 'rejected' && verdict.grade !== 'no_data' ? `Grade ${verdict.grade} · ` : ''}
        {verdict.label}
      </span>
    </span>
  )
}
