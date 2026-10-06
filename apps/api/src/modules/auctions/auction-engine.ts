// Pure proxy-bidding rules (LOCAL-AUCTION-01 FR-AU03–05, ADR 0030). No I/O:
// the service loads the auction and bidder projections under locks, applies
// one action here and persists the result in the same transaction.
//
// Each bidder has one commitment level: a manual bid's amount or an Auto
// ceiling. Ranking is level desc, then the server sequence at which the bidder
// reached that level (earlier wins). With top level H, second level L and step
// d the competitive price is start for one bidder, otherwise min(H, L + d); the
// new price is max(current, competitive, new manual amount), never above H.
// Prices stay on the start + n × step grid because every input is on it.

import {
  AUCTION_MAX_PRICE,
  AUCTION_MIN_PRICE,
} from '../../database/mongo/migrations/0008-auctions.js';

export { AUCTION_MAX_PRICE, AUCTION_MIN_PRICE };

export interface EngineAuction {
  startPrice: number;
  step: number;
  currentPrice: number | null;
  leaderId: string | null;
  nextSequence: number;
}
export interface EngineBidder {
  bidderId: string;
  mode: 'Manual' | 'Auto';
  level: number;
  levelSequence: number;
}
export type EngineAction =
  | { kind: 'Manual'; bidderId: string; amount: number }
  | { kind: 'AutoSet'; bidderId: string; max: number }
  | { kind: 'AutoDisable'; bidderId: string };
export type EngineRejection =
  | 'OffGrid'
  | 'OutOfRange'
  | 'BelowMinimum'
  | 'LeaderMustRaiseAuto'
  | 'NotIncreasing'
  | 'NoAutoBid';
export class EngineError extends Error {
  constructor(
    readonly reason: EngineRejection,
    readonly minimumBid: number,
  ) {
    super(reason);
  }
}
export interface EngineResult {
  currentPrice: number;
  leaderId: string;
  nextSequence: number;
  // The acting bidder's projection after the action.
  bidder: EngineBidder;
  // Sequence assigned to the action, or null when the level did not rise.
  levelSequence: number | null;
}

export const minimumBid = (a: EngineAuction) =>
  a.currentPrice === null ? a.startPrice : a.currentPrice + a.step;

export const onGrid = (
  a: Pick<EngineAuction, 'startPrice' | 'step'>,
  x: number,
) =>
  Number.isSafeInteger(x) &&
  x >= a.startPrice &&
  (x - a.startPrice) % a.step === 0;

export function rank<T extends EngineBidder>(bidders: T[]): T[] {
  return [...bidders].sort(
    (x, y) => y.level - x.level || x.levelSequence - y.levelSequence,
  );
}

export function settle(
  a: EngineAuction,
  bidders: EngineBidder[],
  manualAmount: number | null,
) {
  const [top, second] = rank(bidders);
  const competitive = second
    ? Math.min(top.level, second.level + a.step)
    : a.startPrice;
  const price = Math.min(
    top.level,
    Math.max(a.currentPrice ?? a.startPrice, competitive, manualAmount ?? 0),
  );
  return { currentPrice: price, leaderId: top.bidderId };
}

function checkAmount(a: EngineAuction, amount: number) {
  if (amount < AUCTION_MIN_PRICE || amount > AUCTION_MAX_PRICE)
    throw new EngineError('OutOfRange', minimumBid(a));
  if (!onGrid(a, amount)) throw new EngineError('OffGrid', minimumBid(a));
}

export function apply(
  a: EngineAuction,
  bidders: EngineBidder[],
  action: EngineAction,
): EngineResult {
  const own = bidders.find((b) => b.bidderId === action.bidderId) ?? null;
  const others = bidders.filter((b) => b.bidderId !== action.bidderId);
  const isLeader = a.leaderId === action.bidderId;
  const min = minimumBid(a);

  if (action.kind === 'AutoDisable') {
    if (!own || own.mode !== 'Auto') throw new EngineError('NoAutoBid', min);
    // A leader keeps the obligation at the current price with the sequence of
    // the level that won it; an outbid bidder simply stops rising.
    const bidder: EngineBidder = {
      ...own,
      mode: 'Manual',
      level: isLeader ? a.currentPrice! : own.level,
    };
    return {
      currentPrice: a.currentPrice!,
      leaderId: a.leaderId!,
      nextSequence: a.nextSequence,
      bidder,
      levelSequence: null,
    };
  }

  const amount = action.kind === 'Manual' ? action.amount : action.max;
  checkAmount(a, amount);
  if (own && amount <= own.level) throw new EngineError('NotIncreasing', min);

  if (isLeader) {
    // The leader may only raise a private Auto ceiling; that never moves the
    // price by itself.
    if (action.kind === 'Manual')
      throw new EngineError('LeaderMustRaiseAuto', min);
    const bidder: EngineBidder = {
      ...own!,
      mode: 'Auto',
      level: amount,
      levelSequence: a.nextSequence,
    };
    return {
      currentPrice: a.currentPrice!,
      leaderId: a.leaderId!,
      nextSequence: a.nextSequence + 1,
      bidder,
      levelSequence: a.nextSequence,
    };
  }

  if (amount < min) throw new EngineError('BelowMinimum', min);
  const bidder: EngineBidder = {
    bidderId: action.bidderId,
    mode: action.kind === 'Manual' ? 'Manual' : 'Auto',
    level: amount,
    levelSequence: a.nextSequence,
  };
  const next = settle(
    a,
    [...others, bidder],
    action.kind === 'Manual' ? amount : null,
  );
  return {
    ...next,
    nextSequence: a.nextSequence + 1,
    bidder,
    levelSequence: a.nextSequence,
  };
}
