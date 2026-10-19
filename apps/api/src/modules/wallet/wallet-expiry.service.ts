import { Injectable } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { DomainError } from '../commands/domain-error.js';
import { WalletService } from './wallet.service.js';
import { WalletClock } from './wallet-clock.js';
import { expiredVNPayCandidates } from './wallet-expiry-candidates.js';

@Injectable()
export class WalletExpiryWorker {
  constructor(
    private readonly mongo: MongoService,
    private readonly wallet: WalletService,
    private readonly clock: WalletClock,
  ) {}
  async tick() {
    const candidates = await this.mongo.tx(async (tx) =>
      expiredVNPayCandidates(tx, await this.clock.now(tx)),
    );
    let processed = 0,
      skipped = 0,
      failed = 0;
    for (const intent of candidates) {
      try {
        await this.wallet.expireVNPay(intent._id);
        processed++;
      } catch (error) {
        if (error instanceof DomainError && error.getStatus() === 409)
          skipped++;
        else failed++;
      }
    }
    return { processed, skipped, failed };
  }
}
