import { describe, expect, it } from 'vitest';
import {
  auctionDeposit,
  auctionDepositMax,
  sellerDepositShare,
} from '../../database/mongo/migrations/auction-constants.js';

// ADR 0087: deposit bounds and the seller's share of a forfeited deposit.
describe('auction deposit (ADR 0087)', () => {
  it('lets the seller raise the deposit from the 10% default to half the start price', () => {
    expect([auctionDeposit(200_000), auctionDepositMax(200_000)]).toEqual([20_000, 100_000]);
    expect([auctionDeposit(155_000), auctionDepositMax(155_000)]).toEqual([16_000, 77_000]);
    // A low start price has one deposit: the 10.000đ floor.
    expect([auctionDeposit(10_000), auctionDepositMax(10_000)]).toEqual([10_000, 10_000]);
    expect([auctionDeposit(21_000), auctionDepositMax(21_000)]).toEqual([10_000, 10_000]);
    expect(auctionDepositMax(25_000)).toBe(12_000);
  });

  it('pays the seller half of what was forfeited, rounded down', () => {
    expect(sellerDepositShare(20_000)).toBe(10_000);
    expect(sellerDepositShare(15_001)).toBe(7_500);
    expect(sellerDepositShare(0)).toBe(0);
  });
});
