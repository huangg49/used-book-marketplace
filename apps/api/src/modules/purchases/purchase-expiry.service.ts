import { Injectable } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { DomainError } from '../commands/domain-error.js';
import { PurchasesService } from './purchases.service.js';

@Injectable()
export class PurchaseExpiryWorker {
  constructor(private readonly mongo: MongoService, private readonly purchases: PurchasesService) {}
  async tick() {
    const now = await this.mongo.now();
    const rows = await this.mongo.c.purchase_conversations.find({ status: 'Active', expiresAt: { $lte: now } }, { sort: { expiresAt: 1, _id: 1 }, limit: 100 }).toArray();
    let processed = 0, skipped = 0, failed = 0;
    for (const row of rows) try { await this.purchases.expire(row._id); processed++; } catch (error) { if (error instanceof DomainError && error.getStatus() === 409) skipped++; else failed++; }
    const remaining = await this.mongo.c.purchase_conversations.countDocuments({ status: 'Active', expiresAt: { $lte: now } });
    return { processed, skipped, failed, remaining };
  }
}
