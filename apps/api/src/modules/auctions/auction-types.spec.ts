import { describe, expect, it } from 'vitest';
import type { AuctionDoc } from '../../database/mongo/documents.js';
import {
  SealedError,
  applySealed,
  dutchNextDropAt,
  dutchPrice,
} from './auction-types.js';

const start = new Date('2026-11-08T03:00:00.000Z');
const at = (s: number) => new Date(start.getTime() + s * 1000);
const dutch = {
  startAt: start,
  startPrice: 100_000, // floor
  step: 10_000,
  dutchTopPrice: 150_000,
  dutchIntervalSeconds: 60,
} as AuctionDoc;

describe('ADR 0076 Dutch price', () => {
  it('starts at the top and falls one step per interval', () => {
    expect(dutchPrice(dutch, at(-30))).toBe(150_000);
    expect(dutchPrice(dutch, at(0))).toBe(150_000);
    expect(dutchPrice(dutch, at(59))).toBe(150_000);
    expect(dutchPrice(dutch, at(60))).toBe(140_000);
    expect(dutchPrice(dutch, at(185))).toBe(120_000);
  });
  it('never goes below the floor', () => {
    expect(dutchPrice(dutch, at(300))).toBe(100_000);
    expect(dutchPrice(dutch, at(100_000))).toBe(100_000);
  });
  it('reports the next drop, then none on the floor', () => {
    expect(dutchNextDropAt(dutch, at(10))).toEqual(at(60));
    expect(dutchNextDropAt(dutch, at(60))).toEqual(at(120));
    expect(dutchNextDropAt(dutch, at(300))).toBeNull();
  });
});

describe('ADR 0076 sealed bids', () => {
  const sealed = (auctionType: 'SealedFirst' | 'SealedSecond') =>
    ({ auctionType, startPrice: 100_000, step: 10_000, nextSequence: 1 }) as AuctionDoc;
  const bid = (id: string, level: number, seq: number) => ({
    bidderId: id,
    mode: 'Manual' as const,
    level,
    levelSequence: seq,
  });

  it('first price: the top bidder pays their own bid', () => {
    const r = applySealed(sealed('SealedFirst'), [bid('a', 150_000, 1)], 'b', 200_000);
    expect(r).toMatchObject({ leaderId: 'b', currentPrice: 200_000 });
  });
  it('second price: the winner pays the second bid, or the start alone', () => {
    const alone = applySealed(sealed('SealedSecond'), [], 'a', 200_000);
    expect(alone).toMatchObject({ leaderId: 'a', currentPrice: 100_000 });
    const two = applySealed(sealed('SealedSecond'), [bid('a', 200_000, 1)], 'b', 150_000);
    expect(two).toMatchObject({ leaderId: 'a', currentPrice: 150_000 });
  });
  it('a tie goes to who bid first', () => {
    const r = applySealed(
      { ...sealed('SealedFirst'), nextSequence: 2 } as AuctionDoc,
      [bid('a', 150_000, 1)],
      'b',
      150_000,
    );
    expect(r.leaderId).toBe('a');
  });
  it('refuses below start, off grid and non-increasing bids', () => {
    const reason = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as SealedError).reason;
      }
    };
    const s = sealed('SealedFirst');
    expect(reason(() => applySealed(s, [], 'a', 90_000))).toBe('BelowStart');
    expect(reason(() => applySealed(s, [], 'a', 105_000))).toBe('OffGrid');
    expect(reason(() => applySealed(s, [bid('a', 150_000, 1)], 'a', 150_000))).toBe('NotIncreasing');
  });
});
