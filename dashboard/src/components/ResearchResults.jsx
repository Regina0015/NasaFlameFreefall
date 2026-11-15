import { useEffect, useRef, useState } from 'react'
import ResponseTurn from './ResponseTurn.jsx'

// The research history: every question of the shared conversation and its answer, in order, with new turns
// appended below the earlier ones. It replaces the overview in the main workspace and scrolls inside the
// workspace region, above the question bar (which has its own space in the dock, so nothing overlaps).
// Student and Professional render the same turns; see ResponseTurn.jsx. Answers stay ungraded.

const near = (el, container) => {
  const box = container.getBoundingClientRect()
  const top = el.getBoundingClientRect().top
  return top >= box.top - 4 && top < box.bottom - 96
}

export default function ResearchResults({ chat, view, findings, investigations, labelFor, activeId, scrollRef, onSeeStatus, onOpenEvidence, onApplyBrowser, onOpenMap }) {
  const { turns } = chat
  const latest = turns.at(-1) ?? null
  const [confirmClear, setConfirmClear] = useState(false)
  const [newResponse, setNewResponse] = useState(false)
  const lastReplyKey = latest?.reply ? latest.id : null
  const previous = useRef(lastReplyKey)

  // A reply that arrives while the person is reading older turns adds a "New response" pill; it never scrolls.
  useEffect(() => {
    if (lastReplyKey !== null && lastReplyKey !== previous.current) {
      const container = scrollRef?.current
      const element = document.getElementById(`turn-${lastReplyKey}`)
      if (container && element && !near(element, container)) setNewResponse(true)
    }
    previous.current = lastReplyKey
  }, [lastReplyKey, scrollRef])

  // The pill goes away once the newest turn is back in view, or when a newer question is asked.
  useEffect(() => {
    const container = scrollRef?.current
    if (!container || !newResponse) return undefined
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const element = latest && document.getElementById(`turn-${latest.id}`)
        if (element && near(element, container)) setNewResponse(false)
      })
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      container.removeEventListener('scroll', onScroll)
    }
  }, [newResponse, latest, scrollRef])

  useEffect(() => {
    if (latest?.pending) setNewResponse(false)
  }, [latest?.pending])

  // Opening a specific turn (from history navigation) scrolls to it.
  useEffect(() => {
    if (activeId == null) return
    document.getElementById(`turn-${activeId}`)?.scrollIntoView({ block: 'start' })
  }, [activeId])

  const showNewest = () => {
    if (latest) document.getElementById(`turn-${latest.id}`)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    setNewResponse(false)
  }

  return (
    <section className="ws-panel rr" aria-labelledby="rr-title">
      <header className="rr-head">
        <h2 id="rr-title" tabIndex={-1}>
          Research history
        </h2>
        <div className="rr-head-actions">
          {turns.length > 0 &&
            (confirmClear ? (
              <span className="rr-confirm" role="group" aria-label="Confirm clearing the conversation">
                <span>Clear {turns.length} question{turns.length > 1 ? 's' : ''} and answers?</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => {
                    chat.clear()
                    setConfirmClear(false)
                    setNewResponse(false)
                  }}
                >
                  Clear
                </button>
                <button type="button" className="btn btn-ghost btn-compact" onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setConfirmClear(true)}>
                Clear conversation
              </button>
            ))}
          <button type="button" className="btn btn-secondary btn-compact" onClick={onSeeStatus}>
            See status
          </button>
        </div>
      </header>

      {turns.length === 0 && (
        <p className="ev-empty">
          <span>
            <strong>No question yet.</strong> Ask about NASA combustion evidence in the bar below. Each question and its answer will stay here, in order.
          </span>
        </p>
      )}

      <div className="rt-list">
        {turns.map((turn, index) => (
          <ResponseTurn
            key={turn.id}
            turn={turn}
            number={index + 1}
            view={view}
            findings={findings.items}
            investigations={investigations}
            labelFor={labelFor}
            isLatest={latest && turn.id === latest.id}
            seconds={turn.pending ? chat.seconds : 0}
            busy={chat.busy}
            onRetry={chat.retry}
            onStop={chat.stop}
            onOpenEvidence={onOpenEvidence}
            onApplyBrowser={onApplyBrowser}
            onOpenMap={onOpenMap}
            onSeeStatus={onSeeStatus}
          />
        ))}
      </div>

      {newResponse && (
        <div className="rt-new">
          <button type="button" className="btn btn-primary btn-compact" onClick={showNewest}>
            New response ↓
          </button>
        </div>
      )}
    </section>
  )
}
