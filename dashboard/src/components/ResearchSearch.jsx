import { useId, useLayoutEffect, useRef, useState } from 'react'
import { SUGGESTIONS } from '../chat/useChat.js'
import { assistantProblem } from '../chat/statusText.js'

// The research search: a compact glass input with suggested-question chips below it, in normal document flow.
// Typing changes nothing. A question is sent only by Send or Enter (Shift+Enter adds a line), and a chip sends
// exactly its own text, once. The same component is used at the top of the overview and for follow-ups in the
// results view; both talk to the one shared conversation (chat), so there is no second request path.
export default function ResearchSearch({ chat, onSubmit, onShowResult, resultLabel = 'Latest result', heading }) {
  const { status, checking, busy, seconds, stop, recheck, turns } = chat
  const id = useId()
  const input = useRef(null)
  const [text, setText] = useState('')

  const available = Boolean(status?.available)
  const problem = assistantProblem(status)

  // The field grows with its text; CSS caps the height and the field scrolls inside beyond that.
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight excludes the border, so add it back or a one-line field shows a scrollbar.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  }, [text])

  const submit = (question) => {
    const q = question.trim()
    if (!q || busy || !available) return
    onSubmit(q)
  }

  return (
    <section className="rs" aria-labelledby={`${id}-title`}>
      <h2 className={heading ? 'rs-title' : 'visually-hidden'} id={`${id}-title`}>
        {heading ?? 'Research search'}
      </h2>

      <form
        className="rs-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!text.trim()) return
          submit(text)
          setText('')
        }}
      >
        <label className="visually-hidden" htmlFor={`${id}-input`}>
          Ask about NASA combustion evidence (English only)
        </label>
        <textarea
          id={`${id}-input`}
          ref={input}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter adds a line.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="Ask about NASA combustion evidence…"
          autoComplete="off"
          maxLength={1000}
          disabled={!available}
          aria-describedby={`${id}-status ${id}-hint`}
        />
        {busy ? (
          <button type="button" className="btn btn-secondary" onClick={stop}>
            Stop waiting
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!available || !text.trim()}>
            Send
          </button>
        )}
      </form>
      <p className="visually-hidden" id={`${id}-hint`}>
        Press Enter to send, or Shift and Enter for a new line.
      </p>

      <div className="rs-chips" role="group" aria-label="Suggested questions">
        {SUGGESTIONS.map((question) => (
          <button key={question} type="button" className="rs-chip" disabled={!available || busy} onClick={() => submit(question)}>
            {question}
          </button>
        ))}
      </div>

      <div className="rs-foot">
        <p className="rs-status" id={`${id}-status`} role="status" data-state={checking && !status ? 'checking' : available ? 'ok' : 'down'}>
          {checking && !status
            ? 'Checking the assistant connection…'
            : busy
              ? `Checking the data… ${seconds >= 8 ? `${seconds} s, the local model can be slow.` : ''}`
              : available
                ? 'Local assistant. Answers are ungraded and are not audited findings.'
                : `Assistant unavailable. ${problem}`}
        </p>
        {!available && !(checking && !status) && (
          <button type="button" className="btn btn-secondary btn-compact" onClick={recheck} disabled={checking}>
            {checking ? 'Checking…' : 'Retry'}
          </button>
        )}
        {onShowResult && turns.length > 0 && (
          <button type="button" className="btn btn-ghost btn-compact" onClick={onShowResult}>
            {resultLabel}
          </button>
        )}
      </div>
    </section>
  )
}
