import type { Db } from 'mongodb';
import type { ExchangeDoc, MutationReceiptDoc } from '../documents.js';

export const restoreFundedExchangeTermsMigration = {
  id: '0089-restore-funded-exchange-terms',
  definition: { backfill: 'restoreFundedExchangeTermsFromReceiptV1' },
  async up(db: Db) {
    const exchanges = db.collection<ExchangeDoc>('exchanges');
    const receipts = db.collection<MutationReceiptDoc>('mutation_receipts');
    for await (const exchange of exchanges.find({
      agreement: { $ne: null },
      $or: [{ initiatorFundedAt: { $type: 'date' } }, { recipientFundedAt: { $type: 'date' } }],
    })) {
      const agreement = exchange.agreement;
      if (!agreement) continue;
      const initiatorValue = agreement.initiatorBooks.reduce((total, book) => total + book.exchangeValue, 0);
      const recipientValue = agreement.recipientBook.exchangeValue;
      if (initiatorValue === recipientValue ||
          exchange.initiatorDeposit !== initiatorValue ||
          exchange.recipientDeposit !== recipientValue) continue;

      // 0086 could overwrite pre-existing funded terms. An exact funding receipt
      // records the original terms before 0086 without moving money again.
      const originalFunding = await receipts.findOne({
        listingId: exchange.initiatorListingId,
        operation: 'fundExchange',
        actorId: { $in: [exchange.initiatorId, exchange.recipientId] },
        resultVersion: { $lte: exchange.revision },
        'result.id': exchange._id,
        'result.initiatorDeposit': recipientValue,
        'result.recipientDeposit': initiatorValue,
        'result.diffAmount': exchange.diffAmount,
        'result.diffPayerId': exchange.diffPayerId,
      });
      if (!originalFunding) continue;

      await exchanges.updateOne(
        { _id: exchange._id, revision: exchange.revision },
        { $set: { initiatorDeposit: recipientValue, recipientDeposit: initiatorValue } },
      );
    }
  },
};
