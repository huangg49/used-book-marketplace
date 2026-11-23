import { Injectable, Optional } from '@nestjs/common';
import type { Document } from 'mongodb';
import {
  MongoCommandService,
  financeAdmin,
  reviewer,
  type Actor,
} from '../commands/mongo-command.service.js';
import { invalidField, notFound, type Wire } from '../commands/domain-error.js';
import { PLATFORM_COMMISSION_ACCOUNT_ID } from '../../database/mongo/migrations/auction-constants.js';
import { SIMULATED_CAPITAL } from '../../database/mongo/migrations/0055-simulator-capital-increase.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { MediaStorage } from '../media/media-storage.js';
import {
  FINANCE_NOTES,
  computeFinanceTotals,
  computeRateBps,
  previousDateRange,
} from './finance-overview.js';

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

  private async readFinancePeriod(
    tx: Tx,
    start: Date,
    endExclusive: Date,
    dates?: string[],
  ) {
    const dailyMap = new Map<
      string,
      Wire['FinanceOverview']['daily'][number]
    >();
    if (dates) {
      for (const date of dates) {
        dailyMap.set(date, {
          date,
          directCommission: 0,
          auctionCommission: 0,
          forfeitedDeposits: 0,
          depositShare: 0,
          netRevenue: 0,
          incidentCompensation: 0,
          profit: 0,
          gmv: 0,
          settledOrders: 0,
        });
      }
    }

    const platformJournalRows = await tx.c.ledger_journals
      .aggregate<{
        _id: string;
        type:
          | 'OrderSettlement'
          | 'ListingFeeSettlement'
          | 'AuctionDepositForfeit'
          | 'AuctionDepositSellerShare';
        orderId: string | null;
        date: string;
        debit: number;
        credit: number;
      }>([
        {
          $match: {
            type: {
              $in: [
                'OrderSettlement',
                'ListingFeeSettlement',
                'AuctionDepositForfeit',
                'AuctionDepositSellerShare',
              ],
            },
            postedAt: { $gte: start, $lt: endExclusive },
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
          },
        },
        {
          $project: {
            _id: 1,
            type: 1,
            orderId: 1,
            date: {
              $dateToString: {
                date: '$postedAt',
                format: '%Y-%m-%d',
                timezone: zone,
              },
            },
            debit: '$entries.debit',
            credit: '$entries.credit',
          },
        },
      ])
      .toArray();

    const settledOrderIds = platformJournalRows
      .filter((r) => r.type === 'OrderSettlement' && r.orderId)
      .map((r) => r.orderId!);

    const [directOrders, pointOrders] = await Promise.all([
      settledOrderIds.length
        ? tx.c.direct_orders.find({ _id: { $in: settledOrderIds } }).toArray()
        : Promise.resolve([]),
      settledOrderIds.length
        ? tx.c.point_orders.find({ _id: { $in: settledOrderIds } }).toArray()
        : Promise.resolve([]),
    ]);

    const quotes = directOrders.length
      ? await tx.c.sale_quotes
          .find({ _id: { $in: directOrders.map((o) => o.quoteId) } })
          .toArray()
      : [];
    const quoteById = new Map(quotes.map((q) => [q._id, q]));
    const directById = new Map(directOrders.map((o) => [o._id, o]));
    const pointById = new Map(pointOrders.map((o) => [o._id, o]));

    let directCommission = 0;
    let auctionCommission = 0;
    let forfeitedDeposits = 0;
    let depositShare = 0;
    let legacyListingFees = 0;
    let passThroughShipping = 0;
    let gmv = 0;
    let settledOrders = 0;

    for (const row of platformJournalRows) {
      const day = dailyMap.get(row.date);
      if (row.type === 'OrderSettlement' && row.orderId) {
        const direct = directById.get(row.orderId);
        if (direct) {
          const quote = quoteById.get(direct.quoteId);
          const comm = row.debit;
          const bookPrice = quote?.bookPrice ?? 0;
          directCommission += comm;
          gmv += bookPrice;
          settledOrders += 1;
          if (day) {
            day.directCommission += comm;
            day.gmv += bookPrice;
            day.settledOrders += 1;
          }
          continue;
        }
        const point = pointById.get(row.orderId);
        if (point) {
          // Point order ledger debit into platform equals commission + outboundFee.
          // Separate real commission from pass-through outbound shipping fee.
          const comm = point.commission;
          const shipping = point.outboundFee;
          const bookPrice = point.bookPrice;
          auctionCommission += comm;
          passThroughShipping += shipping;
          gmv += bookPrice;
          settledOrders += 1;
          if (day) {
            day.auctionCommission += comm;
            day.gmv += bookPrice;
            day.settledOrders += 1;
          }
          continue;
        }
      } else if (row.type === 'ListingFeeSettlement' && row.debit > 0) {
        legacyListingFees += row.debit;
        if (day) day.netRevenue += row.debit;
      } else if (row.type === 'AuctionDepositForfeit' && row.debit > 0) {
        forfeitedDeposits += row.debit;
        if (day) day.forfeitedDeposits += row.debit;
      } else if (row.type === 'AuctionDepositSellerShare' && row.credit > 0) {
        depositShare += row.credit;
        if (day) day.depositShare += row.credit;
      }
    }

    const incidentRows = await tx.c.incident_fund_journal
      .aggregate<{ _id: string; amount: number }>([
        {
          $match: {
            type: 'CompensationApproved',
            createdAt: { $gte: start, $lt: endExclusive },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                date: '$createdAt',
                format: '%Y-%m-%d',
                timezone: zone,
              },
            },
            amount: { $sum: '$amount' },
          },
        },
      ])
      .toArray();

    let incidentCompensation = 0;
    for (const row of incidentRows) {
      incidentCompensation += row.amount;
      const day = dailyMap.get(row._id);
      if (day) day.incidentCompensation += row.amount;
    }

    for (const day of dailyMap.values()) {
      day.netRevenue +=
        day.directCommission +
        day.auctionCommission +
        day.forfeitedDeposits -
        day.depositShare;
      day.profit = day.netRevenue - day.incidentCompensation;
    }

    return {
      totals: computeFinanceTotals({
        directCommission,
        auctionCommission,
        forfeitedDeposits,
        depositShare,
        legacyListingFees,
        passThroughShipping,
        incidentCompensation,
        gmv,
        settledOrders,
      }),
      daily: [...dailyMap.values()],
    };
  }

  finance(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['FinanceOverview']> {
    return this.commands.read(auth, async (tx, actor) => {
      financeAdmin(actor);
      const from = String(query.from ?? '');
      const to = String(query.to ?? '');
      const window = revenueWindow(from, to);
      const prevRange = previousDateRange(from, to);
      const prevWindow = revenueWindow(prevRange.from, prevRange.to);
      const now = await tx.now();

      const [current, previous, completedExchanges] = await Promise.all([
        this.readFinancePeriod(
          tx,
          window.start,
          window.endExclusive,
          window.dates,
        ),
        this.readFinancePeriod(tx, prevWindow.start, prevWindow.endExclusive),
        tx.c.exchanges
          .find({
            status: 'Completed',
            completedAt: { $gte: window.start, $lt: window.endExclusive },
          })
          .toArray(),
      ]);

      let initiatorValue = 0;
      let recipientValue = 0;
      for (const ex of completedExchanges) {
        if (ex.agreement) {
          for (const b of ex.agreement.initiatorBooks ?? []) {
            initiatorValue += b.exchangeValue;
          }
          if (ex.agreement.recipientBook) {
            recipientValue += ex.agreement.recipientBook.exchangeValue;
          }
        }
      }

      return {
        from,
        to,
        timezone: zone,
        serverTime: now.toISOString(),
        simulated: true,
        current: current.totals,
        previous: {
          from: prevRange.from,
          to: prevRange.to,
          totals: previous.totals,
        },
        daily: current.daily,
        exchange: {
          completed: completedExchanges.length,
          initiatorValue,
          recipientValue,
        },
        notes: FINANCE_NOTES,
      };
    });
  }

  cashflow(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['FinanceCashflow']> {
    return this.commands.read(auth, async (tx, actor) => {
      financeAdmin(actor);
      const from = String(query.from ?? '');
      const to = String(query.to ?? '');
      const window = revenueWindow(from, to);
      const now = await tx.now();

      const [purposeRows, lastFundEntry, flowRows, pendingWithdrawals] =
        await Promise.all([
          tx.c.ledger_entries
            .aggregate<{
              _id: string;
              balance: number;
            }>([
              {
                $lookup: {
                  from: 'wallet_accounts',
                  localField: 'accountId',
                  foreignField: '_id',
                  as: 'a',
                },
              },
              { $unwind: '$a' },
              {
                $group: {
                  _id: '$a.purpose',
                  balance: { $sum: { $subtract: ['$debit', '$credit'] } },
                },
              },
            ])
            .toArray(),
          tx.c.incident_fund_journal.findOne({}, { sort: { sequence: -1 } }),
          tx.c.ledger_journals
            .aggregate<{
              _id: { date: string; type: 'Topup' | 'WithdrawalPayout' };
              amount: number;
              count: number;
            }>([
              {
                $match: {
                  type: { $in: ['Topup', 'WithdrawalPayout'] },
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
              { $match: { 'entries.debit': { $gt: 0 } } },
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
            .toArray(),
          tx.c.withdrawals
            .find({ state: 'Requested' })
            .sort({ createdAt: 1 })
            .toArray(),
        ]);

      const byPurpose = new Map(purposeRows.map((r) => [r._id, r.balance]));
      const sourceRemaining = Math.max(0, byPurpose.get('SimulatorClearing') ?? 0);
      const memberAvailable = Math.max(0, byPurpose.get('UserAvailable') ?? 0);
      const transactionHeld = Math.max(0, byPurpose.get('OrderHold') ?? 0);
      const auctionHeld = Math.max(0, byPurpose.get('AuctionBidHold') ?? 0);
      const withdrawalHeld = Math.max(0, byPurpose.get('WithdrawalHold') ?? 0);
      const platformCommission = Math.max(
        0,
        byPurpose.get('PlatformCommission') ?? 0,
      );
      const listingFeeHeld = Math.max(
        0,
        byPurpose.get('ListingFeeClearing') ?? 0,
      );
      const accountedTotal =
        sourceRemaining +
        memberAvailable +
        transactionHeld +
        auctionHeld +
        withdrawalHeld +
        platformCommission +
        listingFeeHeld;
      const discrepancy = accountedTotal - SIMULATED_CAPITAL;

      const dailyMap = new Map<
        string,
        Wire['FinanceCashflow']['daily'][number]
      >();
      for (const date of window.dates) {
        dailyMap.set(date, {
          date,
          topupAmount: 0,
          topupCount: 0,
          withdrawalAmount: 0,
          withdrawalCount: 0,
          netCashflow: 0,
        });
      }

      let topupTotal = 0;
      let topupCount = 0;
      let withdrawalTotal = 0;
      let withdrawalCount = 0;

      for (const row of flowRows) {
        const day = dailyMap.get(row._id.date);
        if (row._id.type === 'Topup') {
          topupTotal += row.amount;
          topupCount += row.count;
          if (day) {
            day.topupAmount += row.amount;
            day.topupCount += row.count;
          }
        } else if (row._id.type === 'WithdrawalPayout') {
          withdrawalTotal += row.amount;
          withdrawalCount += row.count;
          if (day) {
            day.withdrawalAmount += row.amount;
            day.withdrawalCount += row.count;
          }
        }
      }

      for (const day of dailyMap.values()) {
        day.netCashflow = day.topupAmount - day.withdrawalAmount;
      }

      const pendingAmount = pendingWithdrawals.reduce(
        (sum, w) => sum + w.amount,
        0,
      );

      return {
        from,
        to,
        timezone: zone,
        serverTime: now.toISOString(),
        simulated: true,
        conservation: {
          balanced: discrepancy === 0,
          capitalTarget: SIMULATED_CAPITAL,
          accountedTotal,
          discrepancy,
          sourceRemaining,
          memberAvailable,
          transactionHeld,
          auctionHeld,
          withdrawalHeld,
          platformCommission,
          listingFeeHeld,
          incidentFundBalance: lastFundEntry?.balanceAfter ?? 0,
        },
        period: {
          topupTotal,
          topupCount,
          withdrawalTotal,
          withdrawalCount,
          netCashflow: topupTotal - withdrawalTotal,
        },
        daily: [...dailyMap.values()],
        withdrawalQueue: {
          pendingCount: pendingWithdrawals.length,
          pendingAmount,
          oldestRequestedAt: pendingWithdrawals[0]?.createdAt
            ? pendingWithdrawals[0].createdAt.toISOString()
            : null,
        },
      };
    });
  }

  analytics(
    auth: Actor,
    query: Record<string, string | number>,
  ): Promise<Wire['OperationsAnalytics']> {
    return this.commands.read(auth, async (tx, actor) => {
      reviewer(actor);
      const from = String(query.from ?? '');
      const to = String(query.to ?? '');
      const window = revenueWindow(from, to);
      const now = await tx.now();

      const [
        salesRows,
        exchangeRows,
        auctionRows,
        openExchangeDisputes,
        openPointIncidents,
        underfundedIncidents,
        lastFundEntry,
        incidentCompRows,
        userStatusRows,
        newMembersInPeriod,
      ] = await Promise.all([
        tx.c.direct_orders
          .aggregate<{ _id: string; count: number }>([
            {
              $match: {
                createdAt: { $gte: window.start, $lt: window.endExclusive },
              },
            },
            { $group: { _id: '$state', count: { $sum: 1 } } },
          ])
          .toArray(),
        tx.c.exchanges
          .aggregate<{ _id: string; count: number }>([
            {
              $match: {
                createdAt: { $gte: window.start, $lt: window.endExclusive },
              },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .toArray(),
        tx.c.auctions
          .aggregate<{ _id: string; count: number }>([
            {
              $match: {
                createdAt: { $gte: window.start, $lt: window.endExclusive },
              },
            },
            { $group: { _id: '$state', count: { $sum: 1 } } },
          ])
          .toArray(),
        tx.c.exchanges.countDocuments({ status: 'ResolutionPending' }),
        tx.c.point_incidents.countDocuments({ state: 'Open' }),
        tx.c.point_incidents.countDocuments({ state: 'Underfunded' }),
        tx.c.incident_fund_journal.findOne({}, { sort: { sequence: -1 } }),
        tx.c.incident_fund_journal
          .aggregate<{ total: number }>([
            {
              $match: {
                type: 'CompensationApproved',
                createdAt: { $gte: window.start, $lt: window.endExclusive },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ])
          .toArray(),
        tx.c.users
          .aggregate<{ _id: string; count: number }>([
            { $match: { 'roles.role': 'MEMBER' } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          .toArray(),
        tx.c.users.countDocuments({
          'roles.role': 'MEMBER',
          createdAt: { $gte: window.start, $lt: window.endExclusive },
        }),
      ]);

      const salesCreated = salesRows.reduce((s, r) => s + r.count, 0);
      const salesCompleted =
        salesRows.find((r) => r._id === 'Completed')?.count ?? 0;
      const salesCancelled = salesRows
        .filter((r) =>
          ['Cancelled', 'Expired', 'Rejected', 'Refunded'].includes(r._id),
        )
        .reduce((s, r) => s + r.count, 0);
      const salesActive = Math.max(
        0,
        salesCreated - salesCompleted - salesCancelled,
      );

      const exProposed = exchangeRows.reduce((s, r) => s + r.count, 0);
      const exCompleted =
        exchangeRows.find((r) => r._id === 'Completed')?.count ?? 0;
      const exDisputed =
        exchangeRows.find((r) => r._id === 'ResolutionPending')?.count ?? 0;
      const exCancelled = exchangeRows
        .filter((r) => ['Cancelled', 'Rejected', 'Expired'].includes(r._id))
        .reduce((s, r) => s + r.count, 0);
      const exActive = Math.max(
        0,
        exProposed - exCompleted - exDisputed - exCancelled,
      );

      const aucCreated = auctionRows.reduce((s, r) => s + r.count, 0);
      const aucSold = auctionRows
        .filter((r) => ['Sold', 'Completed'].includes(r._id))
        .reduce((s, r) => s + r.count, 0);
      const aucPaymentExpired =
        auctionRows.find((r) => r._id === 'PaymentExpired')?.count ?? 0;
      const aucCancelled = auctionRows
        .filter((r) => ['Cancelled', 'Unsold', 'Closed'].includes(r._id))
        .reduce((s, r) => s + r.count, 0);
      const aucActive = Math.max(
        0,
        aucCreated - aucSold - aucPaymentExpired - aucCancelled,
      );

      const totalMembers = userStatusRows.reduce((s, r) => s + r.count, 0);
      const activeMembers =
        userStatusRows.find((r) => r._id === 'ACTIVE')?.count ?? 0;
      const restrictedMembers =
        userStatusRows.find((r) => r._id === 'RESTRICTED')?.count ?? 0;
      const lockedMembers = userStatusRows
        .filter((r) => ['LOCKED', 'DISABLED'].includes(r._id))
        .reduce((s, r) => s + r.count, 0);

      return {
        from,
        to,
        timezone: zone,
        serverTime: now.toISOString(),
        sales: {
          created: salesCreated,
          completed: salesCompleted,
          active: salesActive,
          cancelled: salesCancelled,
          completionRateBps: computeRateBps(salesCompleted, salesCreated),
        },
        exchanges: {
          proposed: exProposed,
          completed: exCompleted,
          active: exActive,
          disputed: exDisputed,
          cancelled: exCancelled,
          completionRateBps: computeRateBps(exCompleted, exProposed),
        },
        auctions: {
          created: aucCreated,
          active: aucActive,
          sold: aucSold,
          paymentExpired: aucPaymentExpired,
          cancelled: aucCancelled,
          sellThroughRateBps: computeRateBps(aucSold, aucCreated),
        },
        risk: {
          openExchangeDisputes,
          openPointIncidents,
          incidentFundBalance: lastFundEntry?.balanceAfter ?? 0,
          incidentCompensationInPeriod: incidentCompRows[0]?.total ?? 0,
          underfundedIncidents,
        },
        users: {
          totalMembers,
          newInPeriod: newMembersInPeriod,
          activeMembers,
          restrictedMembers,
          lockedMembers,
        },
      };
    });
  }
}
