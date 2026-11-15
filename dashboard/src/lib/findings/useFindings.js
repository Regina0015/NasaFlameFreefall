import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFindings } from './adapters.js'

// Loads findings on mount and on refresh(). A failed refresh keeps the last good list and says so.
export function useFindings() {
  const [state, setState] = useState({ status: 'loading', items: [], source: null, attempts: [], refreshedAt: null, refreshing: false })
  const active = useRef(true)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    if (running.current) return
    running.current = true
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const result = await loadFindings()
      if (active.current) {
        setState({
          status: result.source ? 'ready' : 'unavailable',
          items: result.items,
          source: result.source,
          attempts: result.attempts,
          refreshedAt: new Date(),
          refreshing: false,
        })
      }
    } finally {
      running.current = false
    }
  }, [])

  useEffect(() => {
    active.current = true
    refresh()
    return () => {
      active.current = false
    }
  }, [refresh])

  return { ...state, refresh }
}
