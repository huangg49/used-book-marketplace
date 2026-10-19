import { Injectable } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { DomainError } from '../commands/domain-error.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionClock } from './auction-clock.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { PointCollectionService } from './point-collection.service.js';
import { PointOrderCompletionService } from './point-order-completion.service.js';

const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;
const MAX_REPORTED_FAILURES = 20;

// Bounded sweeps for auction deadlines. Discovery reads take no locks; each
// command locks and rechecks the deadline with the server clock, so a stale
// candidate is skipped and a crashed run is simply retried next cycle.
// A record that fails for another reason is named in the sweep result and
// retried with backoff, so up to 100 broken records cannot starve the
// deadlines behind them in the same bounded scan.
@Injectable()
export class AuctionWorker {
  private readonly backoff = new Map<
    string,
    { retryAt: number; delay: number }
  >();
  constructor(
    private readonly mongo: MongoService,
    private readonly bidding: AuctionBiddingService,
    private readonly intakes: AuctionIntakesService,
    private readonly collection: PointCollectionService,
    private readonly completion: PointOrderCompletionService,
    private readonly clock: AuctionClock,
  ) {}
  async tick() {
    const blocked = this.blocked();
    const ready = { _id: { $nin: blocked } };
    const {
      holds,
      dropoffs,
      endings,
      payments,
      decisions,
      collections,
      returns,
      settlements,
      now,
    } = await this.mongo.tx(async (tx) => {
      const now = await this.clock.now(tx);
      // FR-AU09: open auctions whose seller or leader is no longer an ACTIVE
      // verified member; the hold command rechecks under the auction lock.
      const open = await tx.c.auctions
        .find(
          { ...ready, state: 'Active', endAt: { $gt: now } },
          {
            limit: 200,
            sort: { endAt: 1, _id: 1 },
            projection: { sellerId: 1, leaderId: 1 },
          },
        )
        .toArray();
      const parties = [
        ...new Set(open.flatMap((a) => [a.sellerId, a.leaderId ?? []].flat())),
      ];
      const ineligible = new Set(
        (
          await tx.c.users
            .find(
              {
                _id: { $in: parties },
                $or: [{ status: { $ne: 'ACTIVE' } }, { emailVerifiedAt: null }],
              },
              { projection: { _id: 1 } },
            )
            .toArray()
        ).map((u) => u._id),
      );
      return {
        now,
        holds: open.filter(
          (a) =>
            ineligible.has(a.sellerId) ||
            (a.leaderId !== null && ineligible.has(a.leaderId)),
        ),
        dropoffs: await tx.c.auction_intakes
          .find(
            {
              ...ready,
              state: 'AwaitingDropoff',
              dropoffDeadline: { $lte: now },
            },
            { limit: 100, sort: { dropoffDeadline: 1, _id: 1 } },
          )
          .toArray(),
        endings: await tx.c.auctions
          .find(
            { ...ready, state: 'Active', endAt: { $lte: now } },
            { limit: 100, sort: { endAt: 1, _id: 1 } },
          )
          .toArray(),
        payments: await tx.c.auctions
          .find(
            {
              ...ready,
              state: { $in: ['BuyNowPending', 'AwaitingWinnerPayment'] },
              paymentDeadline: { $lte: now },
            },
            { limit: 100, sort: { paymentDeadline: 1, _id: 1 } },
          )
          .toArray(),
        // Paid ViaPoint Orders past the report decision / collection deadline.
        decisions: await tx.c.point_orders
          .find(
            {
              ...ready,
              state: 'Fulfilling',
              acceptanceDeadline: { $lte: now },
            },
            { limit: 100, sort: { acceptanceDeadline: 1, _id: 1 } },
          )
          .toArray(),
        collections: await tx.c.point_orders
          .find(
            {
              ...ready,
              state: 'ReadyForCollection',
              collectionDeadline: { $lte: now },
            },
            { limit: 100, sort: { collectionDeadline: 1, _id: 1 } },
          )
          .toArray(),
        returns: await tx.c.point_orders
          .find(
            {
              ...ready,
              state: 'ReturnPending',
              returnDeadline: { $lte: now },
            },
            { limit: 100, sort: { returnDeadline: 1, _id: 1 } },
          )
          .toArray(),
        // Collected Orders whose inspection window passed without a claim.
        settlements: await tx.c.point_orders
          .find(
            {
              ...ready,
              state: 'Inspection',
              inspectionDeadline: { $lte: now },
            },
            { limit: 100, sort: { inspectionDeadline: 1, _id: 1 } },
          )
          .toArray(),
      };
    });
    const { attempt, result } = this.runner();
    for (const a of holds)
      await attempt('hold', a._id, () => this.bidding.hold(a._id));
    for (const a of endings)
      await attempt('close', a._id, () => this.bidding.close(a._id));
    for (const a of payments)
      await attempt('paymentExpiry', a._id, () =>
        this.bidding.expirePayment(a._id),
      );
    for (const i of dropoffs)
      await attempt('dropoffExpiry', i._id, () =>
        this.intakes.expireDropoff(i._id),
      );
    for (const o of [...decisions, ...collections, ...returns])
      await attempt('pointOrderDeadline', o._id, () =>
        this.collection.openResolution(o._id, o.version),
      );
    for (const o of settlements)
      await attempt('settlement', o._id, () => this.completion.settle(o._id));
    const oldest = [
      ...endings.map((a) => a.endAt),
      ...payments.map((a) => a.paymentDeadline!),
      ...dropoffs.map((i) => i.dropoffDeadline),
      ...decisions.map((o) => o.acceptanceDeadline!),
      ...collections.map((o) => o.collectionDeadline!),
      ...returns.map((o) => o.returnDeadline!),
      ...settlements.map((o) => o.inspectionDeadline!),
    ].sort((x, y) => x.getTime() - y.getTime())[0];
    return {
      ...result,
      backedOff: blocked.length,
      onHold: await this.mongo.c.auctions.countDocuments({ state: 'OnHold' }),
      reclaimRequired: await this.mongo.c.auction_intakes.countDocuments({
        state: 'ReclaimRequired',
      }),
      resolutionPending: await this.mongo.c.point_orders.countDocuments({
        state: 'ResolutionPending',
      }),
      oldestLagSeconds: oldest
        ? Math.max(0, Math.round((now.getTime() - oldest.getTime()) / 1000))
        : 0,
    };
  }

  // ADR 0042: a Buy Now window lasts 60 s, so the worker process runs this
  // close-only sweep every few seconds between full sweeps. It shares the
  // backoff with tick(); close stays idempotent and rechecks endAt under the
  // auction lock, so overlapping runs or several workers only skip (409).
  async closeDue() {
    const blocked = this.blocked();
    const endings = await this.mongo.tx(async (tx) => {
      const now = await this.clock.now(tx);
      return tx.c.auctions
        .find(
          { _id: { $nin: blocked }, state: 'Active', endAt: { $lte: now } },
          { limit: 100, sort: { endAt: 1, _id: 1 }, projection: { _id: 1 } },
        )
        .toArray();
    });
    const { attempt, result } = this.runner();
    for (const a of endings)
      await attempt('close', a._id, () => this.bidding.close(a._id));
    return { ...result, backedOff: blocked.length };
  }

  private blocked() {
    const wallNow = Date.now();
    return [...this.backoff]
      .filter(([, b]) => b.retryAt > wallNow)
      .map(([id]) => id);
  }
  // A record that fails for another reason than a stale 409 is named in the
  // result and retried with backoff.
  private runner() {
    const result = {
      processed: 0,
      skipped: 0,
      failed: 0,
      // Ids and error class/message only; never request bodies or user data.
      failures: [] as { step: string; id: string; error: string }[],
    };
    const attempt = async (
      step: string,
      id: string,
      fn: () => Promise<unknown>,
    ) => {
      try {
        await fn();
        result.processed++;
        this.backoff.delete(id);
      } catch (e) {
        if (e instanceof DomainError && e.getStatus() === 409) {
          result.skipped++;
          this.backoff.delete(id);
          return;
        }
        result.failed++;
        const delay = Math.min(
          (this.backoff.get(id)?.delay ?? BACKOFF_BASE_MS / 2) * 2,
          BACKOFF_MAX_MS,
        );
        this.backoff.set(id, { retryAt: Date.now() + delay, delay });
        if (result.failures.length < MAX_REPORTED_FAILURES)
          result.failures.push({
            step,
            id,
            error:
              e instanceof Error
                ? `${e.name}: ${e.message}`.slice(0, 200)
                : 'Unknown error',
          });
      }
    };
    return { attempt, result };
  }
}
