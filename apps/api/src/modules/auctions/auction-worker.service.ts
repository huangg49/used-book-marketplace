import { Injectable } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { DomainError } from '../commands/domain-error.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionClock } from './auction-clock.js';
import { AuctionIntakesService } from './auction-intakes.service.js';

// Bounded sweeps for auction deadlines. Discovery reads take no locks; each
// command locks and rechecks the deadline with the server clock, so a stale
// candidate is skipped and a crashed run is simply retried next cycle.
@Injectable()
export class AuctionWorker {
  constructor(
    private readonly mongo: MongoService,
    private readonly bidding: AuctionBiddingService,
    private readonly intakes: AuctionIntakesService,
    private readonly clock: AuctionClock,
  ) {}
  async tick() {
    const { dropoffs, endings, payments, now } = await this.mongo.tx(
      async (tx) => {
        const now = await this.clock.now(tx);
        return {
          now,
          dropoffs: await tx.c.auction_intakes
            .find(
              { state: 'AwaitingDropoff', dropoffDeadline: { $lte: now } },
              { limit: 100, sort: { dropoffDeadline: 1, _id: 1 } },
            )
            .toArray(),
          endings: await tx.c.auctions
            .find(
              { state: 'Active', endAt: { $lte: now } },
              { limit: 100, sort: { endAt: 1, _id: 1 } },
            )
            .toArray(),
          payments: await tx.c.auctions
            .find(
              {
                state: { $in: ['BuyNowPending', 'AwaitingWinnerPayment'] },
                paymentDeadline: { $lte: now },
              },
              { limit: 100, sort: { paymentDeadline: 1, _id: 1 } },
            )
            .toArray(),
        };
      },
    );
    let processed = 0,
      skipped = 0,
      failed = 0;
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        processed++;
      } catch (e) {
        if (e instanceof DomainError && e.getStatus() === 409) skipped++;
        else failed++;
      }
    };
    for (const a of endings) await attempt(() => this.bidding.close(a._id));
    for (const a of payments)
      await attempt(() => this.bidding.expirePayment(a._id));
    for (const i of dropoffs)
      await attempt(() => this.intakes.expireDropoff(i._id));
    const oldest = [
      ...endings.map((a) => a.endAt),
      ...payments.map((a) => a.paymentDeadline!),
      ...dropoffs.map((i) => i.dropoffDeadline),
    ].sort((x, y) => x.getTime() - y.getTime())[0];
    return {
      processed,
      skipped,
      failed,
      onHold: await this.mongo.c.auctions.countDocuments({ state: 'OnHold' }),
      reclaimRequired: await this.mongo.c.auction_intakes.countDocuments({
        state: 'ReclaimRequired',
      }),
      oldestLagSeconds: oldest
        ? Math.max(0, Math.round((now.getTime() - oldest.getTime()) / 1000))
        : 0,
    };
  }
}
