import type { MongoService } from '../../database/mongo/mongo.service.js';
import { DomainError } from '../commands/domain-error.js';
import type { AuctionBiddingService } from './auction-bidding.service.js';
import type { AuctionClock } from './auction-clock.js';
import type { AuctionIntakesService } from './auction-intakes.service.js';
import { AuctionWorker } from './auction-worker.service.js';
import type { PointCollectionService } from './point-collection.service.js';
import type { PointOrderCompletionService } from './point-order-completion.service.js';

// Failure reporting and backoff of the auction sweep, with discovery faked.
describe('AuctionWorker', () => {
  const due = new Date('2026-10-10T03:00:00Z');
  function setup(settle: (id: string) => Promise<unknown>) {
    const filters: Record<string, unknown>[] = [];
    const settling = [
      { _id: 'broken', state: 'Inspection', inspectionDeadline: due },
      { _id: 'fine', state: 'Inspection', inspectionDeadline: due },
    ];
    const collection = (rows: object[]) => ({
      find: (filter: Record<string, unknown>) => {
        filters.push(filter);
        const nin = (filter._id as { $nin: string[] }).$nin;
        const match =
          filter.state === 'Inspection'
            ? rows.filter((r) => !nin.includes((r as { _id: string })._id))
            : [];
        return { toArray: async () => match };
      },
      countDocuments: async () => 0,
    });
    const c = {
      auction_intakes: collection([]),
      auctions: collection([]),
      point_orders: collection(settling),
      // Hold sweep (FR-AU09): no open auction, so no party to check.
      users: { find: () => ({ toArray: async () => [] }) },
    };
    const mongo = {
      c,
      tx: (fn: (tx: unknown) => unknown) => fn({ c }),
    } as unknown as MongoService;
    const clock = { now: async () => due } as unknown as AuctionClock;
    const completion = {
      settle: vi.fn(settle),
    } as unknown as PointOrderCompletionService;
    const worker = new AuctionWorker(
      mongo,
      {} as AuctionBiddingService,
      {} as AuctionIntakesService,
      {} as PointCollectionService,
      completion,
      clock,
    );
    return { worker, completion, filters };
  }

  it('names a failed record and backs it off without blocking the rest', async () => {
    const { worker, completion } = setup(async (id) => {
      if (id === 'broken') throw new Error('Point order invariant: test');
    });
    const first = await worker.tick();
    expect(first).toMatchObject({ processed: 1, failed: 1, backedOff: 0 });
    expect(first.failures).toEqual([
      {
        step: 'settlement',
        id: 'broken',
        error: 'Error: Point order invariant: test',
      },
    ]);
    const second = await worker.tick();
    expect(second).toMatchObject({ failed: 0, backedOff: 1 });
    expect(completion.settle).toHaveBeenCalledTimes(3);
    expect(vi.mocked(completion.settle).mock.calls.at(-1)).toEqual(['fine']);
  });

  it('treats a 409 as a stale candidate, not a failure', async () => {
    const { worker } = setup(async () => {
      throw new DomainError(409, 'InvalidState', 'stale');
    });
    const result = await worker.tick();
    expect(result).toMatchObject({ skipped: 2, failed: 0, failures: [] });
    expect((await worker.tick()).backedOff).toBe(0);
  });
});

// ADR 0042: the close-only sweep the worker runs every few seconds.
describe('AuctionWorker.closeDue', () => {
  const now = new Date('2026-10-19T16:41:00Z');
  function setup(close: (id: string) => Promise<unknown>) {
    const filters: Record<string, unknown>[] = [];
    const ended = [{ _id: 'broken' }, { _id: 'fine' }];
    const auctions = {
      find: (filter: Record<string, unknown>) => {
        filters.push(filter);
        const nin = (filter._id as { $nin: string[] }).$nin;
        const rows =
          filter.state === 'Active' &&
          (filter.endAt as { $lte?: Date }).$lte === now
            ? ended.filter((r) => !nin.includes(r._id))
            : [];
        return { toArray: async () => rows };
      },
    };
    const c = { auctions };
    const mongo = {
      c,
      tx: (fn: (tx: unknown) => unknown) => fn({ c }),
    } as unknown as MongoService;
    const bidding = {
      close: vi.fn(close),
    } as unknown as AuctionBiddingService;
    const worker = new AuctionWorker(
      mongo,
      bidding,
      {} as AuctionIntakesService,
      {} as PointCollectionService,
      {} as PointOrderCompletionService,
      { now: async () => now } as unknown as AuctionClock,
    );
    return { worker, bidding, filters };
  }

  it('closes only Active auctions past endAt by server time', async () => {
    const { worker, bidding, filters } = setup(async () => undefined);
    expect(await worker.closeDue()).toMatchObject({
      processed: 2,
      failed: 0,
      backedOff: 0,
    });
    expect(filters[0]).toMatchObject({
      state: 'Active',
      endAt: { $lte: now },
    });
    expect(vi.mocked(bidding.close).mock.calls).toEqual([['broken'], ['fine']]);
  });

  it('skips a stale 409 and backs off a failing close', async () => {
    const { worker, bidding } = setup(async (id) => {
      if (id === 'broken') throw new Error('Auction invariant: test');
      throw new DomainError(409, 'InvalidState', 'already closed');
    });
    const first = await worker.closeDue();
    expect(first).toMatchObject({ processed: 0, skipped: 1, failed: 1 });
    expect(first.failures).toEqual([
      { step: 'close', id: 'broken', error: 'Error: Auction invariant: test' },
    ]);
    const second = await worker.closeDue();
    expect(second).toMatchObject({ skipped: 1, failed: 0, backedOff: 1 });
    expect(vi.mocked(bidding.close).mock.calls.at(-1)).toEqual(['fine']);
  });
});
