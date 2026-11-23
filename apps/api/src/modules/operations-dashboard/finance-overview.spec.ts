import { describe, expect, it, vi } from 'vitest';
import {
  computeFinanceTotals,
  computeRateBps,
  previousDateRange,
} from './finance-overview.js';
import { OperationsDashboardService } from './operations-dashboard.service.js';
import type { MongoCommandService } from '../commands/mongo-command.service.js';

describe('finance-overview pure calculations', () => {
  it('computes net revenue, profit and take-rate excluding pass-through shipping (AC-15)', () => {
    // Direct order P=200,000, ship=30,000, c=5% => commission=10,000
    // Auction point order P=400,000, outboundFee=30,000, c=5% => commission=20,000, passThrough=30,000
    const totals = computeFinanceTotals({
      directCommission: 10_000,
      auctionCommission: 20_000,
      forfeitedDeposits: 50_000,
      depositShare: 25_000,
      legacyListingFees: 0,
      passThroughShipping: 30_000,
      incidentCompensation: 15_000,
      gmv: 600_000,
      settledOrders: 2,
    });

    expect(totals.netRevenue).toBe(55_000);
    expect(totals.profit).toBe(40_000);
    expect(totals.passThroughShipping).toBe(30_000);
    expect(totals.takeRateBps).toBe(500);
  });

  it('allows negative profit without clamping to zero', () => {
    const totals = computeFinanceTotals({
      directCommission: 10_000,
      auctionCommission: 0,
      forfeitedDeposits: 0,
      depositShare: 0,
      legacyListingFees: 0,
      passThroughShipping: 0,
      incidentCompensation: 80_000,
      gmv: 200_000,
      settledOrders: 1,
    });
    expect(totals.netRevenue).toBe(10_000);
    expect(totals.profit).toBe(-70_000);
  });

  it('returns null take-rate on an empty period (GMV = 0)', () => {
    const totals = computeFinanceTotals({
      directCommission: 0,
      auctionCommission: 0,
      forfeitedDeposits: 0,
      depositShare: 0,
      legacyListingFees: 0,
      passThroughShipping: 0,
      incidentCompensation: 0,
      gmv: 0,
      settledOrders: 0,
    });
    expect(totals.takeRateBps).toBeNull();
    expect(computeRateBps(5, 0)).toBeNull();
  });

  it('computes an immediately preceding non-overlapping window of equal length', () => {
    expect(previousDateRange('2026-11-10', '2026-11-16')).toEqual({
      from: '2026-11-03',
      to: '2026-11-09',
    });
    expect(previousDateRange('2026-11-01', '2026-11-01')).toEqual({
      from: '2026-10-31',
      to: '2026-10-31',
    });
  });
});

describe('finance & cashflow authorization guards in service', () => {
  it.each(['STAFF', 'MEMBER', 'TEST_OPERATOR'])(
    'rejects %s on finance and cashflow before touching collections',
    async (role) => {
      const read = vi.fn((_auth, cb) =>
        cb({}, { status: 'ACTIVE', roles: [{ role }] }),
      );
      const service = new OperationsDashboardService({
        read,
      } as unknown as MongoCommandService);
      await expect(
        service.finance({} as never, { from: '2026-11-01', to: '2026-11-07' }),
      ).rejects.toThrow();
      await expect(
        service.cashflow({} as never, { from: '2026-11-01', to: '2026-11-07' }),
      ).rejects.toThrow();
    },
  );

  it.each(['LOCKED', 'RESTRICTED', 'DISABLED'])(
    'rejects %s ADMIN on finance and cashflow',
    async (status) => {
      const read = vi.fn((_auth, cb) =>
        cb({}, { status, roles: [{ role: 'ADMIN' }] }),
      );
      const service = new OperationsDashboardService({
        read,
      } as unknown as MongoCommandService);
      await expect(
        service.finance({} as never, { from: '2026-11-01', to: '2026-11-07' }),
      ).rejects.toThrow();
      await expect(
        service.cashflow({} as never, { from: '2026-11-01', to: '2026-11-07' }),
      ).rejects.toThrow();
    },
  );
});

