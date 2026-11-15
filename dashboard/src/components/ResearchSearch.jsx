import { useId, useLayoutEffect, useRef, useState } from 'react'
import { SUGGESTIONS } from '../chat/useChat.js'
import { assistantProblem } from '../chat/statusText.js'

// The question bar: a compact, centered glass surface in the normal-flow dock at the bottom of the workspace.
// Typing changes nothing. A question is sent only by Send or Enter (Shift+Enter adds a line), and a suggestion
// sends exactly its own text, once. It talks to the one shared conversation (chat), so there is no second request
// path. Suggestions show while the conversation is empty and fold away once it begins; a toggle brings them back.
// The field is ALWAYS editable, whatever the backend state: the draft lives in the conversation store (chat.draft),
// survives Retry, status checks, navigation and profile changes, and is cleared only when a submission is accepted.
// While the assistant is unavailable, Send is unavailable and Enter explains the blocker instead of sending.
export default function ResearchSearch({ chat, onSubmit, onShowResult, resultLabel = 'Research history' }) {
  const { status, checking, busy, seconds, stop, recheck, turns } = chat
  const id = useId()
  const input = useRef(null)
  const { draft: text, setDraft: setText } = chat
  const [blocked, setBlocked] = useState(false) // the person tried to send while the assistant could not answer
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const available = Boolean(status?.available)
  const problem = assistantProblem(status)
  const started = turns.length > 0
  const showSuggestions = !started || suggestionsOpen

  // The field grows with its text; CSS caps the height and the field scrolls inside beyond that.
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight excludes the border, so add it back or a one-line field shows a scrollbar.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  }, [text])

  // Returns true only when the question was handed to the conversation. Known-unsupported requests are never sent.
  const submit = (question) => {
    const q = question.trim()
    if (!q) return false
    if (!available) {
      setBlocked(true)
      return false
    }
    if (busy) return false
    setBlocked(false)
    onSubmit(q)
    setSuggestionsOpen(false)
    return true
  }

  // A suggestion sends itself when the assistant can answer; otherwise it fills the draft so it can be edited or sent later.
  const pickSuggestion = (question) => {
    if (available && !busy) {
      submit(question)
      return
    }
    // An existing draft is never overwritten: the suggestion is added on a new line.
    setText(text.trim() ? `${text.replace(/\s+$/, '')}
${question}` : question)
    input.current?.focus()
  }

  return (
    <section className="rs" aria-labelledby={`${id}-title`}>
      <h2 className="visually-hidden" id={`${id}-title`}>
        Ask a question
      </h2>

      <form
        className="rs-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (submit(text)) setText('')
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
          onChange={(event) => {
            setText(event.target.value)
            if (blocked) setBlocked(false)
          }}
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
          aria-describedby={`${id}-status ${id}-hint`}
        />
        {busy ? (
          <button type="button" className="btn btn-secondary" onClick={stop}>
            Stop waiting
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!available || !text.trim()} title={available ? undefined : 'The assistant is unavailable. Your question stays in the box.'}>
            Send
          </button>
        )}
      </form>
      <p className="visually-hidden" id={`${id}-hint`}>
        Press Enter to send, or Shift and Enter for a new line. You can keep typing while the assistant is unavailable; Send works again when it is back.
      </p>

      {showSuggestions && (
        <div className="rs-chips" role="group" aria-label="Suggested questions" id={`${id}-chips`}>
          {SUGGESTIONS.map((question) => (
            <button key={question} type="button" className="rs-chip" onClick={() => pickSuggestion(question)}>
              {question}
            </button>
          ))}
        </div>
      )}

      {blocked && !available && (
        <p className="rs-blocked" role="alert">
          Not sent: the assistant is unavailable. {problem ?? 'Checking the connection…'} Your question is saved in the box; use Retry, then Send.
        </p>
      )}

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
        {started && (
          <button type="button" className="btn btn-ghost btn-compact" aria-expanded={suggestionsOpen} aria-controls={`${id}-chips`} onClick={() => setSuggestionsOpen((v) => !v)}>
            {suggestionsOpen ? 'Hide suggestions' : 'Suggested questions'}
          </button>
        )}
        {onShowResult && started && (
          <button type="button" className="btn btn-ghost btn-compact" onClick={onShowResult}>
            {resultLabel}
          </button>
        )}
      </div>
    </section>
  )
}
