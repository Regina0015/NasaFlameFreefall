// Chat tests, with no model and no Python: `npm test` (node:test, no dependencies).
// The tools themselves are tested in scripts/tests/test_chat_tools.py.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { respond, warningsFor, PARTIAL_GRAVITY_WARNING } from './agent.js'
import { createTools, tidyArguments } from './tools.js'
import { checkNumbers, numbersIn } from './checkNumbers.js'
import { isEnglish } from './prompt.js'
import { createConfig } from './config.js'
import { buildActions } from './references.js'

const config = createConfig({})

// Fake Python runner: records calls and returns a fixed result per tool.
function fakeTools(results = {}) {
  const calls = []
  const tools = createTools(config, async (_c, name, args) => {
    calls.push({ name, args })
    return results[name] ?? { summary: 'ok', source: 'snapshot', note: 'Live count.' }
  })
  return { tools, calls }
}

const LUNAR = {
  summary: '56 tests reached both the O2 and the pressure of lunar_base; 278 reached the O2.',
  by_phase: [{ phase: 'solid', n_tests: 138, reach_o2: 0 }, { phase: 'gas', n_tests: 351, reach_o2: 246 }],
  warnings: [PARTIAL_GRAVITY_WARNING],
  source: 'snapshot',
  note: 'Live count from data/snapshot (the stage 02 snapshot). It is not an audited finding.',
}

test('tidyArguments: maps common words to the exact values and drops empty ones', () => {
  assert.deepEqual(tidyArguments({ phase: 'Liquid', gravity: '1g', environment: 'ISS', fuel: '', o2_min_pct: '30' }), {
    phase: 'droplet', gravity: 'earth', environment: 'space_station', o2_min_pct: 30,
  })
  assert.deepEqual(tidyArguments({ environment: 'Moon base' }), { environment: 'lunar_base' })
  // The phase written as the fuel moves to phase.
  assert.deepEqual(tidyArguments({ fuel: 'Solid', o2_min_pct: 30 }), { phase: 'solid', o2_min_pct: 30 })
  assert.deepEqual(tidyArguments({ fuel: 'PMMA' }), { fuel: 'PMMA' })
})

test('tools: unknown tool names never reach Python', async () => {
  const { tools, calls } = fakeTools()
  const r = await tools.execute('sql_query', { sql: 'SELECT 1' })
  assert.match(r.error, /Unknown tool/)
  assert.equal(calls.length, 0)
})

test('respond: runs the tool the model asks for and ends with text', async () => {
  const { tools, calls } = fakeTools({ check_environment: LUNAR })
  const sent = []
  const call = async (_c, body) => {
    sent.push(body)
    if (sent.length === 1) {
      return { message: { content: '', tool_calls: [{ function: { name: 'check_environment', arguments: { environment: 'moon' } } }] } }
    }
    return { message: { content: '56 tests met both; 246 gas tests reached 30% O2, but 99 did not.' } }
  }
  const r = await respond({ messages: [{ role: 'user', content: 'Which tests fit the lunar base?' }], view: 'professional' }, { config, tools, call })
  assert.deepEqual(calls, [{ name: 'check_environment', args: { environment: 'lunar_base' } }])
  assert.deepEqual(r.check.unsourced_numbers, [99])
  assert.deepEqual(r.warnings, [PARTIAL_GRAVITY_WARNING])
  assert.equal(r.notes.length, 1)
  assert.equal(sent[1].messages.at(-1).role, 'tool')
  assert.match(sent[0].messages[0].content, /aerospace engineers/)
})

test('respond: every finding consulted comes back with its grade', async () => {
  const { tools } = fakeTools({
    get_findings: { findings: [{ id: 'F-002', grade: 'pending audit' }, { id: 'F-004', grade: 'B', failed_checks: ['C5'] }], note: 'n' },
  })
  let n = 0
  const call = async () => (++n === 1
    ? { message: { tool_calls: [{ function: { name: 'get_findings', arguments: { topic: 'flame' } } }] } }
    : { message: { content: 'Answer.' } })
  const r = await respond({ messages: [{ role: 'user', content: 'What do the findings say about flames?' }] }, { config, tools, call })
  assert.deepEqual(r.findings, [
    { id: 'F-002', grade: 'pending audit', failed_checks: [] },
    { id: 'F-004', grade: 'B', failed_checks: ['C5'] },
  ])
})

test('respond: an answer without a tool gets one nudge', async () => {
  const { tools } = fakeTools()
  const sent = []
  const call = async (_c, body) => {
    sent.push(body)
    if (sent.length === 1) return { message: { content: 'No data.' } } // from memory
    if (sent.length === 2) return { message: { tool_calls: [{ function: { name: 'query_tests', arguments: { phase: 'solid' } } }] } }
    return { message: { content: 'With data.' } }
  }
  const r = await respond({ messages: [{ role: 'user', content: 'Did any solid test reach it?' }] }, { config, tools, call })
  assert.equal(r.answer, 'With data.')
  assert.equal(r.no_tools, false)
  assert.ok(sent[1].messages.some((m) => m.role === 'user' && /without calling a tool/.test(m.content)))
})

test('respond: an empty answer after tools gets one more step', async () => {
  const { tools } = fakeTools()
  let n = 0
  const call = async () => {
    n++
    if (n === 1) return { message: { tool_calls: [{ function: { name: 'query_tests', arguments: {} } }] } }
    if (n === 2) return { message: { content: '' } }
    return { message: { content: 'Final answer.' } }
  }
  const r = await respond({ messages: [{ role: 'user', content: 'How many tests are there?' }] }, { config, tools, call })
  assert.equal(r.answer, 'Final answer.')
})

test('respond: the last step offers no tools', async () => {
  const { tools } = fakeTools()
  const sent = []
  const call = async (_c, body) => {
    sent.push(body)
    if (body.tools) return { message: { tool_calls: [{ function: { name: 'query_tests', arguments: '{}' } }] } }
    return { message: { content: 'done' } }
  }
  const r = await respond({ messages: [{ role: 'user', content: 'How many tests are there?' }] }, { config, tools, call })
  assert.equal(r.answer, 'done')
  assert.equal(sent.length, config.maxSteps)
  assert.equal(sent.at(-1).tools, undefined)
})

test('respond: a question not in English is rejected without calling the model', async () => {
  const { tools, calls } = fakeTools()
  let n = 0
  const call = async () => (n++, { message: { content: 'x' } })
  const r = await respond({ messages: [{ role: 'user', content: '¿Alguna prueba sólida llegó al 30%?' }] }, { config, tools, call })
  assert.equal(r.rejected, true)
  assert.equal(n, 0)
  assert.equal(calls.length, 0)
  assert.match(r.answer, /only accepts questions in English/)
})

test('isEnglish', () => {
  assert.equal(isEnglish('Which PSI tests fall within the lunar base atmosphere?'), true)
  assert.equal(isEnglish('How does microgravity flame spread data apply to fire safety on Earth?'), true)
  assert.equal(isEnglish('PMMA?'), true)
  assert.equal(isEnglish('¿Alguna prueba llegó al 30%?'), false)
  assert.equal(isEnglish('pruebas de combustible solido en la base lunar'), false)
  assert.equal(isEnglish("Quels tests ont atteint 30% d'oxygène dans la base lunaire ?"), false)
  assert.equal(isEnglish('Какие тесты достигли 30% кислорода?'), false)
})

test('warningsFor: the partial-gravity warning appears for Moon and Mars questions', () => {
  assert.deepEqual(warningsFor([], 'Did any test reach the Moon base oxygen?'), [PARTIAL_GRAVITY_WARNING])
  assert.deepEqual(warningsFor([], 'How does this apply on Earth?'), [])
})

test('checkNumbers: accepts tool numbers and flags invented ones', () => {
  assert.deepEqual(numbersIn('PSI-25 (DOI 10.60555/4qc4-de67), test PSI-25-T0-R12, reached 22.2% in 1g'), [22.2])
  const results = [{ before_numeric_filters: { n_tests: 138, o2_pct_tested: { min: 13.6, max: 22.2 } } }]
  assert.equal(checkNumbers('0 of 138 solid tests; the highest was 22.2%', { results }).ok, true)
  assert.deepEqual(checkNumbers('The highest was 25.7%', { results }).unsourced_numbers, [25.7])
  assert.equal(checkNumbers('Lunar base: 30% and 10.2 psi', {}).ok, true)
})

test('actions: built from tool calls and results, validated, and never from the answer text', async () => {
  const { tools } = fakeTools({
    query_tests: { groups: [{ group: 'all', n_tests: 5, investigations: ['PSI-25', 'PSI-26', 'not-an-id'] }], source: 'snapshot' },
    get_findings: { findings: [{ id: 'F-003', grade: 'C' }, { id: 'bad', grade: 'A' }], investigation_summaries: [{ investigation: 'PSI-69' }], note: 'n' },
  })
  let n = 0
  const call = async () => {
    n += 1
    if (n === 1) {
      return {
        message: {
          tool_calls: [
            { function: { name: 'query_tests', arguments: { phase: 'Solids', o2_min_pct: '30', pressure_max_psi: 10.2 } } },
            { function: { name: 'get_findings', arguments: { topic: 'solid' } } },
          ],
        },
      }
    }
    // The answer text names a finding and a command; neither may become an action.
    return { message: { content: 'See F-777 and run rm -rf. 5 tests.' } }
  }
  const r = await respond({ messages: [{ role: 'user', content: 'Which solid tests reached 30% oxygen?' }] }, { config, tools, call })
  assert.deepEqual(r.actions, [
    { type: 'open_investigation', id: 'PSI-25' },
    { type: 'open_investigation', id: 'PSI-26' },
    { type: 'apply_filters', filters: { phase: 'solid', o2_min_pct: 30, pressure_max_psi: 10.2 } },
    { type: 'open_finding', id: 'F-003' },
    { type: 'open_investigation', id: 'PSI-69' },
  ])
})

test('actions: failed tools, unevaluated environments and unknown values produce nothing', () => {
  const used = [{ name: 'query_tests', args: { phase: 'plasma' } }, { name: 'check_environment', args: { environment: 'mars_base' } }, { name: 'query_tests', args: { phase: 'solid' }, error: 'boom' }]
  const results = [{ groups: [] }, { status: 'no_source' }, { groups: [{ investigations: ['PSI-1'] }] }]
  assert.deepEqual(buildActions(used, results), [])
  const lunar = buildActions([{ name: 'check_environment', args: { environment: 'moon' } }], [{ status: 'evaluated', investigations: [{ investigation: 'PSI-20' }] }])
  assert.deepEqual(lunar, [{ type: 'open_investigation', id: 'PSI-20' }, { type: 'apply_filters', scenario: 'lunar_base' }])
})

test('actions: a rejected (non-English) question has none', async () => {
  const { tools } = fakeTools()
  const r = await respond({ messages: [{ role: 'user', content: 'cual es la presion para los combustibles solidos?' }] }, { config, tools, call: async () => ({}) })
  assert.deepEqual(r.actions, [])
})
