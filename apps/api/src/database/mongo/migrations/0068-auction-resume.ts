import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  f,
  isNull,
  notNull,
  or,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';

// ADR 0080: an Admin resumes an OnHold auction at most once. resumedAt records
// that resume (null until then) and needs the hold it ended (heldAt). Every
// stored deadline stays as it was, so no new time rule is needed here.
export const AUCTION_RESUME_NOTIFICATIONS = ['AuctionResumed'] as const;

const resumeRule = or(isNull('resumedAt'), notNull('heldAt'));

export function withAuctionResume(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'auctions')
    return {
      ...spec,
      schema: document({ ...properties, resumedAt: t.ndate() }),
      expr: spec.expr ? and(spec.expr, resumeRule) : resumeRule,
    };
  if (spec.name === 'member_notifications')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: {
            ...properties.kind,
            enum: [...properties.kind.enum, ...AUCTION_RESUME_NOTIFICATIONS],
          },
        },
      },
    };
  return spec;
}

const NAMES = ['auctions', 'member_notifications'];

export function createAuctionResumeMigration(previous: CollectionSpec[]) {
  const before = previous.filter((s) => NAMES.includes(s.name));
  const collections = before.map(withAuctionResume);
  // Accepts auction rows without resumedAt while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    if (spec.name !== 'auctions') return spec;
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('resumedAt') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => field !== 'resumedAt',
        ),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr),
    };
  });
  return {
    id: '0068-auction-resume',
    definition: { transition, collections, policy: 'auction-resume-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            await db
              .collection('auctions')
              .updateMany(
                { resumedAt: { $exists: false } },
                { $set: { resumedAt: null } },
                { session },
              );
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
          },
        );
      } finally {
        await session.endSession();
      }
      await applyCollectionSpecs(db, collections);
    },
  };
}
