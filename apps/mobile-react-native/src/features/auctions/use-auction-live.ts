import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { apiBaseUrl } from "../../core/api/api-base-url";
import type { SessionClient } from "../../core/api/session-client";
import { NOTIFICATIONS_QUERY_KEY } from "../notifications/notifications-model";
import {
  LIVE_SOCKET_OPTIONS,
  PRIVATE_REFRESH_MS,
  liveImpact,
  mergeSummary,
  newerSnapshot,
  privateRefresh,
  type LiveImpact,
  type LiveViewer,
} from "./auction-live-model";
import { AUCTIONS_QUERY_KEY, UPCOMING_AUCTIONS_QUERY_KEY, auctionKey } from "./auctions-model";
import {
  publicAuction,
  publicAuctionSummary,
  type PublicAuction,
  type PublicAuctionList,
} from "./contracts";

// Live auction channel (ADR 0031) for React Native. Public and read-only: no
// token travels, bids stay on the REST command protocol, and REST stays the
// source of truth (every reconnect resyncs from the watch acknowledgement).
// The caller passes `enabled` = screen focused and app active, so the socket
// closes in the background and reopens with a fresh snapshot on return.

function socketOrigin() {
  try {
    return apiBaseUrl(Platform.OS, {
      shared: process.env.EXPO_PUBLIC_API_BASE_URL,
      android: process.env.EXPO_PUBLIC_API_BASE_URL_ANDROID,
      web: process.env.EXPO_PUBLIC_API_BASE_URL_WEB,
      ios: process.env.EXPO_PUBLIC_API_BASE_URL_IOS,
    }).replace(/\/api\/v1\/?$/, "");
  } catch {
    return null; // no API configured: stay on REST polling
  }
}

let shared: Socket | null = null;
let users = 0;
function acquire() {
  const origin = socketOrigin();
  if (!origin) return null;
  shared ??= io(`${origin}/auctions`, LIVE_SOCKET_OPTIONS);
  users++;
  return shared;
}
function release() {
  if (--users > 0 || !shared) return;
  shared.disconnect();
  shared = null;
}

/** Writes a snapshot unless the cache already holds a newer one. */
function writeSnapshot(queryClient: QueryClient, id: string, next: PublicAuction) {
  let previous: PublicAuction | undefined;
  queryClient.setQueryData<PublicAuction>(auctionKey(id), (prev) => {
    previous = prev;
    return newerSnapshot(prev, next);
  });
  return previous;
}

/** REST read for ['auction', id] that cannot step back behind a newer push. */
export async function readAuctionNewest(client: SessionClient, queryClient: QueryClient, id: string) {
  const next = await client.publicRequest(`/auctions/${id}`, publicAuction);
  return newerSnapshot(queryClient.getQueryData<PublicAuction>(auctionKey(id)), next);
}

function viewerOf(queryClient: QueryClient, id: string): LiveViewer {
  const own = queryClient
    .getQueriesData({ queryKey: ["auction-participation", id] })
    .filter(([key]) => !!key[2]);
  if (!own.length) return "guest";
  if (own.some(([, data]) => data)) return "participant";
  if (own.every(([, data]) => data === null)) return "spectator";
  return "unknown";
}

/** Keeps ['auction', id] live while enabled. Returns true while pushes flow. */
export function useAuctionLive(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!enabled || !id) return;
    const s = acquire();
    if (!s) return;
    let disposed = false;
    let pending: LiveImpact | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const impact = pending;
      pending = null;
      if (!impact || disposed) return;
      const need = privateRefresh(impact, viewerOf(queryClient, id));
      // Own standing (leading/outbid) is private: read it again over REST.
      if (need.participation)
        void queryClient.invalidateQueries({ queryKey: ["auction-participation", id] });
      // ADR 0075: an outbid participant's hold is released to the wallet.
      if (need.wallet) void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      if (need.notifications) void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      if (need.pointOrder) void queryClient.invalidateQueries({ queryKey: ["point-order"] });
    };
    const schedule = (impact: LiveImpact) => {
      pending = pending
        ? { lifecycle: pending.lifecycle || impact.lifecycle, standing: pending.standing || impact.standing }
        : impact;
      if (impact.lifecycle) {
        clearTimeout(timer);
        flush(); // a close or pause should reach the bidder at once
      } else timer ??= setTimeout(flush, PRIVATE_REFRESH_MS);
    };
    /** null: not this auction; impact null: older than the cache. */
    const apply = (raw: unknown): { first: boolean; impact: LiveImpact | null } | null => {
      const parsed = publicAuction.safeParse(raw);
      if (!parsed.success || parsed.data.auction.id !== id) return null;
      const before = writeSnapshot(queryClient, id, parsed.data);
      if (before && newerSnapshot(before, parsed.data) !== parsed.data) return { first: false, impact: null };
      return { first: !before, impact: liveImpact(before, parsed.data) };
    };
    const moved = (impact: LiveImpact | null): impact is LiveImpact =>
      !!impact && (impact.lifecycle || impact.standing);
    const watch = () => {
      s.emit("auction:watch", id, (reply: { ok?: boolean; auction?: unknown }) => {
        if (disposed) return;
        const result = reply?.ok ? apply(reply.auction) : null;
        setWatching(result !== null);
        // What moved while away (background, reconnect) reaches private reads.
        if (result && !result.first && moved(result.impact)) schedule(result.impact);
      });
    };
    const update = (raw: unknown) => {
      const result = apply(raw);
      if (moved(result?.impact ?? null)) schedule(result!.impact!);
    };
    const lost = () => setWatching(false);
    s.on("connect", watch);
    s.on("disconnect", lost);
    s.on("connect_error", lost);
    s.on("auction:update", update);
    if (s.connected) watch();
    return () => {
      disposed = true;
      clearTimeout(timer);
      s.off("connect", watch);
      s.off("disconnect", lost);
      s.off("connect_error", lost);
      s.off("auction:update", update);
      if (s.connected) s.emit("auction:unwatch", id);
      setWatching(false);
      release();
    };
  }, [id, enabled, queryClient]);

  return watching;
}

/** Keeps the open auction list live while enabled. */
export function useAuctionListLive(enabled: boolean) {
  const queryClient = useQueryClient();
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const s = acquire();
    if (!s) return;
    let disposed = false;
    const watch = () => {
      s.emit("auctions:watch", (reply: { ok?: boolean }) => {
        if (disposed) return;
        setWatching(!!reply?.ok);
        // Anything missed while away comes back with a fresh list.
        void queryClient.invalidateQueries({ queryKey: AUCTIONS_QUERY_KEY });
      });
    };
    const summary = (raw: unknown) => {
      const parsed = publicAuctionSummary.safeParse(raw);
      if (!parsed.success) return;
      let refetch = false;
      queryClient.setQueryData<PublicAuctionList>(AUCTIONS_QUERY_KEY, (list) => {
        const merged = mergeSummary(list, parsed.data);
        refetch = merged.refetch;
        return merged.list;
      });
      if (refetch) {
        void queryClient.invalidateQueries({ queryKey: AUCTIONS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: UPCOMING_AUCTIONS_QUERY_KEY });
      }
    };
    const lost = () => setWatching(false);
    s.on("connect", watch);
    s.on("disconnect", lost);
    s.on("connect_error", lost);
    s.on("auction:summary", summary);
    if (s.connected) watch();
    return () => {
      disposed = true;
      s.off("connect", watch);
      s.off("disconnect", lost);
      s.off("connect_error", lost);
      s.off("auction:summary", summary);
      if (s.connected) s.emit("auctions:unwatch");
      setWatching(false);
      release();
    };
  }, [enabled, queryClient]);

  return watching;
}
