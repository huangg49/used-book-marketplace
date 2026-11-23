import { describe, expect, it } from "vitest";
import {
  isClosing,
  liveImpact,
  mergeSummary,
  newerSnapshot,
  privateRefresh,
} from "./auction-live-model";
import type { PublicAuctionList, PublicAuctionSummary } from "./contracts";

const snap = (
  serverTime: string,
  over: Partial<{ state: string; phase: string; currentPrice: number | null; endAt: string; leaderAlias: number | null }> = {},
) => ({
  serverTime,
  leaderAlias: over.leaderAlias ?? 1,
  auction: {
    state: over.state ?? "Active",
    phase: over.phase ?? "Live",
    currentPrice: over.currentPrice === undefined ? 100_000 : over.currentPrice,
    endAt: over.endAt ?? "2026-11-23T10:00:00.000Z",
  },
});

const card = (id: string, over: Partial<PublicAuctionSummary> = {}) =>
  ({
    id,
    listingId: "00000000-0000-4000-8000-000000000000",
    title: id,
    state: "Active",
    startPrice: 10_000,
    step: 1_000,
    buyNowPrice: null,
    currentPrice: 10_000,
    minimumBid: 11_000,
    bidderCount: 1,
    startAt: "2026-11-23T08:00:00.000Z",
    endAt: "2026-11-23T10:00:00.000Z",
    pointName: "Q1",
    ...over,
  }) as PublicAuctionSummary;

describe("newerSnapshot", () => {
  it("never lets an older REST read replace a newer push", () => {
    const pushed = snap("2026-11-23T09:00:02.000Z", { currentPrice: 120_000 });
    const late = snap("2026-11-23T09:00:01.000Z", { currentPrice: 110_000 });
    expect(newerSnapshot(pushed, late)).toBe(pushed);
    expect(newerSnapshot(late, pushed)).toBe(pushed);
  });

  it("keeps the incoming copy on an equal stamp or a first read", () => {
    const prev = snap("2026-11-23T09:00:01.000Z");
    const same = snap("2026-11-23T09:00:01.000Z", { currentPrice: 90_000 });
    expect(newerSnapshot(prev, same)).toBe(same);
    expect(newerSnapshot(undefined, prev)).toBe(prev);
  });
});

describe("liveImpact and privateRefresh", () => {
  const base = snap("2026-11-23T09:00:00.000Z");
  const price = liveImpact(base, snap("2026-11-23T09:00:01.000Z", { currentPrice: 110_000 }));
  const close = liveImpact(base, snap("2026-11-23T09:00:01.000Z", { state: "AwaitingWinnerPayment", phase: "Ended" }));

  it("separates a price move from a lifecycle move", () => {
    expect(price).toEqual({ lifecycle: false, standing: true });
    expect(close).toEqual({ lifecycle: true, standing: false });
    expect(liveImpact(base, snap("2026-11-23T09:00:05.000Z"))).toEqual({ lifecycle: false, standing: false });
  });

  it("refreshes private reads only for those a bid can affect", () => {
    expect(Object.values(privateRefresh(close, "guest")).some(Boolean)).toBe(false);
    expect(Object.values(privateRefresh(price, "spectator")).some(Boolean)).toBe(false);
    expect(privateRefresh(price, "participant")).toEqual({ participation: true, wallet: true, notifications: true, pointOrder: false });
    expect(privateRefresh(price, "unknown").participation).toBe(true);
    expect(privateRefresh(close, "spectator").pointOrder).toBe(true);
  });
});

describe("mergeSummary", () => {
  const list: PublicAuctionList = { items: [card("a"), card("b"), card("c")], serverTime: "2026-11-23T09:00:00.000Z" };

  it("replaces a known card in place, keeping server order", () => {
    const { list: next, refetch } = mergeSummary(list, card("b", { currentPrice: 50_000 }));
    expect(refetch).toBe(false);
    expect(next!.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(next!.items[1]!.currentPrice).toBe(50_000);
  });

  it("drops a card that left Active and ignores an unknown closed one", () => {
    expect(mergeSummary(list, card("a", { state: "Sold" })).list!.items.map((i) => i.id)).toEqual(["b", "c"]);
    expect(mergeSummary(list, card("z", { state: "Sold" }))).toEqual({ list, refetch: false });
  });

  it("asks for a fresh list for a newly opened auction", () => {
    expect(mergeSummary(list, card("new"))).toEqual({ list, refetch: true });
    expect(mergeSummary(undefined, card("new"))).toEqual({ list: undefined, refetch: false });
  });
});

describe("isClosing", () => {
  const endAt = "2026-11-23T10:00:00.000Z";
  it("is true only past the end while the worker has not closed it", () => {
    expect(isClosing({ state: "Active", phase: "Live", endAt }, Date.parse(endAt) - 1)).toBe(false);
    expect(isClosing({ state: "Active", phase: "Live", endAt }, Date.parse(endAt))).toBe(true);
    expect(isClosing({ state: "AwaitingWinnerPayment", phase: "Ended", endAt }, Date.parse(endAt) + 5)).toBe(false);
  });
});
