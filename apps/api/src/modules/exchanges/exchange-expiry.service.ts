import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { ExchangesService } from './exchanges.service.js';

@Injectable()
export class ExchangeExpiryWorker {
  private readonly logger = new Logger(ExchangeExpiryWorker.name);

  constructor(
    private readonly mongo: MongoService,
    private readonly exchanges: ExchangesService,
    private readonly config: ConfigService,
  ) {}

  async tick(nowOverride?: Date) {
    const now = nowOverride ?? (await this.mongo.now());
    const batchSize = Number(this.config.get('EXCHANGE_EXPIRY_BATCH_SIZE') ?? 100);

    // ── Branch 1: Funding deadline expired (AcceptedAwaitingFunding) ─────────
    const fundingCandidates = await this.mongo.c.exchanges
      .find(
        {
          status: 'AcceptedAwaitingFunding',
          fundingDeadline: { $lte: now },
        },
        {
          sort: { fundingDeadline: 1, _id: 1 },
          limit: batchSize,
        },
      )
      .toArray();

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of fundingCandidates) {
      try {
        const result = await this.exchanges.expireExchange(candidate._id, now);
        if (result) {
          processed++;
          this.logger.log(
            JSON.stringify({
              event: 'exchangeFundingExpired',
              exchangeId: candidate._id,
              refundedInitiator: result.refundedInitiator,
              refundedRecipient: result.refundedRecipient,
              status: 'Cancelled',
            }),
          );
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to expire exchange funding ${candidate._id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    // ── Branch 2: Proposal deadline expired (Proposed) ───────────────────────
    const proposalCandidates = await this.mongo.c.exchanges
      .find(
        {
          status: 'Proposed',
          proposalExpiresAt: { $lte: now },
        },
        {
          sort: { proposalExpiresAt: 1, _id: 1 },
          limit: batchSize,
        },
      )
      .toArray();

    let proposalProcessed = 0;
    let proposalSkipped = 0;
    let proposalFailed = 0;

    for (const candidate of proposalCandidates) {
      try {
        const result = await this.exchanges.expireProposal(candidate._id, now);
        if (result) {
          proposalProcessed++;
          this.logger.log(
            JSON.stringify({
              event: 'exchangeProposalExpired',
              exchangeId: candidate._id,
              status: 'Cancelled',
            }),
          );
        } else {
          proposalSkipped++;
        }
      } catch (error) {
        proposalFailed++;
        this.logger.error(
          `Failed to expire exchange proposal ${candidate._id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    const remainingFunding = await this.mongo.c.exchanges.countDocuments({
      status: 'AcceptedAwaitingFunding',
      fundingDeadline: { $lte: now },
    });

    const remainingProposals = await this.mongo.c.exchanges.countDocuments({
      status: 'Proposed',
      proposalExpiresAt: { $lte: now },
    });

    return {
      processed: processed + proposalProcessed,
      skipped: skipped + proposalSkipped,
      failed: failed + proposalFailed,
      remaining: remainingFunding + remainingProposals,
    };
  }
}
