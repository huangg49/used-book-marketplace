import type {
  Json,
  TransactionReviewDoc as Review,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { notFound, type Wire } from '../commands/domain-error.js';
import { reviewIsPublic, type ReviewType } from './review-policy.js';
import { randomUUID } from 'node:crypto';

export async function reviewTransaction(
  tx: Tx,
  type: ReviewType,
  id: string,
  authorId: string,
  lock = false,
) {
  const collection =
    type === 'Exchange'
      ? 'exchanges'
      : type === 'DirectOrder'
        ? 'direct_orders'
        : 'point_orders';
  if (lock) await tx.lock(collection, [id]);
  const row = await tx.c[collection].findOne({ _id: id });
  if (!row) throw notFound();
  const a = 'initiatorId' in row ? row.initiatorId : row.buyerId;
  const b = 'recipientId' in row ? row.recipientId : row.sellerId;
  if (authorId !== a && authorId !== b) throw notFound();
  const state = 'status' in row ? row.status : row.state;
  const completedAt =
    state === 'Completed'
      ? 'completedAt' in row
        ? row.completedAt
        : row.closedAt
      : null;
  return {
    type,
    id,
    authorId,
    partnerId: authorId === a ? b : a,
    completedAt: completedAt ?? null,
    bookRatingRequired: type === 'Exchange' || authorId === a,
  };
}
export function reviewGroup(tx: Tx, type: ReviewType, id: string) {
  return tx.c.transaction_reviews
    .find({ transactionType: type, transactionId: id })
    .toArray();
}
export function reviewItem(
  r: Review,
  publication: Date | null,
  now: Date,
  privateView = false,
  includePendingReply = privateView,
): Wire['ExchangeReviewItem'] {
  const isPublic = reviewIsPublic(r, publication, now);
  return {
    id: r._id,
    transactionType: r.transactionType,
    transactionId: r.transactionId,
    ...(r.transactionType === 'Exchange'
      ? { exchangeId: r.transactionId }
      : {}),
    authorId: r.authorId,
    authorName: r.authorName,
    targetUserId: r.targetUserId,
    bookRating: r.bookRating,
    partnerRating: r.partnerRating,
    tags: r.tags,
    comment: r.comment,
    version: r.version,
    status: r.deletedAt
      ? 'Deleted'
      : r.hiddenAt
        ? 'Hidden'
        : isPublic
          ? 'Published'
          : 'Pending',
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    editDeadline: r.editDeadline.toISOString(),
    publishedAt: isPublic ? publication!.toISOString() : null,
    evidenceHeld: privateView && r.evidenceHeld,
    legacyDisclosed: privateView && r.legacyDisclosed,
    reply:
      r.reply && (includePendingReply || r.reply.status === 'Approved')
        ? { ...r.reply, createdAt: r.reply.createdAt.toISOString() }
        : null,
  };
}
export async function reviewRevision(
  tx: Tx,
  r: Review,
  action: string,
  actorId: string | null,
  reason: string | null,
  now: Date,
) {
  const snapshot = JSON.parse(JSON.stringify(r)) as Json;
  await tx.c.review_revisions.insertOne({
    _id: randomUUID(),
    reviewId: r._id,
    version: r.version,
    action,
    actorId,
    at: now,
    snapshot,
    reason,
  });
}
