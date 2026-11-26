import { describe, it, expect, vi } from 'vitest';
import {
  dailyPipeline,
  moderationWindow,
  revenueCommissionAmount,
  revenueTransactionLabel,
  revenueWindow,
  splitPlatformLedgerBalance,
  OperationsDashboardService,
} from './operations-dashboard.service.js';
import type { MongoCommandService } from '../commands/mongo-command.service.js';

describe('moderation calendar and authorization', () => {
  it('includes both local dates and rejects impossible dates', () => {
    const window = revenueWindow('2026-11-04', '2026-11-07');
    expect(window.dates).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(() => revenueWindow('2026-02-30', '2026-03-01')).toThrow();
    expect(() => revenueWindow('2026-11-08', '2026-11-07')).toThrow();
  });
  it('uses local midnight, fills calendar days and ignores the host timezone', () => {
    const before = moderationWindow(new Date('2026-10-26T16:59:59Z'), 7);
    const after = moderationWindow(new Date('2026-10-26T17:00:00Z'), 7);
    expect(before.dates.at(-1)).toBe('2026-10-26');
    expect(after.dates.at(-1)).toBe('2026-10-27');
    expect(after.start.toISOString()).toBe('2026-10-20T17:00:00.000Z');
    expect(
      moderationWindow(new Date('2026-03-01T00:00:00Z'), 30).dates,
    ).toHaveLength(30);
  });
  it('bounds history at the server clock and groups submissions and decisions on their own dates', () => {
    const now = new Date(),
      start = new Date(now.getTime() - 1000);
    expect(dailyPipeline('decidedAt', start, now)[0]).toEqual({
      $match: { decidedAt: { $gte: start, $lte: now } },
    });
    expect(JSON.stringify(dailyPipeline('submittedAt', start, now))).toContain(
      'Asia/Ho_Chi_Minh',
    );
  });
  it.each(['MEMBER', 'TEST_OPERATOR'])(
    'rejects %s again in the service before touching collections',
    async (role) => {
      const read = vi.fn((_auth, callback) =>
        callback({}, { status: 'ACTIVE', roles: [{ role }] }),
      );
      const service = new OperationsDashboardService({
        read,
      } as unknown as MongoCommandService);
      await expect(service.overview({} as never, {})).rejects.toThrow();
    },
  );
  it.each(['LOCKED', 'RESTRICTED', 'DISABLED'])(
    'rejects a currently %s reviewer in the transaction',
    async (status) => {
      const read = vi.fn((_auth, callback) =>
        callback({}, { status, roles: [{ role: 'ADMIN' }] }),
      );
      await expect(
        new OperationsDashboardService({
          read,
        } as unknown as MongoCommandService).overview({} as never, {}),
      ).rejects.toThrow();
    },
  );
  it('separates point-order auction commission from pass-through outbound shipping in revenue history', () => {
    const pointCommissionByOrderId = new Map([['point-1', 50_000]]);
    const pointOrderIds = new Set(['point-1']);
    const directOrderIds = new Set(['direct-1']);

    // Point order journal debit into PlatformCommission = 50,000 commission + 30,000 outboundFee.
    expect(
      revenueCommissionAmount(
        { type: 'OrderSettlement', orderId: 'point-1', amount: 80_000 },
        pointCommissionByOrderId,
      ),
    ).toBe(50_000);
    expect(
      revenueTransactionLabel(
        { type: 'OrderSettlement', orderId: 'point-1' },
        pointOrderIds,
        directOrderIds,
      ),
    ).toBe('Hoa hồng đấu giá (5%)');

    // Direct order keeps its ledger commission debit and distinct label.
    expect(
      revenueCommissionAmount(
        { type: 'OrderSettlement', orderId: 'direct-1', amount: 15_000 },
        pointCommissionByOrderId,
      ),
    ).toBe(15_000);
    expect(
      revenueTransactionLabel(
        { type: 'OrderSettlement', orderId: 'direct-1' },
        pointOrderIds,
        directOrderIds,
      ),
    ).toBe('Hoa hồng bán trực tiếp (5%)');

    // Listing fee settlements keep their amount and label.
    expect(
      revenueCommissionAmount(
        { type: 'ListingFeeSettlement', orderId: null, amount: 10_000 },
        pointCommissionByOrderId,
      ),
    ).toBe(10_000);
    expect(
      revenueTransactionLabel(
        { type: 'ListingFeeSettlement', orderId: null },
        pointOrderIds,
        directOrderIds,
      ),
    ).toBe('Phí đăng bán');
  });

  it('splits PlatformCommission ledger balance into real platform revenue and pass-through auction shipping', () => {
    // 558,000 total in PlatformCommission = 474,000 net revenue + 84,000 dynamic GHN shipping pass-through (30k + 21,001 + 32,999).
    expect(splitPlatformLedgerBalance(558_000, 84_000)).toEqual({
      platformNetRevenueBalance: 474_000,
      platformShippingPassThrough: 84_000,
    });
    // Guard against negative net balance if ledger balance is smaller than shipping input.
    expect(splitPlatformLedgerBalance(20_000, 34_000)).toEqual({
      platformNetRevenueBalance: 0,
      platformShippingPassThrough: 20_000,
    });
  });
});
