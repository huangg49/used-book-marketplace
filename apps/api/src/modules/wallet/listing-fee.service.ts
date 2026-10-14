import { Injectable } from '@nestjs/common';
import type { Tx } from '../../database/mongo/transaction.js';
import { LedgerService, checkListingFee } from './ledger.service.js';
import { TransactionPolicy } from './transaction-policy.js';
import { DomainError } from '../commands/domain-error.js';

@Injectable()
export class ListingFeeService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly policy: TransactionPolicy,
  ) {}
  private async authorizedTime(tx: Tx, ownerId: string, sessionId: string) {
    await this.ledger.lockListingFee(tx, ownerId);
    const now = await tx.now(),
      session = await tx.c.auth_sessions.findOne({ _id: sessionId });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn.',
      );
    return now;
  }
  async charge(
    tx: Tx,
    listingId: string,
    revisionId: string,
    ownerId: string,
    receiptId: string,
    sessionId: string,
  ) {
    if (!this.policy.listingFee) return;
    const now = await this.authorizedTime(tx, ownerId, sessionId);
    const fee = {
      _id: revisionId,
      listingId,
      ownerId,
      amount: this.policy.listingFee,
      policyCode: 'LISTING-FEE-v1' as const,
      createdAt: now,
      receiptId,
    };
    await tx.c.listing_fees.insertOne(fee);
    await this.ledger.postListingFee(
      tx,
      fee,
      'ListingFeeCharge',
      receiptId,
      now,
    );
    tx.check(`listing-fee:${revisionId}`, () =>
      checkListingFee(tx, revisionId),
    );
  }
  async decide(
    tx: Tx,
    revisionId: string,
    approved: boolean,
    receiptId: string,
    sessionId: string,
  ) {
    const fee = await tx.c.listing_fees.findOne({ _id: revisionId });
    if (!fee) return; // Historical free revisions are never charged retroactively.
    const now = await this.authorizedTime(tx, fee.ownerId, sessionId);
    await this.ledger.postListingFee(
      tx,
      fee,
      approved ? 'ListingFeeSettlement' : 'ListingFeeRefund',
      receiptId,
      now,
    );
    tx.check(`listing-fee:${revisionId}`, () =>
      checkListingFee(tx, revisionId),
    );
  }
}
