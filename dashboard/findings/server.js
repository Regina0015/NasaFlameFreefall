// Local, read-only findings endpoint, mounted by vite.config.js at /api/findings (npm run dev and npm run preview).
//   GET /api/findings  -> every F-NNN.json of stage 04, each with the audit that matches it exactly (or why none does)
// It does not exist on Vercel: the dashboard shows that findings are unavailable there.
//
// An audit counts for a finding only when its id, version and SHA-256 of the exact finding file all match
// (the same rule as scripts/audit_step.py read_verdict). Nothing is graded, edited or written here.

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createConfig } from '../chat/config.js'

const FINDING_FILE = /^F-\d{3}\.json$/
const GRADES = ['A', 'B', 'C', 'no_data', 'rejected']
const MAX_BYTES = 2 * 1024 * 1024 // a finding with an inline chart stays far below this

async function readJson(file) {
  const buffer = await readFile(file)
  if (buffer.length > MAX_BYTES) throw new Error('file is larger than expected')
  return { buffer, value: JSON.parse(buffer.toString('utf8')) }
}

export async function collectFindings({ findingsDir, auditsDir }) {
  const names = (await readdir(findingsDir)).filter((n) => FINDING_FILE.test(n)).sort()
  const findings = []

  for (const name of names) {
    const id = name.replace('.json', '')
    let finding
    let buffer
    try {
      ;({ buffer, value: finding } = await readJson(path.join(findingsDir, name)))
    } catch (error) {
      findings.push({ id, finding: null, readError: `Could not read ${name}: ${error.message}`, auditStatus: 'none', audit: null })
      continue
    }

    const sha256 = createHash('sha256').update(buffer).digest('hex')
    let audit = null
    let auditStatus = 'none'
    let auditNote = 'No audit file exists for this finding.'

    try {
      const { value } = await readJson(path.join(auditsDir, `${id}.json`))
      const matches =
        value &&
        value.finding_id === finding?.id &&
        value.finding_version === finding?.version &&
        value.finding_sha256 === sha256 &&
        GRADES.includes(value.grade)
      if (matches) {
        audit = value
        auditStatus = 'matched'
        auditNote = `Audit of version ${value.finding_version} matches this file (SHA-256 verified).`
      } else {
        auditStatus = 'stale'
        auditNote =
          value?.finding_version !== finding?.version
            ? `The audit on file is for version ${value?.finding_version}, but the finding is version ${finding?.version}.`
            : 'The audit on file was made for different file contents (SHA-256 differs), so it verifies nothing.'
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        auditStatus = 'stale'
        auditNote = `The audit file could not be read: ${error.message}`
      }
    }

    findings.push({ id, finding, sha256, audit, auditStatus, auditNote })
  }

  return findings
}

export function createFindingsHandler(env) {
  const { repoRoot } = createConfig(env)
  const findingsDir = env.FINDINGS_DIR || path.join(repoRoot, 'stages', '04_calcular', 'output', 'findings')
  const auditsDir = env.AUDITS_DIR || path.join(repoRoot, 'stages', '05_auditar', 'output', 'audits')

  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.statusCode = 405
      return res.end(JSON.stringify({ error: 'Use GET.' }))
    }
    try {
      const findings = await collectFindings({ findingsDir, auditsDir })
      res.statusCode = 200
      return res.end(JSON.stringify({ source: 'local-files', generatedAt: new Date().toISOString(), findings }))
    } catch (error) {
      res.statusCode = error.code === 'ENOENT' ? 404 : 500
      const message =
        error.code === 'ENOENT'
          ? 'The findings folder was not found (stages/04_calcular/output/findings).'
          : `The findings could not be read: ${error.message}`
      return res.end(JSON.stringify({ error: message }))
    }
  }
}
