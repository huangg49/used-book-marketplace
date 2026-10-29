import { Injectable } from '@nestjs/common';
import type { Document } from 'mongodb';
import type { BoundCollection } from '../../database/mongo/collections.js';
import type { TransactionReviewDoc as Review } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import {
  MongoCommandService,
  member,
  reviewer,
  type Actor,
  type Tx,
} from '../commands/mongo-command.service.js';
import { MongoPageService } from '../commands/mongo-page.service.js';
import { notFound, type Wire } from '../commands/domain-error.js';
import {
  publicationTime,
  REVIEW_SUBMISSION_MS,
  type ReviewType,
} from './review-policy.js';
import {
  reviewTransaction,
  reviewGroup,
  reviewItem,
  reviewRevision,
} from './review-record.js';
type PageQuery = Record<string, string | number>;

// One predicate backs public totals, public paging and the moderation queue.
// A legacy publishedAt or a delayed worker can never disclose content early.
export function reviewPublicationPipeline(now: Date): Document[] {
  return [
    {
      $lookup: {
        from: 'transaction_reviews',
        let: { id: '$transactionId', type: '$transactionType' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$transactionId', '$$id'] },
                  { $eq: ['$transactionType', '$$type'] },
                ],
              },
            },
          },
        ],
        as: 'siblings',
      },
    },
    ...(['Exchange', 'DirectOrder', 'PointOrder'] as const).map((type) => ({
      $lookup: {
        from:
          type === 'Exchange'
            ? 'exchanges'
            : type === 'DirectOrder'
              ? 'direct_orders'
              : 'point_orders',
        localField: 'transactionId',
        foreignField: '_id',
        as: type,
      },
    })),
    {
      $set: {
        transaction: {
          $arrayElemAt: [
            {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$transactionType', 'Exchange'] },
                    // oxlint-disable-next-line unicorn/no-thenable -- MongoDB $switch data, not a JavaScript thenable.
                    then: '$Exchange',
                  },
                  {
                    case: { $eq: ['$transactionType', 'DirectOrder'] },
                    // oxlint-disable-next-line unicorn/no-thenable -- MongoDB $switch data, not a JavaScript thenable.
                    then: '$DirectOrder',
                  },
                ],
                default: '$PointOrder',
              },
            },
            0,
          ],
        },
      },
    },
    {
      $match: {
        $expr: {
          $eq: [
            { $ifNull: ['$transaction.status', '$transaction.state'] },
            'Completed',
          ],
        },
      },
    },
    {
      $set: {
        completion: {
          $ifNull: ['$transaction.completedAt', '$transaction.closedAt'],
        },
      },
    },
    { $match: { completion: { $type: 'date' } } },
    {
      $set: {
        publication: {
          $max: [
            { $max: '$siblings.editDeadline' },
            {
              $cond: [
                { $lt: [{ $size: '$siblings' }, 2] },
                { $add: ['$completion', REVIEW_SUBMISSION_MS] },
                '$completion',
              ],
            },
          ],
        },
      },
    },
    { $match: { publication: { $lte: now } } },
  ];
}
@Injectable()
export class ReviewQueries {
  constructor(
    private readonly mongo: MongoService,
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
  ) {}
  reputation(id: string, query: PageQuery): Promise<Wire['MemberReputation']> {
    return this.mongo.tx(async (tx) => {
      const user = await tx.c.users.findOne({
        _id: id,
        emailVerifiedAt: { $ne: null },
        status: { $in: ['ACTIVE', 'RESTRICTED', 'LOCKED'] },
      });
      if (!user) throw notFound();
      const now = await tx.now(),
        pipeline = [
          { $match: { targetUserId: id, deletedAt: null, hiddenAt: null } },
          ...reviewPublicationPipeline(now),
        ];
      const [totals] = await tx.c.transaction_reviews
        .aggregate<{
          count: number;
          bookCount: number;
          partner: number;
          book: number | null;
        }>([
          ...pipeline,
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              bookCount: {
                $sum: { $cond: [{ $ne: ['$bookRating', null] }, 1, 0] },
              },
              partner: { $avg: '$partnerRating' },
              book: { $avg: '$bookRating' },
            },
          },
        ])
        .toArray();
      const page = await this.pages.page(
        tx.c.transaction_reviews,
        [...pipeline, { $project: { key: '$createdAt' } }],
        {
          kind: 'time',
          ascending: false,
          scope: { operation: 'memberReputation', id },
          limit: Number(query.limit),
          cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
        },
      );
      const selected = await tx.c.transaction_reviews
        .aggregate<Review & { publication: Date }>([
          ...pipeline,
          { $match: { _id: { $in: page.ids } } },
        ])
        .toArray();
      const byId = new Map(selected.map((r) => [r._id, r]));
      const counts = await Promise.all([
        tx.c.exchanges.countDocuments({
          status: 'Completed',
          $or: [{ initiatorId: id }, { recipientId: id }],
        }),
        tx.c.direct_orders.countDocuments({
          state: 'Completed',
          $or: [{ buyerId: id }, { sellerId: id }],
        }),
        tx.c.point_orders.countDocuments({
          state: 'Completed',
          $or: [{ buyerId: id }, { sellerId: id }],
        }),
      ]);
      return {
        userId: id,
        displayName: user.displayName,
        completedTransactions: counts.reduce((a, b) => a + b, 0),
        verifiedViolations: await tx.c.member_violations.countDocuments({
          userId: id,
        }),
        reviewCount: totals?.count ?? 0,
        partnerRatingCount: totals?.count ?? 0,
        bookRatingCount: totals?.bookCount ?? 0,
        partnerRating: totals?.partner ?? null,
        bookRating: totals?.book ?? null,
        items: page.ids.flatMap((id) => {
          const r = byId.get(id);
          return r ? [reviewItem(r, r.publication, now)] : [];
        }),
        nextCursor: page.nextCursor,
        serverTime: now.toISOString(),
      };
    });
  }
  listOperations(
    auth: Actor,
    query: PageQuery,
  ): Promise<Wire['OperationsReviewPage']> {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const now = await tx.now();
      const pipeline = [
        {
          $match: {
            authorId: { $ne: actor._id },
            targetUserId: { $ne: actor._id },
          },
        },
        ...reviewPublicationPipeline(now),
      ];
      const page = await this.pages.page(
        tx.c.transaction_reviews,
        [...pipeline, { $project: { key: '$createdAt' } }],
        {
          kind: 'time',
          ascending: false,
          scope: { operation: 'operationsReviews', actor: actor._id },
          limit: Number(query.limit),
          cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
        },
      );
      const selected = await tx.c.transaction_reviews
          .aggregate<Review & { publication: Date }>([
            ...pipeline,
            { $match: { _id: { $in: page.ids } } },
          ])
          .toArray(),
        byId = new Map(selected.map((r) => [r._id, r]));
      return {
        items: await Promise.all(
          page.ids.map(async (id) => {
            const r = byId.get(id)!;
            const history = await this.revisionPage(tx, id, actor._id, {
              limit: 20,
            });
            return {
              review: reviewItem(r, r.publication, now, true),
              revisions: history.items,
              nextRevisionCursor: history.nextCursor,
            };
          }),
        ),
        nextCursor: page.nextCursor,
        serverTime: now.toISOString(),
      };
    });
  }
  private async revisionPage(
    tx: Tx,
    id: string,
    actorId: string,
    query: PageQuery,
  ): Promise<Wire['ReviewRevisionPage']> {
    const page = await this.pages.page(
      tx.c.review_revisions,
      [{ $match: { reviewId: id } }, { $project: { key: '$version' } }],
      {
        kind: 'number',
        ascending: false,
        scope: {
          operation: 'reviewRevisionHistory',
          reviewId: id,
          actor: actorId,
        },
        limit: Number(query.limit),
        cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
      },
    );
    const revisions = await tx.c.review_revisions
        .find({ _id: { $in: page.ids } })
        .toArray(),
      byId = new Map(revisions.map((r) => [r._id, r]));
    return {
      items: page.ids.map((id) => {
        const v = byId.get(id)!;
        return {
          version: v.version,
          action: v.action,
          actorId: v.actorId,
          at: v.at.toISOString(),
          snapshot: v.snapshot as Record<string, unknown>,
          reason: v.reason,
        };
      }),
      nextCursor: page.nextCursor,
      serverTime: (await tx.now()).toISOString(),
    };
  }
  revisions(
    auth: Actor,
    id: string,
    query: PageQuery,
  ): Promise<Wire['ReviewRevisionPage']> {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const now = await tx.now(),
        [review] = await tx.c.transaction_reviews
          .aggregate<Review>([
            {
              $match: {
                _id: id,
                authorId: { $ne: actor._id },
                targetUserId: { $ne: actor._id },
              },
            },
            ...reviewPublicationPipeline(now),
          ])
          .toArray();
      if (!review) throw notFound();
      return this.revisionPage(tx, id, actor._id, query);
    });
  }
  listTransactions(
    auth: Actor,
    query: PageQuery,
  ): Promise<Wire['ReviewTransactionsPage']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const id = actor._id;
      const ex = [
        {
          $match: {
            status: 'Completed',
            $or: [{ initiatorId: id }, { recipientId: id }],
          },
        },
        {
          $project: {
            _id: 1,
            key: '$completedAt',
            transactionType: { $literal: 'Exchange' },
            partnerId: {
              $cond: [
                { $eq: ['$initiatorId', id] },
                '$recipientId',
                '$initiatorId',
              ],
            },
          },
        },
      ];
      const order = (type: string) => [
        {
          $match: {
            state: 'Completed',
            $or: [{ buyerId: id }, { sellerId: id }],
          },
        },
        {
          $project: {
            _id: 1,
            key: type === 'PointOrder' ? '$closedAt' : '$completedAt',
            transactionType: { $literal: type },
            partnerId: {
              $cond: [{ $eq: ['$buyerId', id] }, '$sellerId', '$buyerId'],
            },
          },
        },
      ];
      const type: ReviewType =
        query.type === 'DirectOrder'
          ? 'DirectOrder'
          : query.type === 'PointOrder'
            ? 'PointOrder'
            : 'Exchange';
      const collection =
        type === 'Exchange'
          ? tx.c.exchanges
          : type === 'DirectOrder'
            ? tx.c.direct_orders
            : tx.c.point_orders;
      // MongoDB forbids $unionWith inside a transaction. Each lane has its own
      // scoped signed cursor and page, preserving current auth and snapshot reads.
      const pipeline = [
        ...(type === 'Exchange' ? ex : order(type)),
        { $match: { key: { $type: 'date' } } },
      ];
      const page = await this.pages.page(
        collection as unknown as BoundCollection<Document>,
        pipeline,
        {
          kind: 'time',
          ascending: false,
          scope: { operation: 'reviewTransactions', actor: id, type },
          limit: Number(query.limit),
          cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
        },
      );
      const rows = await collection
          .aggregate<{
            _id: string;
            key: Date;
            transactionType: ReviewType;
            partnerId: string;
          }>([...pipeline, { $match: { _id: { $in: page.ids } } }])
          .toArray(),
        byId = new Map(rows.map((r) => [r._id, r]));
      const partners = await tx.c.users
          .find({ _id: { $in: rows.map((r) => r.partnerId) } })
          .toArray(),
        names = new Map(partners.map((u) => [u._id, u.displayName]));
      return {
        items: page.ids.map((id) => {
          const r = byId.get(id)!;
          return {
            transactionType: r.transactionType,
            transactionId: id,
            partnerId: r.partnerId,
            partnerName: names.get(r.partnerId) ?? 'Thành viên',
            completedAt: r.key.toISOString(),
          };
        }),
        nextCursor: page.nextCursor,
        serverTime: (await tx.now()).toISOString(),
      };
    });
  }
  async publishDue() {
    const now = await this.mongo.now();
    const candidates = await this.mongo.c.transaction_reviews
      .aggregate<{
        transactionType: ReviewType;
        transactionId: string;
        authorId: string;
      }>([
        { $match: { publishedAt: null } },
        ...reviewPublicationPipeline(now),
        { $limit: 100 },
        { $project: { transactionType: 1, transactionId: 1, authorId: 1 } },
      ])
      .toArray();
    let published = 0;
    for (const candidate of candidates) {
      const count = await this.mongo.tx(async (tx) => {
        const transaction = await reviewTransaction(
          tx,
          candidate.transactionType,
          candidate.transactionId,
          candidate.authorId,
          true,
        );
        const rows = await reviewGroup(
          tx,
          candidate.transactionType,
          candidate.transactionId,
        );
        await tx.lock(
          'transaction_reviews',
          rows.map((r) => r._id),
        );
        const decidedAt = await tx.now(),
          publication = publicationTime(transaction.completedAt, rows);
        if (!publication || decidedAt < publication) return 0;
        let changed = 0;
        for (const r of rows)
          if (!r.publishedAt) {
            r.publishedAt = publication;
            r.updatedAt = decidedAt;
            r.version++;
            await tx.c.transaction_reviews.updateOne(
              { _id: r._id },
              {
                $set: {
                  publishedAt: publication,
                  updatedAt: decidedAt,
                  version: r.version,
                },
              },
            );
            await reviewRevision(tx, r, 'Published', null, null, decidedAt);
            changed++;
          }
        return changed;
      });
      published += count;
    }
    return { published };
  }
}
