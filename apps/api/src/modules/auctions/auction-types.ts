// ADR 0076: auction formats besides the English proxy auction (ADR 0030).
// Pure rules, no I/O; the bidding service applies them under the auction lock.
//
// - Dutch: the price starts at dutchTopPrice and falls one step every
//   dutchIntervalSeconds down to startPrice (the floor). The first member to
//   accept wins at the price of that moment; the auction ends at once.
// - SealedFirst / SealedSecond: one hidden bid per member, which may only be
//   raised. The highest bid wins (ties: who reached it first). The winner pays
//   their own bid (first price) or the second-highest bid, or the start price
//   with one bidder (second price). Nothing about other bids is shown while
//   the auction runs.
import type { AuctionDoc } from '../../database/mongo/documents.js';
import { rank, type EngineBidder } from './auction-engine.js';

export type AuctionType = 'English' | 'Dutch' | 'SealedFirst' | 'SealedSecond';
export const AUCTION_TYPES: AuctionType[] = [
  'English',
  'Dutch',
  'SealedFirst',
  'SealedSecond',
];
export const DUTCH_MIN_INTERVAL_S = 10;
export const DUTCH_MAX_INTERVAL_S = 3600;

export const isSealed = (t: AuctionType | undefined | null) =>
  t === 'SealedFirst' || t === 'SealedSecond';

// The Dutch price at `now`: top − ⌊elapsed / interval⌋ × step, never below the
// floor. Before the start it is the top price.
export function dutchPrice(
  a: Pick<
    AuctionDoc,
    'startAt' | 'startPrice' | 'step' | 'dutchTopPrice' | 'dutchIntervalSeconds'
  >,
  now: Date,
) {
  const top = a.dutchTopPrice!;
  const elapsed = Math.max(0, now.getTime() - a.startAt.getTime());
  const drops = Math.floor(elapsed / (a.dutchIntervalSeconds! * 1000));
  return Math.max(a.startPrice, top - drops * a.step);
}

// When the Dutch price next drops, or null once it sits on the floor.
export function dutchNextDropAt(
  a: Pick<
    AuctionDoc,
    'startAt' | 'startPrice' | 'step' | 'dutchTopPrice' | 'dutchIntervalSeconds'
  >,
  now: Date,
) {
  if (dutchPrice(a, now) <= a.startPrice) return null;
  const interval = a.dutchIntervalSeconds! * 1000;
  const elapsed = Math.max(0, now.getTime() - a.startAt.getTime());
  return new Date(
    a.startAt.getTime() + (Math.floor(elapsed / interval) + 1) * interval,
  );
}

export type SealedRejection = 'BelowStart' | 'OffGrid' | 'NotIncreasing';
export class SealedError extends Error {
  constructor(readonly reason: SealedRejection) {
    super(reason);
  }
}

/**
 * Applies one sealed bid. `currentPrice` is what the leader would pay now:
 * their own bid (first price) or max(start, second bid) (second price), so the
 * close forms the Order at the stored price, as for English auctions.
 */
export function applySealed(
  a: Pick<
    AuctionDoc,
    'auctionType' | 'startPrice' | 'step' | 'nextSequence'
  >,
  bidders: EngineBidder[],
  bidderId: string,
  amount: number,
) {
  if (!Number.isSafeInteger(amount) || amount < a.startPrice)
    throw new SealedError('BelowStart');
  if ((amount - a.startPrice) % a.step !== 0) throw new SealedError('OffGrid');
  const own = bidders.find((b) => b.bidderId === bidderId);
  if (own && amount <= own.level) throw new SealedError('NotIncreasing');
  const bidder: EngineBidder = {
    bidderId,
    mode: 'Manual',
    level: amount,
    levelSequence: a.nextSequence,
  };
  const [top, second] = rank([
    ...bidders.filter((b) => b.bidderId !== bidderId),
    bidder,
  ]);
  const currentPrice =
    a.auctionType === 'SealedSecond'
      ? Math.max(a.startPrice, second?.level ?? a.startPrice)
      : top.level;
  return {
    bidder,
    leaderId: top.bidderId,
    currentPrice,
    nextSequence: a.nextSequence + 1,
  };
}
