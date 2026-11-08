import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  gte,
  index,
  isNull,
  notNull,
  or,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';
import { MONEY_MAX } from './auction-constants.js';

// ADR 0077: bidder registration with a refundable deposit. A seller sets the
// minimum number of registered bidders (2–10) at intake; the published auction
// copies it with the deposit computed by policy. Registration holds the
// deposit in the ADR 0075 hold account for (auction, member), so one hold per
// member and auction covers max(deposit, commitment). Rows from before this
// migration keep the old rules: intakes get minBidders 2 (used by the next
// publish), auctions get null minBidders/depositAmount (no registration).
export const REGISTRATION_STATES = [
  'Registered',
  'Withdrawn',
  'Refunded',
  'Applied',
  'Forfeited',
] as const;
export const AUCTION_REGISTRATION_NOTIFICATIONS = [
  'AuctionBiddingStarted',
  'AuctionNotEnoughBidders',
  'AuctionDepositForfeited',
] as const;
export const DEPOSIT_FORFEIT_JOURNAL = 'AuctionDepositForfeit';
export const CLOSE_REASONS = ['NotEnoughBidders'] as const;

const money = {
  bsonType: ['int', 'long', 'double'],
  minimum: 10000,
  maximum: MONEY_MAX,
  multipleOf: 1,
};
const absent = (name: string) => eq({ $ifNull: [f(name), null] }, null);

export const registrationSpec: CollectionSpec = {
  name: 'auction_registrations',
  access: 'mutable',
  schema: document({
    _id: t.str(),
    auctionId: t.uuid(),
    userId: t.uuid(),
    deposit: money,
    state: t.enum(...REGISTRATION_STATES),
    createdAt: t.date(),
    updatedAt: t.date(),
    version: t.int(1),
    lockSeq: t.lockSeq(),
  }),
  expr: and(
    eq(f('_id'), { $concat: [f('auctionId'), ':', f('userId')] }),
    gte(f('updatedAt'), f('createdAt')),
  ),
  indexes: [
    index({ auctionId: 1, state: 1 }, 'auction_registrations_auction_idx'),
    index({ userId: 1, createdAt: -1 }, 'auction_registrations_user_idx'),
  ],
};

// biddingOpenedAt is set exactly when the registered count reaches the
// minimum (the Dutch clock starts there; withdrawals stop there).
const auctionRule = and(
  or(
    and(
      isNull('minBidders'),
      isNull('depositAmount'),
      eq(f('registeredCount'), 0),
      isNull('biddingOpenedAt'),
    ),
    and(
      notNull('minBidders'),
      notNull('depositAmount'),
      eq(
        { $lt: [f('registeredCount'), f('minBidders')] },
        isNull('biddingOpenedAt'),
      ),
    ),
  ),
  or(isNull('closeReason'), eq(f('state'), 'Unsold')),
);

// The earlier rule "Unsold has no bidders" gains one exception: an auction
// closed NotEnoughBidders keeps its (refunded) bidders for the record.
const UNSOLD_NO_BIDDERS = JSON.stringify(
  and(
    eq(f('state'), 'Unsold'),
    eq(f('bidderCount'), 0),
    gte(f('closedAt'), f('endAt')),
  ),
);
const unsoldWithReason = and(
  eq(f('state'), 'Unsold'),
  or(eq(f('bidderCount'), 0), eq(f('closeReason'), 'NotEnoughBidders')),
  gte(f('closedAt'), f('endAt')),
);
function relaxUnsold(x: unknown): { value: unknown; hits: number } {
  if (JSON.stringify(x) === UNSOLD_NO_BIDDERS)
    return { value: unsoldWithReason, hits: 1 };
  if (Array.isArray(x)) {
    let hits = 0;
    const value = x.map((v) => {
      const r = relaxUnsold(v);
      hits += r.hits;
      return r.value;
    });
    return { value, hits };
  }
  if (x && typeof x === 'object') {
    let hits = 0;
    const value: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      const r = relaxUnsold(v);
      hits += r.hits;
      value[k] = r.value;
    }
    return { value, hits };
  }
  return { value: x, hits: 0 };
}

export function withAuctionRegistration(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'auction_intakes')
    return {
      ...spec,
      schema: document({ ...properties, minBidders: t.int(2, 10) }),
    };
  if (spec.name === 'auctions') {
    const relaxed = relaxUnsold(spec.expr);
    if (relaxed.hits === 0) throw new Error('0066: Unsold rule not found');
    return {
      ...spec,
      schema: document({
        ...properties,
        minBidders: t.nint(2, 10),
        depositAmount: { ...money, bsonType: [...money.bsonType, 'null'] },
        registeredCount: t.int(0),
        biddingOpenedAt: t.ndate(),
        closeReason: t.nenum(...CLOSE_REASONS),
      }),
      expr: and(relaxed.value, auctionRule),
    };
  }
  if (spec.name === 'ledger_journals')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          type: {
            ...properties.type,
            enum: [...properties.type.enum, DEPOSIT_FORFEIT_JOURNAL],
          },
        },
      },
      expr: or(
        spec.expr!,
        and(
          eq(f('type'), DEPOSIT_FORFEIT_JOURNAL),
          notNull('auctionId'),
          notNull('receiptId'),
          isNull('topupId'),
          isNull('eventId'),
          isNull('orderId'),
          absent('listingFeeId'),
          absent('withdrawalId'),
        ),
      ),
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
            enum: [
              ...properties.kind.enum,
              ...AUCTION_REGISTRATION_NOTIFICATIONS,
            ],
          },
        },
      },
    };
  return spec;
}

const BACKFILLED = ['auction_intakes', 'auctions'];
const NAMES = [...BACKFILLED, 'ledger_journals', 'member_notifications'];
const NEW_FIELDS = [
  'minBidders',
  'depositAmount',
  'registeredCount',
  'biddingOpenedAt',
  'closeReason',
];

export function createAuctionRegistrationMigration(
  previous: CollectionSpec[],
) {
  const before = previous.filter((s) => NAMES.includes(s.name));
  const collections = [
    ...before.map(withAuctionRegistration),
    registrationSpec,
  ];
  // Accepts auction/intake rows without the new fields while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    if (!BACKFILLED.includes(spec.name)) return spec;
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('minBidders') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter(
          (field) => !NEW_FIELDS.includes(field),
        ),
      },
      expr: spec.expr
        ? or(old.expr ? and(missing, old.expr) : missing, spec.expr)
        : undefined,
    };
  });
  return {
    id: '0066-auction-registration',
    definition: { transition, collections, policy: 'auction-registration-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            await db
              .collection('auction_intakes')
              .updateMany(
                { minBidders: { $exists: false } },
                { $set: { minBidders: 2 } },
                { session },
              );
            await db.collection('auctions').updateMany(
              { minBidders: { $exists: false } },
              {
                $set: {
                  minBidders: null,
                  depositAmount: null,
                  registeredCount: 0,
                  biddingOpenedAt: null,
                  closeReason: null,
                },
              },
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
