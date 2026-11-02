import { Injectable } from '@nestjs/common';
import type { Document } from 'mongodb';
import type { BoundCollection } from '../../database/mongo/collections.js';
import {
  MongoCommandService,
  member,
  type Actor,
  type Tx,
} from '../commands/mongo-command.service.js';
import {
  MongoPageService,
  regexLiteral,
} from '../commands/mongo-page.service.js';
import { invalidField, notFound, type Wire } from '../commands/domain-error.js';
import { SupportService } from './support.service.js';

type Target = Wire['SupportTarget'];
type Option = Wire['SupportTargetOption'];
const transactions = {
  DirectOrder: 'direct_orders',
  Exchange: 'exchanges',
  PointOrder: 'point_orders',
} as const;
const labels = {
  DirectOrder: 'Đơn mua bán',
  Exchange: 'Trao đổi sách',
  PointOrder: 'Đơn thắng đấu giá',
  Listing: 'Bài đăng',
  Auction: 'Phiên đấu giá',
  Review: 'Đánh giá',
  Member: 'Thành viên',
};
const isTransaction = (
  type: Target['type'],
): type is keyof typeof transactions => type in transactions;
function targetType(type: string): Target['type'] {
  if (!Object.hasOwn(labels, type))
    invalidField('type', 'Loại nội dung không hợp lệ.');
  return type as Target['type'];
}
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : null;
const readable = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

@Injectable()
export class SupportTargetsService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
    private readonly support: SupportService,
  ) {}

  list(
    auth: Actor,
    query: Record<string, string | number | boolean>,
  ): Promise<Wire['SupportTargetOptionsPage']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor, true);
      const type = targetType(String(query.type));
      if (!isTransaction(type))
        invalidField('type', 'Chọn loại giao dịch của bạn.');
      const q = String(query.q ?? '').trim();
      // Only aggregation/page reads use this common document view.
      const collection = tx.c[
        transactions[type]
      ] as unknown as BoundCollection<Document>;
      const pipeline = this.transactionPipeline(type, actor._id);
      if (q)
        pipeline.push({
          $match: {
            $or: [
              { title: { $regex: regexLiteral(q), $options: 'i' } },
              {
                'peer.displayName': { $regex: regexLiteral(q), $options: 'i' },
              },
            ],
          },
        });
      const page = await this.pages.page(
        collection,
        [...pipeline, { $set: { key: '$createdAt' } }],
        {
          kind: 'time',
          ascending: false,
          scope: { actor: actor._id, type, q },
          limit: Number(query.limit ?? 10),
          cursor: query.cursor as string | undefined,
        },
      );
      const rows = await collection
        .aggregate([...pipeline, { $match: { _id: { $in: page.ids } } }])
        .toArray();
      return {
        items: page.ids.map((id) =>
          this.transactionOption(
            type,
            rows.find((r) => r._id === id)!,
          ),
        ),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }

  get(auth: Actor, typeValue: string, id: string): Promise<Option> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor, true);
      const type = targetType(typeValue),
        target = { type, id };
      // Share creation's access policy without writing target locks on this read.
      await this.support.validateTarget(tx, target, actor._id, false);
      if (isTransaction(type)) {
        const rows = await tx.c[transactions[type]]
          .aggregate([
            { $match: { _id: id } },
            ...this.transactionPipeline(type, actor._id),
          ])
          .toArray();
        if (!rows[0]) throw notFound();
        return this.transactionOption(type, rows[0]);
      }
      let label: string = labels[type],
        description: string | null = null,
        partnerName: string | null = null,
        createdAt: string | null = null;
      if (type === 'Member') {
        label = (await tx.c.users.findOne({ _id: id }))!.displayName;
        description = 'Hồ sơ thành viên';
      } else if (type === 'Review') {
        const row = (await tx.c.transaction_reviews.findOne({ _id: id }))!;
        label = `Đánh giá của ${row.authorName}`;
        description = readable(row.comment, 180);
        createdAt = iso(row.createdAt);
      } else {
        const row =
          type === 'Listing'
            ? (await tx.c.listings.findOne({ _id: id }))!
            : (await tx.c.auctions.findOne({ _id: id }))!;
        const title =
          type === 'Listing'
            ? await this.listingTitle(tx, id)
            : await this.snapshotTitle(
                tx,
                'contextId' in row ? row.contextId : '',
              );
        label = title ?? labels[type];
        partnerName = readable(
          (
            await tx.c.users.findOne({
              _id: 'ownerId' in row ? row.ownerId : row.sellerId,
            })
          )?.displayName,
          120,
        );
        createdAt = iso('createdAt' in row ? row.createdAt : row.publishedAt);
        description = labels[type];
      }
      return {
        target,
        label: label.slice(0, 500),
        description,
        partnerName,
        createdAt,
        state: null,
      };
    });
  }

  private transactionPipeline(
    type: keyof typeof transactions,
    owner: string,
  ): Document[] {
    const exchange = type === 'Exchange',
      first = exchange ? 'initiatorId' : 'buyerId',
      second = exchange ? 'recipientId' : 'sellerId';
    return [
      { $match: { $or: [{ [first]: owner }, { [second]: owner }] } },
      {
        $set: {
          peerId: {
            $cond: [{ $eq: [`$${first}`, owner] }, `$${second}`, `$${first}`],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'peerId',
          foreignField: '_id',
          as: 'peer',
        },
      },
      { $set: { peer: { $first: '$peer' } } },
      ...(type === 'DirectOrder'
        ? [
            {
              $lookup: {
                from: 'workflow_contexts',
                localField: '_id',
                foreignField: 'orderId',
                as: 'contexts',
              },
            },
            { $set: { contextId: { $first: '$contexts._id' } } },
          ]
        : []),
      ...(!exchange
        ? [
            {
              $lookup: {
                from: 'workflow_items',
                localField: 'contextId',
                foreignField: 'contextId',
                as: 'books',
              },
            },
            {
              $set: {
                title: {
                  $ifNull: [
                    { $first: '$books.snapshot.metadata.title' },
                    { $first: '$books.snapshot.title' },
                  ],
                },
              },
            },
          ]
        : [{ $set: { title: labels.Exchange } }]),
    ];
  }
  private transactionOption(
    type: keyof typeof transactions,
    row: Document,
  ): Option {
    return {
      target: { type, id: row._id as string },
      label: readable(row.title, 500) ?? labels[type],
      description: labels[type],
      partnerName: readable(row.peer?.displayName, 120),
      createdAt: iso(row.createdAt),
      state: readable(row.state ?? row.status, 120),
    };
  }
  private async listingTitle(tx: Tx, id: string) {
    const listing = await tx.c.listings.findOne({ _id: id });
    const revision = listing?.currentRevisionId
      ? await tx.c.listing_revisions.findOne({ _id: listing.currentRevisionId })
      : null;
    const book = revision?.bookId
      ? await tx.c.catalog_books.findOne({ _id: revision.bookId })
      : null;
    return book?.currentRevisionId
      ? readable(
          (
            await tx.c.catalog_revisions.findOne({
              _id: book.currentRevisionId,
            })
          )?.title,
          500,
        )
      : null;
  }
  private async snapshotTitle(tx: Tx, id: string) {
    const item = await tx.c.workflow_items.findOne({ contextId: id });
    const snapshot = item?.snapshot as
      { title?: unknown; metadata?: { title?: unknown } } | undefined;
    return readable(snapshot?.metadata?.title ?? snapshot?.title, 500);
  }
}
