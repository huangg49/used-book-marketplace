import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { sessionSocketOptions, watchSessionResource, type TransactionWatch } from '@used-books/session-client'
import { session } from '../lib/session'
import { useSession } from './useSession'

const apiBase = import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000/api/v1'
const origin = apiBase.startsWith('/') ? '' : apiBase.replace(/\/api\/v1\/?$/, '')

export function useTransactionLive(kind: TransactionWatch, id: string | null | undefined, refresh: () => void) {
  const state = useSession()
  const userId = state.status === 'authenticated' ? state.user.id : undefined
  const [subscribed, setSubscribed] = useState<string>()
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  const target = userId && id ? `${userId}:${kind}:${id}` : undefined

  useEffect(() => {
    if (!target || !id) return
    const namespace = kind === 'point-order' ? 'point-orders' : 'transactions'
    const socket = io(`${origin}/${namespace}`, {
      ...sessionSocketOptions,
      auth: callback => callback({ token: session.getAccessToken() }),
    })
    const stop = watchSessionResource({
      client: session, socket, kind, id,
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
