import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { auctionSchema, auctionSummarySchema, type AuctionSummary } from '../services/auctions'

// Live auction channel (ADR 0031). Pushes carry the same public data as the REST
// reads and are written straight into the query cache; REST stays the source of
// truth, so every (re)connect resyncs from the watch acknowledgement.
const socketUrl = (import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:3000/api/v1').replace(/\/api\/v1\/?$/, '')

let shared: Socket | null = null
let users = 0
function acquire() {
  shared ??= io(`${socketUrl}/auctions`, { transports: ['websocket', 'polling'] })
  users++
  return shared
}
function release() {
  if (--users > 0 || !shared) return
  shared.disconnect()
  shared = null
}

/** Keeps ['auction', id] live. Returns true while pushes are flowing. */
export function useAuctionLive(id: string | undefined, onChange?: () => void) {
  const queryClient = useQueryClient()
  // True from a successful watch ack until disconnect or cleanup.
  const [watching, setWatching] = useState(false)

  useEffect(() => {
    if (!id) return
    const s = acquire()
    const apply = (raw: unknown) => {
      const parsed = auctionSchema.safeParse(raw)
      if (!parsed.success || parsed.data.auction.id !== id) return false
      queryClient.setQueryData(['auction', id], parsed.data)
      return true
    }
    const watch = () => {
      s.emit('auction:watch', id, (reply: { ok?: boolean; auction?: unknown }) => {
        setWatching(!!reply?.ok && apply(reply.auction))
      })
    }
    const update = (raw: unknown) => {
      if (!apply(raw)) return
      // Own standing (leading/outbid) is private: read it again over REST.
      void queryClient.invalidateQueries({ queryKey: ['auction-participation', id] })
      void queryClient.invalidateQueries({ queryKey: ['point-order'] })
      onChange?.()
    }
    const lost = () => setWatching(false)
    s.on('connect', watch)
    s.on('disconnect', lost)
    s.on('auction:update', update)
    if (s.connected) watch()
    return () => {
      s.off('connect', watch)
      s.off('disconnect', lost)
      s.off('auction:update', update)
      if (s.connected) s.emit('auction:unwatch', id)
      setWatching(false)
      release()
    }
    // onChange is a notification hook; re-subscribing on each render is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queryClient])

  return watching
}

type AuctionList = { items: AuctionSummary[]; serverTime: string }

/** Keeps ['auctions'] live: replaces changed cards, adds opened, drops closed. */
export function useAuctionListLive() {
  const queryClient = useQueryClient()
  // True from a successful watch ack until disconnect or cleanup.
  const [watching, setWatching] = useState(false)

  useEffect(() => {
    const s = acquire()
    const watch = () => {
      s.emit('auctions:watch', (reply: { ok?: boolean }) => {
        setWatching(!!reply?.ok)
        // Anything missed while disconnected comes back with a fresh list.
        void queryClient.invalidateQueries({ queryKey: ['auctions'] })
      })
    }
    const summary = (raw: unknown) => {
      const parsed = auctionSummarySchema.safeParse(raw)
      if (!parsed.success) return
      const next = parsed.data
      queryClient.setQueryData<AuctionList>(['auctions'], (list) => {
        if (!list) return list
        const rest = list.items.filter((item) => item.id !== next.id)
        return { ...list, items: next.state === 'Active' ? [...rest, next] : rest }
      })
    }
    const lost = () => setWatching(false)
    s.on('connect', watch)
    s.on('disconnect', lost)
    s.on('auction:summary', summary)
    if (s.connected) watch()
    return () => {
      s.off('connect', watch)
      s.off('disconnect', lost)
      s.off('auction:summary', summary)
      if (s.connected) s.emit('auctions:unwatch')
      setWatching(false)
      release()
    }
  }, [queryClient])

  return watching
}
