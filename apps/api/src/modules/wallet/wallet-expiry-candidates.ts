import type { Tx } from '../../database/mongo/transaction.js';

export function expiredVNPayCandidates(
  tx: Tx,
  now: Date,
  ownerId?: string,
  id?: string,
) {
  return tx.c.vnpay_payments
    .aggregate<{ _id: string }>([
      {
        $match: {
          expiresAt: { $lte: now },
          ...(id ? { _id: id.toLowerCase() } : {}),
        },
      },
      { $sort: { expiresAt: 1, _id: 1 } },
      {
        $lookup: {
          from: 'topup_intents',
          localField: '_id',
          foreignField: '_id',
          as: 'intent',
        },
      },
      {
        $match: {
          'intent.state': { $in: ['Pending', 'Processing'] },
          ...(ownerId ? { 'intent.ownerId': ownerId } : {}),
        },
      },
      { $limit: 100 },
      { $project: { _id: 1 } },
    ])
    .toArray();
}
