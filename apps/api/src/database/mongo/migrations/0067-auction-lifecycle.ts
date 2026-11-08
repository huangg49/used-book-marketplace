import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  index,
  isNull,
  lte,
  ne,
  notNull,
  oneOf,
  or,
  plusMs,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  AUCTION_MIN_BIDDERS_CAP,
  AUCTION_READY_WINDOW_MS,
  AUCTION_START_CEILING_MS,
} from './auction-constants.js';
import { CLOSE_REASONS as REGISTRATION_CLOSE_REASONS } from './0066-auction-registration.js';

// ADR 0079: a bounded registration lifecycle. A registration auction is
// published in one of two open modes and its waiting phase ends at a ceiling
// measured from the fixed publishedAt:
// - WhenReady: startAt = publishedAt + 24 h until the minimum is reached, then
//   it opens at once (startAt = that moment);
// - Scheduled: the seller's startAt, at most publishedAt + 72 h.
// Too few registrants at startAt cancels the auction. OnHold stores heldAt and
// auto-cancels 48 h later. Rows from before this migration keep openMode null
// (ADR 0077 rules) and OnHold rows get heldAt = updatedAt.
export const OPEN_MODES = ['WhenReady', 'Scheduled'] as const;
export const LIFECYCLE_CANCEL_REASONS = [
  'RegistrationExpired',
  'SellerClosed',
  'HoldExpired',
  'Reported',
] as const;
export const CLOSE_REASONS = [
  ...REGISTRATION_CLOSE_REASONS,
  ...LIFECYCLE_CANCEL_REASONS,
] as const;
export const AUCTION_LIFECYCLE_NOTIFICATIONS = ['AuctionRescheduled'] as const;

// 0066 allowed a closeReason only on Unsold; the new reasons are cancellations.
const OLD_CLOSE_RULE = JSON.stringify(
  or(isNull('closeReason'), eq(f('state'), 'Unsold')),
);
const closeRule = or(
  isNull('closeReason'),
  and(eq(f('closeReason'), 'NotEnoughBidders'), eq(f('state'), 'Unsold')),
  and(
    oneOf(f('closeReason'), [...LIFECYCLE_CANCEL_REASONS]),
    eq(f('state'), 'Cancelled'),
  ),
);
function replaceCloseRule(x: unknown): { value: unknown; hits: number } {
  if (JSON.stringify(x) === OLD_CLOSE_RULE) return { value: closeRule, hits: 1 };
  if (Array.isArray(x)) {
    let hits = 0;
    const value = x.map((v) => {
      const r = replaceCloseRule(v);
      hits += r.hits;
      return r.value;
    });
    return { value, hits };
  }
  if (x && typeof x === 'object') {
    let hits = 0;
    const value: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      const r = replaceCloseRule(v);
      hits += r.hits;
      value[k] = r.value;
    }
    return { value, hits };
  }
  return { value: x, hits: 0 };
}

const lifecycleRule = and(
  // An open mode exists only on registration auctions.
  or(isNull('openMode'), notNull('minBidders')),
  // The fixed ceilings: the start never moves past them.
  or(
    ne(f('openMode'), 'WhenReady'),
    lte(f('startAt'), plusMs('publishedAt', AUCTION_READY_WINDOW_MS)),
  ),
  or(
    ne(f('openMode'), 'Scheduled'),
    lte(f('startAt'), plusMs('publishedAt', AUCTION_START_CEILING_MS)),
  ),
  // OnHold always knows when it was held (the 48 h ceiling counts from it).
  or(ne(f('state'), 'OnHold'), notNull('heldAt')),
);

export function withAuctionLifecycle(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'auction_intakes')
    return {
      ...spec,
      schema: document({
        ...properties,
        minBidders: t.int(2, AUCTION_MIN_BIDDERS_CAP),
      }),
    };
  if (spec.name === 'auctions') {
    const replaced = replaceCloseRule(spec.expr);
    if (replaced.hits !== 1) throw new Error('0067: close reason rule not found');
    return {
      ...spec,
      schema: document({
        ...properties,
        minBidders: t.nint(2, AUCTION_MIN_BIDDERS_CAP),
        closeReason: t.nenum(...CLOSE_REASONS),
        openMode: t.nenum(...OPEN_MODES),
        heldAt: t.ndate(),
      }),
      expr: and(replaced.value, lifecycleRule),
      indexes: [
        ...(spec.indexes ?? []),
        index({ state: 1, heldAt: 1 }, 'auctions_state_held_at_idx'),
      ],
    };
  }
  if (spec.name === 'member_notifications')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: {
            ...properties.kind,
            enum: [...properties.kind.enum, ...AUCTION_LIFECYCLE_NOTIFICATIONS],
          },
        },
      },
    };
  return spec;
}

const NAMES = ['auction_intakes', 'auctions', 'member_notifications'];
const NEW_FIELDS = ['openMode', 'heldAt'];

export function createAuctionLifecycleMigration(previous: CollectionSpec[]) {
  const before = previous.filter((s) => NAMES.includes(s.name));
  const collections = before.map(withAuctionLifecycle);
  // Accepts auction rows without the new fields while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    if (spec.name !== 'auctions') return spec;
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('openMode') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => !NEW_FIELDS.includes(field),
        ),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr),
    };
  });
  return {
    id: '0067-auction-lifecycle',
    definition: { transition, collections, policy: 'auction-lifecycle-v1' },
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
                { openMode: { $exists: false } },
                [
                  {
                    $set: {
                      openMode: null,
                      heldAt: {
                        $cond: [{ $eq: ['$state', 'OnHold'] }, '$updatedAt', null],
                      },
                    },
                  },
                ],
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
