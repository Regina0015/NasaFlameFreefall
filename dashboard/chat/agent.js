// The chat loop: one agent, up to config.maxSteps model calls. The model picks tools; code runs them
// (scripts/chat_tools.py); the last step offers no tools, so it always ends with text.

import { systemPrompt, isEnglish, ENGLISH_ONLY, NUDGE_TOOL, NUDGE_ANSWER } from './prompt.js'
import { checkNumbers } from './checkNumbers.js'
import { buildActions } from './references.js'

// Same text as LUNAR_WARNING in scripts/write_finding.py.
export const PARTIAL_GRAVITY_WARNING =
  'PSI has no partial-gravity combustion data. Lunar and Mars conclusions are bounded by microgravity and Earth-gravity results only.'

// Ollama call (POST /api/chat, no streaming). Tests replace it.
export async function callOllama(config, body) {
  const response = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      think: config.think,
      options: config.options,
      keep_alive: config.keepAlive,
      ...body,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new Error(`Ollama answered ${response.status}: ${text.slice(0, 300)}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

// Only user and assistant messages, trimmed, and only the last few (fits in 8192 tokens).
export function cleanHistory(messages, maxTurns) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-maxTurns)
}

const parseArguments = (a) => {
  if (typeof a !== 'string') return a ?? {}
  try {
    return JSON.parse(a)
  } catch {
    return {}
  }
}

// Warnings that do not depend on the model repeating them.
export function warningsFor(results, question) {
  const all = new Set(results.flatMap((r) => [...(r.warnings ?? []), ...(r.findings ?? []).flatMap((f) => f.warnings ?? [])]))
  if (/\b(lunar|moon|mars|martian|rover)\b/i.test(question)) all.add(PARTIAL_GRAVITY_WARNING)
  return [...all].filter((w) => !/^Unknown investigation/.test(w))
}

const emptyReply = (config, answer) => ({
  answer,
  rejected: true,
  warnings: [],
  tools: [],
  actions: [],
  notes: [],
  findings: [],
  preliminary: false,
  no_tools: false,
  check: { ok: true, unsourced_numbers: [] },
  model: config.model,
})

export async function respond({ messages, view }, { config, tools, call = callOllama }) {
  const history = cleanHistory(messages, config.maxTurns)
  if (!history.length || history.at(-1).role !== 'user') throw new Error('Missing the user question.')
  const question = history.at(-1).content

  // English only: other languages get a fixed reply and never reach the model.
  if (!isEnglish(question)) return emptyReply(config, ENGLISH_ONLY)

  const conversation = [{ role: 'system', content: systemPrompt(view) }, ...history]
  const used = []
  const results = []
  let answer = ''
  let nudged = false

  for (let step = 0; step < config.maxSteps; step++) {
    const last = step === config.maxSteps - 1
    const r = await call(config, { messages: conversation, ...(last ? {} : { tools: tools.definitions }) })
    const message = r.message ?? {}
    const calls = message.tool_calls ?? []

    if (!calls.length) {
      // It answered without checking the data: ask once for a tool.
      if (!used.length && !nudged && !last) {
        nudged = true
        conversation.push({ role: 'assistant', content: message.content ?? '' }, { role: 'user', content: NUDGE_TOOL })
        continue
      }
      answer = (message.content ?? '').trim()
      break
    }

    conversation.push({ role: 'assistant', content: message.content ?? '', tool_calls: calls })
    for (const c of calls) {
      const name = c.function?.name
      const args = parseArguments(c.function?.arguments)
      const result = await tools.execute(name, args)
      results.push(result)
      used.push({ name, args, source: result.source ?? null, error: result.error ?? null })
      conversation.push({ role: 'tool', tool_name: name, content: JSON.stringify(result) })
    }
  }

  // Empty answer after using tools: one more step, without tools, asking for the text.
  if (!answer && used.length) {
    conversation.push({ role: 'user', content: NUDGE_ANSWER })
    const r = await call(config, { messages: conversation })
    answer = (r.message?.content ?? '').trim()
  }
  if (!answer) answer = 'I could not put together an answer. Please try asking in a different way.'

  return {
    answer,
    rejected: false,
    warnings: warningsFor(results, question),
    tools: used,
    // Optional dashboard actions, built by code from the tool calls and results (never from the answer text).
    actions: buildActions(used, results),
    notes: [...new Set(results.map((r) => r.note).filter(Boolean))],
    // Every finding the model saw, with its grade: no claim is shown without one (_config/audiences.md).
    findings: [...new Map(results.flatMap((r) => r.findings ?? []).map((f) => [f.id, { id: f.id, grade: f.grade, failed_checks: f.failed_checks ?? [] }])).values()],
    preliminary: results.some((r) => r.preliminary),
    no_tools: used.length === 0,
    check: checkNumbers(answer, { results, questions: history.filter((m) => m.role === 'user').map((m) => m.content) }),
    model: config.model,
  }
}
