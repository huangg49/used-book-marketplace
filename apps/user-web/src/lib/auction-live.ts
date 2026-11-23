// Pure rules for the live auction channel (ADR 0031). Kept free of React and
// Socket.IO so the ordering and fan-out decisions are unit tested.

type Stamped = { serverTime: string }
type LiveAuction = Stamped & {
  auction: { state: string; phase?: string | null; currentPrice?: number | null; endAt: string }
  leaderAlias?: number | null
}

/**
 * Pushes, watch acks and REST reads all write the same cache entry and can
 * arrive out of order. Every public snapshot carries the database clock it
 * was read at, so an older read never replaces a newer one (a price never
 * steps back). Equal stamps keep the incoming copy: a Dutch drop or a repeat
 * read at the same instant carries nothing older.
 */
export function newerSnapshot<T extends Stamped>(prev: T | undefined, next: T): T {
  if (!prev) return next
  const before = Date.parse(prev.serverTime)
  const after = Date.parse(next.serverTime)
  if (Number.isNaN(before) || Number.isNaN(after)) return next
  return after >= before ? next : prev
}

/** What one live update means beyond the public snapshot itself. */
export type LiveImpact = {
  /** State or phase moved (opened, ended, paused, sold...). */
  lifecycle: boolean
  /** Price, leader or end time moved. */
  standing: boolean
}

export function liveImpact(prev: LiveAuction | undefined, next: LiveAuction): LiveImpact {
  if (!prev) return { lifecycle: true, standing: true }
  const a = prev.auction
  const b = next.auction
  return {
    lifecycle: a.state !== b.state || (a.phase ?? null) !== (b.phase ?? null),
    standing:
      (a.currentPrice ?? null) !== (b.currentPrice ?? null) ||
      (prev.leaderAlias ?? null) !== (next.leaderAlias ?? null) ||
      a.endAt !== b.endAt,
  }
}

/**
 * Which private reads to refresh after an update. A member who has not taken
 * part (participation known to be null) or a guest is unaffected by someone
 * else's bid, so only a lifecycle change reaches them; a participant's
 * standing, wallet hold (ADR 0075) and inbox may move with any price change.
 * The point order exists only after the close, so only a lifecycle change
 * reads it again.
 */
export function privateRefresh(
  impact: LiveImpact,
  viewer: 'guest' | 'spectator' | 'participant' | 'unknown',
) {
  if (viewer === 'guest') return { participation: false, wallet: false, notifications: false, pointOrder: false }
  const involved = viewer === 'participant' || viewer === 'unknown'
  const own = impact.lifecycle || (involved && impact.standing)
  return { participation: own, wallet: own, notifications: own, pointOrder: impact.lifecycle }
}

/** Socket.IO client options shared by the auction channel. */
export const LIVE_SOCKET_OPTIONS = {
  // WebSocket first needs no sticky session across API instances; when the
  // upgrade is blocked (proxy, network) fall back to long-polling instead of
  // giving up, which Socket.IO does by default (tryAllTransports: false).
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  tryAllTransports: true,
  timeout: 10_000,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 10_000,
}

/** Trailing delay that folds a burst of bids into one private refresh. */
export const PRIVATE_REFRESH_MS = 400
