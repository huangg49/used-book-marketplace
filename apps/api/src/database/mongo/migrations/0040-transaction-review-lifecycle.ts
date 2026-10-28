import type { Db, Document } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { document, t, unique, type CollectionSpec } from '../schema-dsl.js';
// Self-contained definition avoids a registry/import cycle when a schema test
// imports this migration before the registry. Prior migrations remain frozen.
const legacyProperties = {
  _id: t.uuid(),
  transactionType: t.enum('Exchange', 'Order'),
  transactionId: t.uuid(),
  authorId: t.uuid(),
  authorName: t.str(120),
  targetUserId: t.uuid(),
  bookRating: t.int(1, 5),
  partnerRating: t.int(1, 5),
  tags: { bsonType: 'array', items: t.str(60) },
  comment: t.str(1000),
  publishedAt: t.ndate(),
  createdAt: t.date(),
  updatedAt: t.date(),
  lockSeq: t.int(0),
};

export const reviewLifecycleSpecs: CollectionSpec[] = [
  {
    name: 'transaction_reviews',
    access: 'mutable',
    schema: document({
      ...legacyProperties,
      transactionType: t.enum('Exchange', 'DirectOrder', 'PointOrder'),
      bookRating: t.nint(1, 5),
      version: t.int(1),
      editDeadline: t.date(),
      deletedAt: t.ndate(),
      hiddenAt: t.ndate(),
      evidenceHeld: t.bool(),
      legacyDisclosed: t.bool(),
      reply: {
        anyOf: [
          { bsonType: 'null' },
          document({
            text: t.str(1000),
            status: t.enum('Pending', 'Approved', 'Hidden'),
            createdAt: t.date(),
          }),
        ],
      },
    }),
    expr: {
      $and: [
        { $eq: ['$editDeadline', { $add: ['$createdAt', 48 * 3_600_000] }] },
        { $ne: ['$authorId', '$targetUserId'] },
        {
          $or: [
            { $ne: ['$transactionType', 'Exchange'] },
            { $ne: ['$bookRating', null] },
          ],
        },
      ],
    },
    indexes: [
      unique(
        { transactionId: 1, authorId: 1 },
        'transaction_reviews_tx_author_key',
      ),
      {
        key: { targetUserId: 1, createdAt: -1 },
        name: 'transaction_reviews_target_created_idx',
      },
      {
        key: { publishedAt: 1, transactionType: 1, transactionId: 1 },
        name: 'review_publication_idx',
      },
    ],
  },
  {
    name: 'review_revisions',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      reviewId: t.uuid(),
      version: t.int(1),
      action: t.str(40),
      actorId: t.nuuid(),
      at: t.date(),
      snapshot: t.object(),
      reason: t.nstr(1000),
    }),
    indexes: [
      unique(
        { reviewId: 1, version: 1 },
        'review_revisions_review_version_key',
      ),
    ],
  },
];

export function withReviewCommandTarget(spec: CollectionSpec): CollectionSpec {
  if (!['mutation_receipts', 'audit_events'].includes(spec.name)) return spec;
  const extend = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const next = node.map(extend);
      return next.includes('$listingId') &&
        next.includes('$topupId') &&
        !next.includes('$reviewId')
        ? [...next, '$reviewId']
        : next;
    }
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, extend(v)]),
      );
    return node;
  };
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...spec.schema.properties, reviewId: t.nuuid() },
    },
    expr: extend(spec.expr) as Document,
  };
}
export const transactionReviewLifecycleMigration = {
  id: '0040-transaction-review-lifecycle',
  definition: {
    specs: reviewLifecycleSpecs,
    commandTarget:
      'extend-integrated-0027-plus-vnpay-expiry-0032-with-reviewId-v1',
    legacy: 'preserve-disclosure-lock-edits-and-baseline-revision-v1',
  },
  async up(db: Db) {
    const { applyCollectionSpecs } = await import('./index.js');
    const { integratedWalletPointCommandSpecs } =
      await import('./0027-wallet-point-command-union.js');
    const { withVNPayExpiry } = await import('./0032-vnpay-topup-expiry.js');
    // First allow the new fields, then backfill without changing original content,
    // first creation time or the fact a legacy implementation disclosed it early.
    await applyCollectionSpecs(
      db,
      reviewLifecycleSpecs.map((s) =>
        s.name === 'transaction_reviews'
          ? {
              ...s,
              expr: undefined,
              schema: { ...s.schema, required: Object.keys(legacyProperties) },
            }
          : s,
      ),
    );
    await db
      .collection('transaction_reviews')
      .updateMany({ version: { $exists: false } }, [
        {
          $set: {
            transactionType: {
              $cond: [
                { $eq: ['$transactionType', 'Order'] },
                'DirectOrder',
                '$transactionType',
              ],
            },
            version: 1,
            editDeadline: { $add: ['$createdAt', 48 * 3_600_000] },
            deletedAt: null,
            hiddenAt: null,
            evidenceHeld: false,
            legacyDisclosed: { $ne: ['$publishedAt', null] },
            reply: null,
          },
        },
      ]);
    // Preserve a baseline revision for historical reviews too. Upsert only when
    // absent so rerunning an interrupted migration never rewrites history.
    for await (const review of db
      .collection('transaction_reviews')
      .find({ version: 1 })) {
      await db.collection('review_revisions').updateOne(
        { reviewId: review._id, version: 1 },
        {
          $setOnInsert: {
            _id: randomUUID(),
            reviewId: review._id,
            version: 1,
            action: 'LegacyBaseline',
            actorId: null,
            at: review.createdAt,
            snapshot: review,
            reason: 'Preserved by migration 0040',
          },
        },
        { upsert: true },
      );
    }
    await applyCollectionSpecs(db, [
      ...reviewLifecycleSpecs,
      ...integratedWalletPointCommandSpecs
        .map(withVNPayExpiry)
        .map(withReviewCommandTarget),
    ]);
  },
};
