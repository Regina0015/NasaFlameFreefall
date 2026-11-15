import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ONE shared conversation for the whole workspace: the research search at the top, the results view and the
// floating assistant all read and write this single state. It lives above the views, so changing views never loses
// it, and it disappears with the workspace when the person signs out or leaves the demo.
// Backend contract (dashboard/chat/server.js): GET /api/chat/status and POST /api/chat { view, messages }.
// The answer carries provenance (warnings, notes, findings consulted, tools run, number check). It carries no
// navigation actions: this hook never changes the workspace.
// A response only counts if it belongs to the latest request: clearing the conversation or asking again makes
// any older response stale, so a late answer can never overwrite a newer result.

export const SUGGESTIONS = [
  'Which investigations studied solid fuels?',
  'Which tests reached at least 30% oxygen?',
  'Which materials have missing oxygen or pressure data?',
  'What experimental coverage is missing for the lunar base?',
]

// One turn per question: the question, its reply (when it has arrived) and whether it is still pending.
export function toTurns(messages, busy) {
  const turns = []
  messages.forEach((message, index) => {
    if (message.role !== 'user') return
    const reply = messages[index + 1]?.role === 'assistant' ? messages[index + 1] : null
    turns.push({ id: index, question: message.content, reply, pending: !reply && busy })
  })
  return turns
}

export function useChat(view) {
  const [status, setStatus] = useState(null) // null until the first check finishes
  const [checking, setChecking] = useState(true)
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [seen, setSeen] = useState(0) // how many messages the person has had the chance to read
  // The question being written. It lives with the conversation, so it survives Retry, status checks, workspace
  // changes and profile switches, and is cleared only when a submission is accepted.
  const [draft, setDraft] = useState('')
  const abort = useRef(null)
  const sequence = useRef(0)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const recheck = useCallback(() => {
    setChecking(true)
    fetch('/api/chat/status')
      .then((r) => (r.ok ? r.json() : { available: false, unreachable: true }))
      .catch(() => ({ available: false, unreachable: true }))
      .then((s) => {
        setStatus(s)
        setChecking(false)
      })
  }, [])

  useEffect(() => {
    recheck()
    return () => abort.current?.abort()
  }, [recheck])

  // Seconds waited, so a slow local model is visible instead of looking frozen.
  useEffect(() => {
    if (!busy) {
      setSeconds(0)
      return undefined
    }
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const run = useCallback(
    async (history) => {
      const mine = ++sequence.current
      const controller = new AbortController()
      abort.current = controller
      setMessages(history)
      setBusy(true)
      const settle = (next) => {
        if (sequence.current === mine) setMessages(next) // a newer request or a clear makes this one stale
      }
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          // Rejected questions (not in English) and errors are not sent back as history.
          body: JSON.stringify({ view, messages: history.filter((m) => !m.skip).map(({ role, content }) => ({ role, content })) }),
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`)
        const asked = data.rejected ? history.map((m, i) => (i === history.length - 1 ? { ...m, skip: true } : m)) : history
        settle([...asked, { role: 'assistant', content: data.answer, meta: data, skip: data.rejected }])
      } catch (err) {
        const stopped = err?.name === 'AbortError'
        settle([
          ...history,
          {
            role: 'assistant',
            content: stopped ? 'Stopped waiting for this answer. The local model may still be working on it.' : `Could not answer: ${err.message}`,
            error: !stopped,
            skip: true,
          },
        ])
      } finally {
        if (sequence.current === mine) {
          abort.current = null
          setBusy(false)
        }
      }
    },
    [view],
  )

  const ask = useCallback(
    async (text) => {
      const question = text.trim()
      if (!question || busy) return false
      await run([...messagesRef.current, { role: 'user', content: question }])
      return true
    },
    [busy, run],
  )

  // Asks the last question again, replacing the failed or stopped turn instead of stacking a second one.
  const retry = useCallback(async () => {
    if (busy) return false
    const list = messagesRef.current
    const lastUser = list.map((m) => m.role).lastIndexOf('user')
    if (lastUser < 0) return false
    await run([...list.slice(0, lastUser), list[lastUser]])
    return true
  }, [busy, run])

  const stop = useCallback(() => abort.current?.abort(), [])

  const clear = useCallback(() => {
    sequence.current += 1 // anything still in flight is now stale
    abort.current?.abort()
    abort.current = null
    setBusy(false)
    setMessages([])
    setSeen(0)
  }, [])

  const turns = useMemo(() => toTurns(messages, busy), [messages, busy])
  const markSeen = useCallback(() => setSeen(messagesRef.current.length), [])
  const unseen = Math.max(0, messages.filter((m) => m.role === 'assistant').length - messages.slice(0, seen).filter((m) => m.role === 'assistant').length)

  return { status, checking, messages, turns, busy, seconds, unseen, draft, setDraft, ask, retry, stop, clear, recheck, markSeen }
}
