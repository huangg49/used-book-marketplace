import { Injectable } from '@nestjs/common';
import type { Document } from 'mongodb';
import {
  MongoCommandService,
  reviewer,
  type Actor,
} from '../commands/mongo-command.service.js';
import { invalidField, type Wire } from '../commands/domain-error.js';
import { PLATFORM_COMMISSION_ACCOUNT_ID } from '../../database/mongo/migrations/auction-constants.js';

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
  constructor(private readonly commands: MongoCommandService) {}
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
      };
    });
  }
}
