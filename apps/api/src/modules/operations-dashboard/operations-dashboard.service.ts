import { Injectable, Optional } from '@nestjs/common';
import type { Document } from 'mongodb';
import {
  MongoCommandService,
  reviewer,
  type Actor,
} from '../commands/mongo-command.service.js';
import { invalidField, notFound, type Wire } from '../commands/domain-error.js';
import { PLATFORM_COMMISSION_ACCOUNT_ID } from '../../database/mongo/migrations/auction-constants.js';
import { MediaStorage } from '../media/media-storage.js';

const zone = 'Asia/Ho_Chi_Minh';
const dayMs = 86_400_000;
type Day = Wire['ModerationOverview']['daily'][number];
type RevenueDay = Wire['RevenueOverview']['daily'][number];
type RevenueTransaction = Wire['RevenueOverview']['transactions'][number];
type AggregateReader = {
  aggregate<T extends Document>(
    pipeline: Document[],
  ): { toArray(): Promise<T[]> };
};
type Input = [
  AggregateReader,
  'submittedAt' | 'decidedAt',
  Record<string, keyof Omit<Day, 'date'>>,
];
export function moderationWindow(now: Date, days: number) {
  // TP.HCM is UTC+7 year-round. Arithmetic avoids host timezone and locale drift.
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  const midnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return {
    start: new Date(midnight - (days - 1) * dayMs - 7 * 3_600_000),
    dates: Array.from({ length: days }, (_, i) =>
      new Date(midnight - (days - 1 - i) * dayMs).toISOString().slice(0, 10),
    ),
  };
}
export function dailyPipeline(
  field: 'submittedAt' | 'decidedAt',
  start: Date,
  now: Date,
): Document[] {
  return [
    { $match: { [field]: { $gte: start, $lte: now } } },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              date: `$${field}`,
              format: '%Y-%m-%d',
              timezone: zone,
            },
          },
          decision:
            field === 'decidedAt' ? '$decision' : { $literal: 'Submitted' },
        },
        count: { $sum: 1 },
      },
    },
  ];
}
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function localDate(value: string, field: 'from' | 'to') {
  const date = new Date(`${value}T00:00:00.000+07:00`);
  const normalized = Number.isNaN(date.getTime())
    ? ''
    : new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  if (!datePattern.test(value) || normalized !== value)
    throw invalidField(field, 'Ngày phải có dạng YYYY-MM-DD hợp lệ.');
  return date;
}
export function revenueWindow(from: string, to: string) {
  const start = localDate(from, 'from');
  const end = localDate(to, 'to');
  if (from > to)
    throw invalidField('to', 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  const endExclusive = new Date(end.getTime() + dayMs);
  if (endExclusive.getTime() - start.getTime() > 366 * dayMs)
    throw invalidField('to', 'Khoảng thời gian tối đa là 366 ngày.');
  const dates = Array.from(
    { length: Math.round((end.getTime() - start.getTime()) / dayMs) + 1 },
    (_, index) =>
      new Date(start.getTime() + index * dayMs + 7 * 3_600_000)
        .toISOString()
        .slice(0, 10),
  );
  return { start, endExclusive, dates };
}

@Injectable()
export class OperationsDashboardService {
  constructor(
    private readonly commands: MongoCommandService,
    @Optional() private readonly storage?: MediaStorage,
  ) {}

  async readUserAvatar(auth: Actor, userId: string) {
    const storage = this.storage;
    if (!storage) throw notFound();
    const row = await this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const user = await tx.c.users.findOne({ _id: userId });
      if (!user?.avatarId) throw notFound();
      const avatar = await tx.c.profile_avatars.findOne({
        _id: user.avatarId,
        ownerId: userId,
        state: { $in: ['Ready', 'Attached'] },
      });
      if (!avatar) throw notFound();
      return avatar;
    });
    await storage.check();
    const signed = await storage.signedRead(row.storageKey);
    await this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const user = await tx.c.users.findOne({ _id: userId });
      if (!user?.avatarId || user.avatarId !== row._id) throw notFound();
      return true;
    });
    return signed;
  }
  overview(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['ModerationOverview']> {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor); // Recheck current account/roles inside the authenticated snapshot.
      const days = Number(query.days ?? 7);
      if (days !== 7 && days !== 30)
        throw invalidField('days', 'Chọn khoảng 7 hoặc 30 ngày.');
      const catalog = actor.roles.some((role) => role.role === 'ADMIN');
      const now = await tx.now();
      const { start, dates } = moderationWindow(now, days);
      const daily: Day[] = dates.map((date) => ({
        date,
        listingSubmitted: 0,
        listingApproved: 0,
        listingRejected: 0,
        catalogSubmitted: catalog ? 0 : null,
        catalogConfirmed: catalog ? 0 : null,
        catalogRejected: catalog ? 0 : null,
      }));
      const pending = await tx.c.listings
        .aggregate<{ count: number }>([
          {
            $match: {
              deletedAt: null,
              visibility: { $ne: 'Removed' },
              moderation: 'PendingReview',
            },
          },
          {
            $lookup: {
              from: 'listing_revisions',
              localField: 'currentRevisionId',
              foreignField: '_id',
              as: 'revision',
            },
          },
          { $unwind: '$revision' },
          { $match: { 'revision.submittedAt': { $ne: null } } },
          { $count: 'count' },
        ])
        .toArray();
      // Sequential reads: MongoDB disallows parallel commands on the same transaction session.
      const inputs: Input[] = [
        [
          tx.c.listing_revisions,
          'submittedAt',
          { Submitted: 'listingSubmitted' },
        ],
        [
          tx.c.listing_decisions,
          'decidedAt',
          { Approve: 'listingApproved', Reject: 'listingRejected' },
        ],
        ...(catalog
          ? ([
              [
                tx.c.catalog_revisions,
                'submittedAt',
                { Submitted: 'catalogSubmitted' },
              ],
              [
                tx.c.catalog_decisions,
                'decidedAt',
                { Confirm: 'catalogConfirmed', Reject: 'catalogRejected' },
              ],
            ] satisfies Input[])
          : []),
      ];
      for (const [collection, field, keys] of inputs) {
        const rows = await collection
          .aggregate<{
            _id: { date: string; decision: string };
            count: number;
          }>(dailyPipeline(field, start, now))
          .toArray();
        for (const row of rows) {
          const day = daily.find((value) => value.date === row._id.date);
          const key = (keys as Record<string, keyof Omit<Day, 'date'>>)[
            row._id.decision
          ];
          if (day && key) day[key] = row.count;
        }
      }
      return {
        days,
        timezone: zone,
        startAt: start.toISOString(),
        serverTime: now.toISOString(),
        pending: {
          listings: pending[0]?.count ?? 0,
          catalog: catalog
            ? await tx.c.catalog_books.countDocuments({ status: 'Pending' })
            : null,
        },
        daily,
      };
    });
  }
  revenue(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['RevenueOverview']> {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const from = String(query.from ?? '');
      const to = String(query.to ?? '');
      const page = Number(query.page ?? 1);
      const window = revenueWindow(from, to);
      const now = await tx.now();
      const daily: RevenueDay[] = window.dates.map((date) => ({
        date,
        amount: 0,
        orderSettlements: 0,
      }));
      const rows = await tx.c.ledger_journals
        .aggregate<{
          _id: { date: string; type: string };
          amount: number;
          count: number;
        }>([
          {
            $match: {
              type: { $in: ['OrderSettlement', 'ListingFeeSettlement'] },
              postedAt: { $gte: window.start, $lt: window.endExclusive },
            },
          },
          {
            $lookup: {
              from: 'ledger_entries',
              localField: '_id',
              foreignField: 'journalId',
              as: 'entries',
            },
          },
          { $unwind: '$entries' },
          {
            $match: {
              'entries.accountId': PLATFORM_COMMISSION_ACCOUNT_ID,
              'entries.debit': { $gt: 0 },
            },
          },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: {
                    date: '$postedAt',
                    format: '%Y-%m-%d',
                    timezone: zone,
                  },
                },
                type: '$type',
              },
              amount: { $sum: '$entries.debit' },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const transactionPipeline: Document[] = [
        {
          $match: {
            type: { $in: ['OrderSettlement', 'ListingFeeSettlement'] },
            postedAt: { $gte: window.start, $lt: window.endExclusive },
          },
        },
        {
          $lookup: {
            from: 'ledger_entries',
            localField: '_id',
            foreignField: 'journalId',
            as: 'entries',
          },
        },
        { $unwind: '$entries' },
        {
          $match: {
            'entries.accountId': PLATFORM_COMMISSION_ACCOUNT_ID,
            'entries.debit': { $gt: 0 },
          },
        },
      ];
      const transactionCount = await tx.c.ledger_journals
        .aggregate<{ count: number }>([
          ...transactionPipeline,
          { $count: 'count' },
        ])
        .toArray();
      const transactionRows = await tx.c.ledger_journals
        .aggregate<{
          _id: string,
          type: 'OrderSettlement' | 'ListingFeeSettlement',
          orderId: string | null,
          listingFeeId: string | null,
          postedAt: Date,
          amount: number,
        }>([
          ...transactionPipeline,
          {
            $project: {
              _id: 1,
              type: 1,
              orderId: 1,
              listingFeeId: 1,
              postedAt: 1,
              amount: '$entries.debit',
            },
          },
          { $sort: { postedAt: -1, _id: -1 } },
          { $skip: (page - 1) * 10 },
          { $limit: 10 },
        ])
        .toArray();
      const insightOrderRows = await tx.c.ledger_journals
        .aggregate<{ orderId: string | null }>([
          ...transactionPipeline,
          { $project: { orderId: 1 } },
        ])
        .toArray();
      for (const row of rows) {
        const day = daily.find((value) => value.date === row._id.date);
        if (!day) continue;
        day.amount += row.amount;
        if (row._id.type === 'OrderSettlement')
          day.orderSettlements += row.count;
      }
      const transactions: RevenueTransaction[] = transactionRows.map((row) => ({
        id: row._id,
        type: row.type,
        label:
          row.type === 'OrderSettlement' ? 'Doanh thu đơn hàng' : 'Phí đăng bán',
        amount: row.amount,
        postedAt: row.postedAt.toISOString(),
        referenceId: row.orderId ?? row.listingFeeId,
      }));
      const settledOrderIds = insightOrderRows
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id));
      const directOrders = settledOrderIds.length
        ? await tx.c.direct_orders
            .find({ _id: { $in: settledOrderIds } })
            .toArray()
        : [];
      const pointOrders = settledOrderIds.length
        ? await tx.c.point_orders
            .find({ _id: { $in: settledOrderIds } })
            .toArray()
        : [];
      const quotes = directOrders.length
        ? await tx.c.sale_quotes
            .find({ _id: { $in: directOrders.map((order) => order.quoteId) } })
            .toArray()
        : [];
      const pointListings = pointOrders.length
        ? await tx.c.listings
            .find({ _id: { $in: pointOrders.map((order) => order.listingId) } })
            .toArray()
        : [];
      const pointRevisions = pointListings.length
        ? await tx.c.listing_revisions
            .find({
              _id: {
                $in: pointListings
                  .map((listing) => listing.currentRevisionId)
                  .filter((id): id is string => Boolean(id)),
              },
            })
            .toArray()
        : [];
      const saleCatalogRevisions = quotes.length
        ? await tx.c.catalog_revisions
            .find({ _id: { $in: quotes.map((quote) => quote.catalogRevisionId) } })
            .toArray()
        : [];
      const pointBookIds = pointRevisions
        .map((revision) => revision.bookId)
        .filter((id): id is string => Boolean(id));
      const pointCatalogBooks = pointBookIds.length
        ? await tx.c.catalog_books
            .find({ _id: { $in: pointBookIds } })
            .toArray()
        : [];
      const pointCatalogRevisions = pointCatalogBooks.length
        ? await tx.c.catalog_revisions
            .find({
              _id: {
                $in: pointCatalogBooks
                  .map((book) => book.currentRevisionId)
                  .filter((id): id is string => Boolean(id)),
              },
            })
            .toArray()
        : [];
      const exchanges = await tx.c.exchanges
        .find({
          status: 'Completed',
          completedAt: { $gte: window.start, $lt: window.endExclusive },
        })
        .toArray();
      const accountIds = Array.from(
        new Set([
          ...directOrders.map((order) => order.sellerId),
          ...pointOrders.map((order) => order.sellerId),
        ]),
      );
      const users = accountIds.length
        ? await tx.c.users.find({ _id: { $in: accountIds } }).toArray()
        : [];
      const userNames = new Map(users.map((user) => [user._id, user.displayName]));
      const listingIds = Array.from(
        new Set([
          ...quotes.map((quote) => quote.listingId),
          ...pointOrders.map((order) => order.listingId),
          ...exchanges.flatMap((exchange) => [
            ...(exchange.agreement?.initiatorBooks ?? []).map((book) => book.listingId),
            ...(exchange.agreement?.recipientBook
              ? [exchange.agreement.recipientBook.listingId]
              : []),
          ]),
        ]),
      );
      const listingMedia = listingIds.length
        ? await tx.c.listing_media
            .find({
              listingId: { $in: listingIds },
              status: 'Ready',
              purgedAt: null,
              derivativeKey: { $ne: null },
            })
            .sort({ createdAt: 1, _id: 1 })
            .toArray()
        : [];
      const firstMediaByListing = new Map<string, string>();
      for (const media of listingMedia) {
        if (!firstMediaByListing.has(media.listingId))
          firstMediaByListing.set(media.listingId, media._id);
      }
      const revenueByAccount = new Map<string, number>();
      for (const order of directOrders) {
        const quote = quotes.find((item) => item._id === order.quoteId);
        if (quote)
          revenueByAccount.set(
            order.sellerId,
            (revenueByAccount.get(order.sellerId) ?? 0) + quote.sellerProceeds,
          );
      }
      for (const order of pointOrders) {
        revenueByAccount.set(
          order.sellerId,
          (revenueByAccount.get(order.sellerId) ?? 0) + order.sellerProceeds,
        );
      }
      const topAccount = [...revenueByAccount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const bookCandidates: Array<{
        type: 'Sale' | 'Exchange' | 'Auction';
        label: string;
        title: string;
        amount: number;
        sellerName: string;
        referenceId: string;
        listingId: string;
        mediaId: string | null;
      }> = [];
      for (const order of directOrders) {
        const quote = quotes.find((item) => item._id === order.quoteId);
        const title = quote
          ? saleCatalogRevisions.find(
              (revision) => revision._id === quote.catalogRevisionId,
            )?.title
          : undefined;
        const sellerName = userNames.get(order.sellerId);
        if (quote && title && sellerName) {
          bookCandidates.push({
            type: 'Sale',
            label: 'Mua bán',
            title,
            amount: quote.bookPrice,
            sellerName,
            referenceId: order._id,
            listingId: quote.listingId,
            mediaId: firstMediaByListing.get(quote.listingId) ?? null,
          });
        }
      }
      for (const order of pointOrders) {
        const listing = pointListings.find((item) => item._id === order.listingId);
        const revision = listing?.currentRevisionId
          ? pointRevisions.find((item) => item._id === listing.currentRevisionId)
          : undefined;
        const book = revision?.bookId
          ? pointCatalogBooks.find((item) => item._id === revision.bookId)
          : undefined;
        const title = book?.currentRevisionId
          ? pointCatalogRevisions.find(
              (item) => item._id === book.currentRevisionId,
            )?.title
          : undefined;
        const sellerName = userNames.get(order.sellerId);
        if (title && sellerName) {
          bookCandidates.push({
            type: 'Auction',
            label: 'Đấu giá',
            title,
            amount: order.bookPrice,
            sellerName,
            referenceId: order._id,
            listingId: order.listingId,
            mediaId: firstMediaByListing.get(order.listingId) ?? null,
          });
        }
      }
      for (const exchange of exchanges) {
        const books = [
          ...(exchange.agreement?.initiatorBooks ?? []),
          ...(exchange.agreement?.recipientBook
            ? [exchange.agreement.recipientBook]
            : []),
        ];
        for (const book of books) {
          bookCandidates.push({
            type: 'Exchange',
            label: 'Trao đổi',
            title: book.book.title,
            amount: book.exchangeValue,
            sellerName: book.ownerDisplayName,
            referenceId: exchange._id,
            listingId: book.listingId,
            mediaId: book.mediaIds[0] ?? firstMediaByListing.get(book.listingId) ?? null,
          });
        }
      }
      const highestPricedBooks = (['Sale', 'Exchange', 'Auction'] as const)
        .map(
          (type) =>
            bookCandidates
              .filter((book) => book.type === type)
              .sort(
                (a, b) =>
                  b.amount - a.amount ||
                  a.referenceId.localeCompare(b.referenceId),
              )[0],
        )
        .filter((book): book is (typeof bookCandidates)[number] => Boolean(book));
      return {
        from,
        to,
        timezone: zone,
        serverTime: now.toISOString(),
        total: daily.reduce((sum, day) => sum + day.amount, 0),
        orderSettlements: daily.reduce(
          (sum, day) => sum + day.orderSettlements,
          0,
        ),
        daily,
        page,
        pageSize: 10,
        totalTransactions: transactionCount[0]?.count ?? 0,
        transactions,
        topRevenueAccount: topAccount
          ? {
              accountId: topAccount[0],
              displayName: userNames.get(topAccount[0]) ?? topAccount[0],
              revenue: topAccount[1],
              avatarId: users.find((user) => user._id === topAccount[0])?.avatarId ?? null,
            }
          : null,
        highestPricedBooks,
      };
    });
  }
}
