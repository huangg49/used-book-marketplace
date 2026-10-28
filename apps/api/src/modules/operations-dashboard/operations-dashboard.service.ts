import { Injectable } from '@nestjs/common';
import type { Document } from 'mongodb';
import {
  MongoCommandService,
  reviewer,
  type Actor,
} from '../commands/mongo-command.service.js';
import { invalidField, type Wire } from '../commands/domain-error.js';

const zone = 'Asia/Ho_Chi_Minh';
const dayMs = 86_400_000;
type Day = Wire['ModerationOverview']['daily'][number];
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
}
