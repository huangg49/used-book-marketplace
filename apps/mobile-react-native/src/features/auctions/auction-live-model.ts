// Pure rules for the live auction channel (ADR 0031), shared in meaning with
// apps/user-web/src/lib/auction-live.ts. Free of React Native and Socket.IO so
// the ordering and fan-out decisions are unit tested.
import type { PublicAuctionList, PublicAuctionSummary } from "./contracts";

type Stamped = { serverTime: string };
type LiveAuction = Stamped & {
  auction: { state: string; phase?: string | null; currentPrice?: number | null; endAt: string };
  leaderAlias?: number | null;
};

/**
 * Pushes, watch acks and REST reads all write the same cache entry and can
 * arrive out of order. Every public snapshot carries the database clock it was
 * read at, so an older read never replaces a newer one (a price never steps
 * back). Equal stamps keep the incoming copy (a Dutch drop read at the same
 * instant carries nothing older).
 */
export function newerSnapshot<T extends Stamped>(prev: T | undefined, next: T): T {
  if (!prev) return next;
  const before = Date.parse(prev.serverTime);
  const after = Date.parse(next.serverTime);
  if (Number.isNaN(before) || Number.isNaN(after)) return next;
  return after >= before ? next : prev;
}

export type LiveImpact = {
  /** State or phase moved (opened, ended, paused, sold...). */
  lifecycle: boolean;
  /** Price, leader or end time moved. */
  standing: boolean;
};

export function liveImpact(prev: LiveAuction | undefined, next: LiveAuction): LiveImpact {
  if (!prev) return { lifecycle: true, standing: true };
  const a = prev.auction;
  const b = next.auction;
  return {
    lifecycle: a.state !== b.state || (a.phase ?? null) !== (b.phase ?? null),
    standing:
      (a.currentPrice ?? null) !== (b.currentPrice ?? null) ||
      (prev.leaderAlias ?? null) !== (next.leaderAlias ?? null) ||
      a.endAt !== b.endAt,
  };
}

export type LiveViewer = "guest" | "spectator" | "participant" | "unknown";

/**
 * Which private reads to refresh after an update. A guest, or a member known
 * not to take part, is unaffected by someone else's bid, so only a lifecycle
 * change reaches them; a participant's standing, wallet hold (ADR 0075) and
 * inbox may move with any price change. The point order exists only after the
 * close, so only a lifecycle change reads it again.
 */
export function privateRefresh(impact: LiveImpact, viewer: LiveViewer) {
  if (viewer === "guest")
    return { participation: false, wallet: false, notifications: false, pointOrder: false };
  const involved = viewer === "participant" || viewer === "unknown";
  const own = impact.lifecycle || (involved && impact.standing);
  return { participation: own, wallet: own, notifications: own, pointOrder: impact.lifecycle };
}

/**
 * Applies one `auction:summary` push to the open list. A known card is
 * replaced in place (server order kept), a card that left Active is dropped,
 * and an unseen one asks for a fresh list so the server keeps order and filter.
 */
export function mergeSummary(
  list: PublicAuctionList | undefined,
  next: PublicAuctionSummary,
): { list: PublicAuctionList | undefined; refetch: boolean } {
  if (!list) return { list, refetch: false };
  const at = list.items.findIndex((item) => item.id === next.id);
  if (next.state !== "Active")
    return at < 0
      ? { list, refetch: false }
      : { list: { ...list, items: list.items.filter((item) => item.id !== next.id) }, refetch: false };
  if (at < 0) return { list, refetch: true };
  const items = list.items.slice();
  items[at] = next;
  return { list: { ...list, items }, refetch: false };
}

/** An auction past its end on the server clock that the worker has not closed yet. */
export function isClosing(
  auction: Pick<PublicAuctionSummary, "state" | "phase" | "endAt">,
  now: number,
) {
  return auction.state === "Active" && auction.phase !== "Ended" && now >= Date.parse(auction.endAt);
}

/** Socket.IO client options for the auction channel. */
export const LIVE_SOCKET_OPTIONS = {
  // WebSocket first needs no sticky session across API instances; when the
  // upgrade is blocked (proxy, carrier network) fall back to long-polling
  // instead of giving up, which Socket.IO does by default.
  transports: ["websocket", "polling"] as ("websocket" | "polling")[],
  tryAllTransports: true,
  timeout: 10_000,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 10_000,
};

/** Trailing delay that folds a burst of bids into one private refresh. */
export const PRIVATE_REFRESH_MS = 400;
/** REST polling of an open auction while pushes flow, and while they do not. */
export const LIVE_BACKSTOP_MS = 30_000;
export const FALLBACK_POLL_MS = 5_000;
/** Re-read cadence while the worker closes an auction past its end. */
export const CLOSING_POLL_MS = 2_000;
