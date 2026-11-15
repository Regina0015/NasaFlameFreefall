import { useEffect, useRef } from 'react'
import './chat.css'

// The conversation view. State lives in useChat (one shared conversation for the whole workspace) and the
// question input lives in the bottom request bar, so this component only shows the connection state and the
// messages with their provenance. Answers are ungraded unless a consulted finding carries a recorded grade.
// The chat accepts and answers in English only.
export default function ChatPanel({ chat, view }) {
  const { status, messages, busy, seconds } = chat
  const end = useRef(null)

  // Follow new messages only when the reader is already near the bottom, so reading older answers is never interrupted.
  // A question the person has just sent always scrolls into view. Only the conversation box scrolls, never the page.
  const nearBottom = useRef(true)

  useEffect(() => {
    const box = end.current?.closest('[data-chat-scroll]')
    if (!box) return undefined
    const onScroll = () => {
      nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const box = end.current?.closest('[data-chat-scroll]')
    if (!box) return
    if (nearBottom.current || messages.at(-1)?.role === 'user') {
      box.scrollTop = box.scrollHeight
      nearBottom.current = true
    }
  }, [messages, busy])

  return (
    <section className="chat" lang="en" aria-label="Conversation">
      {!status ? (
        <p className="chat-notice" role="status">
          Checking the assistant connection…
        </p>
      ) : !status.available ? (
        <p className="chat-notice chat-unavailable" role="status">
          <strong>Assistant unavailable.</strong>{' '}
          {status.unreachable
            ? 'Its backend is not reachable from this page. The assistant runs only locally, with npm run dev, Ollama and the repository data; it is not part of this deployment.'
            : status.ollama === false
              ? 'Ollama is not responding. Start Ollama and use Refresh data to check again.'
              : `The local model is missing. Run: ollama pull ${status.model}`}
        </p>
      ) : (
        <p className="chat-notice">
          Answers from the local model {status.model}, in English only. They are ungraded: they are not audited findings, and each answer says
          where its data came from.
          {status.snapshot_updated && (
            <>
              {' '}
              It reads a local data snapshot last written{' '}
              <time dateTime={status.snapshot_updated}>{new Date(status.snapshot_updated).toLocaleString()}</time>, which can differ from the database.
            </>
          )}
        </p>
      )}

      {messages.length === 0 && !busy && status?.available && <p className="muted">No questions yet. Ask below.</p>}

      <ol className="chat-messages" aria-label="Conversation" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={`chat-${m.role}${m.error ? ' chat-error' : ''}`}>
            <p>{m.content}</p>
            {m.meta && !m.meta.rejected && <Provenance meta={m.meta} view={view} />}
          </li>
        ))}
        {busy && (
          <li className="chat-assistant chat-notice">
            Checking the data… {seconds >= 8 ? `${seconds} s, the local model can be slow.` : ''}
          </li>
        )}
        <li ref={end} aria-hidden="true" />
      </ol>
    </section>
  )
}

function Provenance({ meta, view }) {
  return (
    <div className="chat-meta">
      <p className="chat-tag">Ungraded answer · not an audited finding</p>
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
