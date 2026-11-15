import { useEffect, useId, useRef, useState } from 'react'
import ChatPanel from '../chat/ChatPanel.jsx'

// The floating assistant: a small glass launcher in the bottom-right corner that opens a compact conversation
// popover. The popover is for optional history only; detailed results belong in the main workspace. It never opens
// by itself (a new answer only adds a badge) and never takes focus unless the person opens it. It reads the same
// shared conversation as the research search, so there is no second request path.
export default function AssistantLauncher({ chat, view, onOpenResult }) {
  const { turns, unseen, markSeen, clear, status, checking, recheck } = chat
  const [open, setOpen] = useState(false)
  const id = useId()
  const launcher = useRef(null)
  const popover = useRef(null)
  const heading = useRef(null)

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => launcher.current?.focus())
  }

  // Opening is the person's action, so focus moves to the popover. Anything that arrives while it is open is seen.
  useEffect(() => {
    if (!open) return undefined
    heading.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event) => {
      if (popover.current?.contains(event.target) || launcher.current?.contains(event.target)) return
      close(false) // clicking elsewhere closes it without pulling focus back
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  useEffect(() => {
    if (open) markSeen()
  }, [open, chat.messages, markSeen])

  const badge = !open && unseen > 0

  return (
    <div className="ap">
      {open && (
        <section ref={popover} id={`${id}-pop`} className="ap-pop" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}>
          <header className="ap-head">
            <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
              Conversation
            </h2>
            <span className="tag">Ungraded</span>
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => close()}>
              Close
            </button>
          </header>

          <div className="ap-body" data-chat-scroll>
            <ChatPanel chat={chat} view={view} />
          </div>

          <footer className="ap-foot">
            {turns.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => {
                  onOpenResult()
                  close(false)
                }}
              >
                Open latest result
              </button>
            )}
            {!status?.available && !(checking && !status) && (
              <button type="button" className="btn btn-secondary btn-compact" onClick={recheck} disabled={checking}>
                {checking ? 'Checking…' : 'Retry connection'}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-compact" onClick={clear} disabled={turns.length === 0 && !chat.busy}>
              Clear conversation
            </button>
          </footer>
        </section>
      )}

      <button
        type="button"
        ref={launcher}
        className="ap-launch"
        aria-expanded={open}
        aria-controls={open ? `${id}-pop` : undefined}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        <span>Assistant</span>
        {badge && (
          <span className="ap-badge">
            {unseen}
            <span className="visually-hidden"> new {unseen === 1 ? 'answer' : 'answers'}</span>
          </span>
        )}
      </button>
    </div>
  )
}
