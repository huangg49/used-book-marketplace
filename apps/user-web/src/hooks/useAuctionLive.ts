import { useEffect, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { auctionSchema, auctionSummarySchema, getAuction, type AuctionSummary } from '../services/auctions'
import { LIVE_SOCKET_OPTIONS, PRIVATE_REFRESH_MS, liveImpact, newerSnapshot, privateRefresh, type LiveImpact } from '../lib/auction-live'

// Live auction channel (ADR 0031). Pushes carry the same public data as the REST
// reads and are written straight into the query cache; REST stays the source of
// truth, so every (re)connect resyncs from the watch acknowledgement. Nothing
// here places a bid or changes business state: commands stay on REST.
const socketUrl = (import.meta.env['VITE_API_BASE_URL'] || 'http://localhost:3000/api/v1').replace(/\/api\/v1\/?$/, '')

let shared: Socket | null = null
let users = 0
function acquire() {
  shared ??= io(`${socketUrl}/auctions`, LIVE_SOCKET_OPTIONS)
  users++
  return shared
}
function release() {
  if (--users > 0 || !shared) return
  shared.disconnect()
  shared = null
}

type AuctionData = ReturnType<typeof auctionSchema.parse>
const auctionKey = (id: string) => ['auction', id] as const

/** Writes a snapshot unless the cache already holds a newer one. */
export function writeAuctionSnapshot(queryClient: QueryClient, id: string, next: AuctionData) {
  let previous: AuctionData | undefined
  queryClient.setQueryData<AuctionData>(auctionKey(id), (prev) => {
    previous = prev
    return newerSnapshot(prev, next)
  })
  return previous
}

/** REST read for ['auction', id] that cannot step back behind a newer push. */
export async function readAuctionNewest(queryClient: QueryClient, id: string) {
  const next = await getAuction(id)
  return newerSnapshot(queryClient.getQueryData<AuctionData>(auctionKey(id)), next)
}

/** Whether this viewer's private reads can move with someone else's bid. */
function viewerOf(queryClient: QueryClient, id: string) {
  const own = queryClient
    .getQueriesData({ queryKey: ['auction-participation', id] })
    .filter(([key]) => key[2] !== undefined)
  if (!own.length) return 'guest' as const
  if (own.some(([, data]) => data)) return 'participant' as const
  if (own.every(([, data]) => data === null)) return 'spectator' as const
  return 'unknown' as const
}

/** Keeps ['auction', id] live. Returns true while pushes are flowing. */
export function useAuctionLive(id: string | undefined, onChange?: () => void) {
  const queryClient = useQueryClient()
  // True from a successful watch ack until disconnect or cleanup.
  const [watching, setWatching] = useState(false)

  useEffect(() => {
    if (!id) return
    const s = acquire()
    let disposed = false
    // A burst of bids folds into one private refresh, keeping its widest need.
    let pending: LiveImpact | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      timer = undefined
      const impact = pending
      pending = null
      if (!impact || disposed) return
      const need = privateRefresh(impact, viewerOf(queryClient, id))
      // ADR 0075: an outbid participant's hold is released to the wallet.
      if (need.wallet) void queryClient.invalidateQueries({ queryKey: ['wallet-summary'] })
      if (need.notifications) void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      // The point order exists only once the auction closed.
      if (need.pointOrder) void queryClient.invalidateQueries({ queryKey: ['point-order'] })
    }
    const schedule = (impact: LiveImpact) => {
      // Read own standing as soon as the confirmed price changes.
      if (privateRefresh(impact, viewerOf(queryClient, id)).participation)
        void queryClient.invalidateQueries({ queryKey: ['auction-participation', id] })
      pending = pending
        ? { lifecycle: pending.lifecycle || impact.lifecycle, standing: pending.standing || impact.standing }
        : impact
      if (impact.lifecycle) {
        clearTimeout(timer)
        flush() // a close or pause should reach the bidder at once
      } else timer ??= setTimeout(flush, PRIVATE_REFRESH_MS)
    }
    /** null: not a snapshot of this auction; impact null: older than the cache. */
    const apply = (raw: unknown): { first: boolean; impact: LiveImpact | null } | null => {
      const parsed = auctionSchema.safeParse(raw)
      if (!parsed.success || parsed.data.auction.id !== id) return null
      const before = writeAuctionSnapshot(queryClient, id, parsed.data)
      if (before && newerSnapshot(before, parsed.data) !== parsed.data) return { first: false, impact: null }
      return { first: !before, impact: liveImpact(before, parsed.data) }
    }
    const moved = (impact: LiveImpact | null): impact is LiveImpact => !!impact && (impact.lifecycle || impact.standing)
    const watch = () => {
      // A timed REST response refreshes the shared clock on reconnect.
      void queryClient.invalidateQueries({ queryKey: ['auction', id], exact: true }, { cancelRefetch: false })
      s.emit('auction:watch', id, (reply: { ok?: boolean; auction?: unknown }) => {
        if (disposed) return
        const result = reply?.ok ? apply(reply.auction) : null
        setWatching(result !== null)
        // After a reconnect, what moved while we were away reaches private
        // reads too; the first load reads them itself.
        if (result && !result.first && moved(result.impact)) schedule(result.impact)
      })
    }
    const update = (raw: unknown) => {
      const result = apply(raw)
      if (!result?.impact) return
      if (moved(result.impact)) schedule(result.impact)
      onChange?.()
    }
    const lost = () => setWatching(false)
    s.on('connect', watch)
    s.on('disconnect', lost)
    s.on('connect_error', lost)
    s.on('auction:update', update)
    if (s.connected) watch()
    return () => {
      disposed = true
      clearTimeout(timer)
      s.off('connect', watch)
      s.off('disconnect', lost)
      s.off('connect_error', lost)
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
    let disposed = false
    const watch = () => {
      s.emit('auctions:watch', (reply: { ok?: boolean }) => {
        if (disposed) return
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
    s.on('connect_error', lost)
    s.on('auction:summary', summary)
    if (s.connected) watch()
    return () => {
      disposed = true
      s.off('connect', watch)
      s.off('disconnect', lost)
      s.off('connect_error', lost)
      s.off('auction:summary', summary)
      if (s.connected) s.emit('auctions:unwatch')
      setWatching(false)
      release()
    }
  }, [queryClient])

  return watching
}
