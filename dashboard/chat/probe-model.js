// Tries the local model with the real tools and the real snapshot.
// Runs the example questions in both views and shows which tool the model chose, with which
// arguments, the answer and the number check.
//
//   npm run probe-model
//   npm run probe-model -- "Another question?"

import { createConfig } from './config.js'
import { createTools } from './tools.js'
import { respond } from './agent.js'

const QUESTIONS = [
  { q: 'Did any solid-fuel test in PSI reach the 30% oxygen planned for the lunar base?', expect: ['query_tests', 'check_environment'] },
  { q: 'Which PSI tests fall within the lunar base atmosphere (30% O2 or more, 10.2 psi or less), by fuel type?', expect: ['check_environment'] },
  { q: 'How does microgravity flame spread data from PSI apply to fire safety on Earth?', expect: ['get_findings'] },
  // Not English: code rejects it before the model is called.
  { q: '¿Alguna prueba de combustible sólido llegó al 30% de oxígeno de la base lunar?', reject: true },
]

const config = createConfig(process.env)
const tools = createTools(config)
const extra = process.argv.slice(2).join(' ').trim()
const cases = extra ? [{ q: extra }] : QUESTIONS

let right = 0
let total = 0
for (const { q, expect = [], reject = false } of cases) {
  for (const view of ['student', 'professional']) {
    total++
    const t0 = Date.now()
    try {
      const r = await respond({ messages: [{ role: 'user', content: q }], view }, { config, tools })
      const names = r.tools.map((t) => t.name)
      const ok = reject ? r.rejected : !r.rejected && (!expect.length || names.some((n) => expect.includes(n)))
      if (ok) right++
      console.log(`\n=== [${view}] ${q}`)
      console.log(`tools: ${r.rejected ? 'REJECTED (not English)' : r.tools.map((t) => `${t.name}(${JSON.stringify(t.args)})${t.error ? ' ERROR ' + t.error : ''}`).join(' → ') || 'NONE'}${ok ? '' : '   ← not what was expected'}`)
      console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s · unsourced numbers: ${r.check.unsourced_numbers.join(', ') || 'none'} · warnings: ${r.warnings.length}`)
      console.log(`---\n${r.answer}`)
    } catch (e) {
      console.log(`\n=== [${view}] ${q}\nERROR: ${e.message}`)
    }
  }
}
console.log(`\nRight (expected tool, or rejected when not English) in ${right} of ${total}.`)
