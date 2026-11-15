import { useEffect, useRef, useState } from 'react'
import './chat.css'

// Chat with the local model (Ollama). It only exists with `npm run dev` on the computer that runs
// Ollama; on Vercel there is no /api/chat and the panel shows a notice. See dashboard/chat/.
// The chat accepts and answers in English only.
export default function ChatPanel({ view }) {
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)

  useEffect(() => {
    fetch('/api/chat/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setStatus((s) => s ?? { available: false }))
  }, [])

  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [messages, busy])

  async function ask(e) {
    e.preventDefault()
    const question = text.trim()
    if (!question || busy) return
    const next = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setText('')
    setBusy(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Rejected questions (not in English) and errors are not sent back as history.
        body: JSON.stringify({ view, messages: next.filter((m) => !m.skip).map(({ role, content }) => ({ role, content })) }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`)
      const asked = data.rejected ? next.map((m, i) => (i === next.length - 1 ? { ...m, skip: true } : m)) : next
      setMessages([...asked, { role: 'assistant', content: data.answer, meta: data, skip: data.rejected }])
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: `Could not answer: ${err.message}`, error: true, skip: true }])
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <section className="chat" lang="en">
      <h2>Ask the data</h2>
      {!status.available ? (
        <p className="chat-notice">
          {status.ollama === false
            ? 'Ollama is not responding. The chat only works locally, with Ollama running and `npm run dev`.'
            : status.ollama
              ? `The model is missing: ollama pull ${status.model}`
              : 'The chat only works locally, with Ollama and `npm run dev`.'}
        </p>
      ) : (
        <>
          <p className="chat-notice">
            Answers from the local model {status.model}, in English only. They are not audited findings: each answer
            says where its data came from.
          </p>
          <ol className="chat-messages">
            {messages.map((m, i) => (
              <li key={i} className={`chat-${m.role}${m.error ? ' chat-error' : ''}`}>
                <p>{m.content}</p>
                {m.meta && !m.meta.rejected && <Provenance meta={m.meta} view={view} />}
              </li>
            ))}
            {busy && <li className="chat-assistant chat-notice">Checking the data…</li>}
            <li ref={end} aria-hidden="true" />
          </ol>
          <form onSubmit={ask} className="chat-form">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Did any solid-fuel test reach 30% O2?"
              aria-label="Question (English only)"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !text.trim()}>
              Ask
            </button>
          </form>
        </>
      )}
    </section>
  )
}

function Provenance({ meta, view }) {
  return (
    <div className="chat-meta">
      {meta.warnings.map((w) => (
        <p key={w} className="chat-alert">{w}</p>
      ))}
      {meta.no_tools && <p className="chat-alert">This answer did not check the data: treat it as guidance, ungraded.</p>}
      {!meta.check.ok && (
        <p className="chat-alert">
          Numbers not found in the data checked: {meta.check.unsourced_numbers.join(', ')}. Verify them.
        </p>
      )}
      {meta.notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
      {meta.findings.length > 0 && (
        <p>
          Findings consulted:{' '}
          {meta.findings.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ', '}
              {f.id} <span className="grado">{f.grade}</span>
              {view === 'cientifico' && f.failed_checks.length > 0 && <> (failed: {f.failed_checks.join(', ')})</>}
            </span>
          ))}
        </p>
      )}
      {view === 'cientifico' && meta.tools.length > 0 && (
        <details>
          <summary>Queries run ({meta.tools.length})</summary>
          <ul>
            {meta.tools.map((t, i) => (
              <li key={i}>
                <code>{t.name}({JSON.stringify(t.args)})</code>
                {t.error && <> · error: {t.error}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
