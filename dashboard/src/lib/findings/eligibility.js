import { POLICY } from './policy.js'
import { validateFinding } from './validate.js'

// Decides how a finding may be shown, from the finding file and the audit that matches it exactly.
// Rules (design/dashboard-brief.md and _config/confidence.md):
//  - Rejected findings are never shown as conclusions.
//  - Pending findings are "Not audited yet" and get no grade.
//  - A stale audit (different version or file contents) verifies nothing.
//  - Grade C with unreviewed checks is listed apart as an indication, never as verified, until the team decides.
//
// Returns { category, grade, label, tone, reasons, showClaim, chart, graph }.
//  category: 'verified' | 'indication' | 'gap' | 'pending' | 'withheld'
//  tone: 'good' | 'warning' | 'serious' | 'neutral' | 'critical' (status colors, always paired with an icon and a word)

const base = { grade: null, reasons: [], showClaim: false, chart: { allowed: false, reason: '' }, graph: { allowed: false, reason: '' } }

function checkResult(audit, id) {
  return audit?.checks?.find((c) => c.id === id)?.result ?? null
}

export function classify(entry, policy = POLICY) {
  const { finding, audit, auditStatus, auditNote, readError } = entry
  const problems = readError ? [readError] : validateFinding(finding)

  if (problems.length) {
    return {
      ...base,
      category: 'withheld',
      label: 'Not shown',
      tone: 'critical',
      reasons: [readError ? readError : `The file does not match the finding schema: ${problems.slice(0, 3).join('; ')}.`],
      chart: { allowed: false, reason: 'The finding is withheld.' },
      graph: { allowed: false, reason: 'The finding is withheld.' },
    }
  }

  const blocked = (reason) => ({ chart: { allowed: false, reason }, graph: { allowed: false, reason } })

  if (auditStatus === 'none') {
    return { ...base, category: 'pending', label: 'Not audited yet', tone: 'neutral', reasons: [auditNote || 'No audit exists for this version.'], ...blocked('Charts and proof graphs are shown only after a matching audit.') }
  }

  if (auditStatus !== 'matched' || !audit) {
    return { ...base, category: 'pending', label: 'Audit out of date', tone: 'neutral', reasons: [auditNote || 'The audit does not match this version.', 'A stale audit does not verify the current finding, so it is treated as not audited yet.'], ...blocked('The audit on file does not match this version.') }
  }

  const grade = audit.grade
  const consistent = (grade === 'no_data') === (finding.status === 'no_data')
  if (!consistent && grade !== 'rejected') {
    return { ...base, category: 'withheld', grade, label: 'Not shown', tone: 'critical', reasons: ['The audit grade and the finding status disagree, so the finding is withheld until the team resolves it.'], ...blocked('The finding is withheld.') }
  }

  if (grade === 'rejected') {
    return { ...base, category: 'withheld', grade, label: 'Not published', tone: 'critical', reasons: audit.reasons?.length ? audit.reasons : ['The Auditor rejected this finding.'], ...blocked('Rejected findings are not shown.') }
  }

  let category
  if (policy.verifiedGrades.includes(grade)) category = 'verified'
  else if (grade === 'no_data') category = 'gap'
  else if (policy.indicationGrades.includes(grade)) category = 'indication'
  else {
    return { ...base, category: 'withheld', grade, label: 'Not shown', tone: 'critical', reasons: [`Grade ${grade} is not published under the current policy.`], ...blocked('The finding is withheld.') }
  }

  const label = { A: 'High confidence', B: 'Medium confidence', C: 'Indication only', no_data: 'No data (knowledge gap)' }[grade]
  const tone = { A: 'good', B: 'warning', C: 'serious', no_data: 'neutral' }[grade]
  const reasons = []
  if (category === 'indication') {
    reasons.push('Grade C is an indication, not a conclusion. The team has not decided whether a Grade C finding with unreviewed checks may be published, so it is not presented as verified.')
    if (audit.reasons?.length) reasons.push(...audit.reasons)
  }
  if (grade === 'B') reasons.push('Grade B: it passes the main checks, with limited support or minor data problems.')

  let chart = { allowed: false, reason: 'This finding has no stored chart.' }
  if (finding.chart) {
    if (!policy.chartCategories.includes(category)) chart = { allowed: false, reason: 'Charts are not shown for this status.' }
    else if (policy.chartRequiresC9 && checkResult(audit, 'C9') !== 'pass') chart = { allowed: false, reason: 'The audit did not pass the chart check (C9), so the stored chart is not drawn.' }
    else chart = { allowed: true, reason: '' }
  }

  let graph = { allowed: false, reason: 'This finding has no stored proof graph.' }
  if (finding.graph) graph = policy.graphCategories.includes(category) ? { allowed: true, reason: '' } : { allowed: false, reason: 'Proof graphs are not shown for this status.' }

  return { category, grade, label, tone, reasons, showClaim: true, chart, graph }
}

// Counts per category, for the summary line and empty states.
export function tally(items) {
  const counts = { verified: 0, indication: 0, gap: 0, pending: 0, withheld: 0 }
  for (const item of items) counts[item.verdict.category] += 1
  return counts
}
