import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { loadEvidence } from './evidenceData.js'

const NOT_CONNECTED = {
  status: 'unavailable',
  data: null,
  refreshing: false,
  refreshedAt: null,
  error: null,
  source: null,
}

// Loads on mount and on refresh(). A failed refresh keeps the last good data and says so.
export function useEvidence() {
  const [state, setState] = useState(
    supabase ? { ...NOT_CONNECTED, status: 'loading', source: 'database' } : NOT_CONNECTED,
  )
  const active = useRef(true)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase || running.current) return
    running.current = true
    setState((s) => ({ ...s, refreshing: true, error: null }))

    try {
      const data = await loadEvidence(supabase)
      if (active.current) {
        setState({ status: 'ready', data, refreshing: false, refreshedAt: new Date(), error: null, source: 'database' })
      }
    } catch (e) {
      const message = e?.message || 'The database could not be reached.'
      if (active.current) {
        setState((s) => ({
          ...s,
          status: s.data ? 'ready' : 'error',
          refreshing: false,
          error: message,
        }))
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
