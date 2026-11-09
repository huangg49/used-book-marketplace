import { describe, expect, it } from 'vitest';
import type { AuctionDoc } from '../../database/mongo/documents.js';
import {
  holdFields,
  holdUntilOf,
  latestStartAt,
  pauseBudgetLeft,
  resumeFields,
} from './auction-schedule.js';
import { dutchPrice } from './auction-types.js';

// ADR 0084: one pause model - hold budget, time given back on resume.
const H = 3_600_000;
const MIN = 60_000;
const t0 = new Date('2026-11-09T03:00:00.000Z');
const at = (ms: number) => new Date(t0.getTime() + ms);
const held = (over: Partial<AuctionDoc> = {}) =>
  ({
    state: 'OnHold',
    publishedAt: at(-30 * H),
    opensAt: at(-6 * H),
    startAt: at(-2 * H),
    biddingOpenedAt: at(-2 * H),
    endAt: at(4 * H),
    plannedEndAt: at(4 * H),
    buyNowAt: null,
    heldAt: t0,
    holdUntil: at(48 * H),
    holdReason: 'Eligibility',
    pausedMs: 0,
    ...over,
  }) as AuctionDoc;
const shifted = (before: Date | null, after: Date | null | undefined) =>
  after!.getTime() - before!.getTime();

describe('holds', () => {
  it('last 48 h, or what is left of the 72 h budget', () => {
    expect(holdUntilOf({ pausedMs: 0 }, t0)).toEqual(at(48 * H));
    expect(holdUntilOf({ pausedMs: 30 * H }, t0)).toEqual(at(42 * H));
    expect(holdUntilOf({ pausedMs: 72 * H }, t0)).toEqual(t0);
    expect(pauseBudgetLeft({ pausedMs: 70 * H })).toBe(2 * H);
    expect(holdFields({ pausedMs: 0 }, t0, 'Review')).toEqual({
      state: 'OnHold',
      heldAt: t0,
      holdReason: 'Review',
      holdUntil: at(48 * H),
    });
  });
});

describe('resumeFields', () => {
  it('moves every stored time by the paused time', () => {
    const a = held();
    const r = resumeFields(a, at(3 * H));
    expect(r).toMatchObject({
      state: 'Active',
      resumedAt: at(3 * H),
      holdReason: null,
      holdUntil: null,
      pausedMs: 3 * H,
    });
    for (const k of ['opensAt', 'startAt', 'biddingOpenedAt', 'endAt', 'plannedEndAt'] as const)
      expect(shifted(a[k], r[k] as Date)).toBe(3 * H);
    expect(r.buyNowAt).toBeNull();
    // The 4 h that were left come back.
    expect(r.endAt!.getTime() - at(3 * H).getTime()).toBe(4 * H);
  });

  it('gives at least 10 minutes of bidding, Buy Now window included', () => {
    const a = held({ buyNowAt: at(-30_000), endAt: at(30_000), plannedEndAt: at(4 * H) });
    const r = resumeFields(a, at(H));
    expect(r.endAt!.getTime() - at(H).getTime()).toBe(10 * MIN);
    expect(r.endAt!.getTime() - r.buyNowAt!.getTime()).toBe(60_000);
    expect(r.pausedMs).toBe(H + 10 * MIN - 30_000);
  });

  it('never goes beyond the budget', () => {
    const a = held({ endAt: at(MIN), pausedMs: 72 * H - 30 * MIN, holdUntil: at(30 * MIN) });
    const r = resumeFields(a, at(25 * MIN)); // 25 min paused + 9 min top-up > 30 min left
    expect(r.pausedMs).toBe(72 * H);
    expect(shifted(a.endAt, r.endAt)).toBe(30 * MIN);
  });

  it('gives nothing back to an auction held at or after its end', () => {
    const a = held({ endAt: t0, plannedEndAt: t0 });
    const r = resumeFields(a, at(H));
    expect(r).toEqual({ state: 'Active', resumedAt: at(H), holdReason: null, holdUntil: null });
  });

  it('moves a waiting auction’s open time and deadline', () => {
    const a = held({
      opensAt: at(2 * H),
      startAt: at(26 * H),
      endAt: at(27 * H),
      plannedEndAt: at(27 * H),
      biddingOpenedAt: null,
    });
    const r = resumeFields(a, at(5 * H));
    expect(shifted(a.opensAt, r.opensAt)).toBe(5 * H);
    expect(shifted(a.startAt, r.startAt)).toBe(5 * H);
    expect(r.biddingOpenedAt).toBeNull();
  });

  it('keeps the Dutch price where it paused', () => {
    const a = held({
      auctionType: 'Dutch',
      dutchTopPrice: 300_000,
      startPrice: 100_000,
      step: 10_000,
      dutchIntervalSeconds: 600,
      minBidders: 4,
    });
    const atHold = dutchPrice(a, t0);
    const r = resumeFields(a, at(2 * H));
    expect(dutchPrice({ ...a, ...r } as AuctionDoc, at(2 * H))).toBe(atHold);
  });

  it('grows the 30-day open ceiling by the time given back', () => {
    const a = held({ pausedMs: 5 * H });
    expect(latestStartAt(a).getTime()).toBe(a.publishedAt.getTime() + 30 * 24 * H + 5 * H);
  });
});
