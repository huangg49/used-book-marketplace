import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { createLiveWatcher, sessionSocketOptions, type TransactionWatch } from '@used-books/session-client'
import { session } from '../lib/session'
import { useSession } from './useSession'

const apiBase = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000/api/v1'
const origin = apiBase.startsWith('/') ? '' : apiBase.replace(/\/api\/v1\/?$/, '')

// One socket per namespace for the whole tab; screens share watches on it.
const live = createLiveWatcher({
  client: session,
  open: namespace => io(`${origin}/${namespace}`, {
    ...sessionSocketOptions,
    auth: callback => callback({ token: session.getAccessToken() }),
  }),
})

export function useTransactionLive(kind: TransactionWatch, id: string | null | undefined, refresh: () => void) {
  const state = useSession()
  const userId = state.status === 'authenticated' ? state.user.id : undefined
  const [subscribed, setSubscribed] = useState<string>()
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  const target = userId && id ? `${userId}:${kind}:${id}` : undefined

  useEffect(() => {
    if (!target || !id) return
    const stop = live.watch(kind, id, {
      refresh: () => refreshRef.current(),
      onWatching: active => setSubscribed(active ? target : undefined),
    })
    return () => {
      stop()
      setSubscribed(undefined)
    }
  }, [id, kind, target])

  return Boolean(target && subscribed === target)
}
