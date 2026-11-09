import type { Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  gte,
  index,
  isNull,
  lte,
  ne,
  notNull,
  or,
  plusMs,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';
import { AUCTION_PAYMENT_MS, MONEY_MAX } from './auction-constants.js';

// ADR 0086 (H5, H1): when the winner does not pay, the runner-up (the other
// bidder with the highest level) is offered the book once at their own level
// for 24 h (SecondChanceOffered). Accepting forms a second ViaPoint Order for
// them; declining or letting it expire ends the auction PaymentExpired. A
// report can also cancel an auction whose winner has not paid: its Order
// closes Cancelled without a payment.
//
// auctions:
// - state SecondChanceOffered; runnerUpId/Price/Deadline/Outcome and
//   defaultedOrderId (the first winner's expired Order);
// - the winner fields stay set while the offer runs and on a Cancelled
//   auction (a report closed it after the close);
// - AwaitingWinnerPayment also holds an accepted offer: the runner-up is the
//   winner at their level, paying within 24 h of accepting.
// point_orders: one Order per auction and buyer (was one per auction), and an
// unpaid Cancelled shape. member_notifications: AuctionSecondChanceOffered.
export const SECOND_CHANCE_OUTCOMES = [
  'Offered',
  'Accepted',
  'Declined',
  'Expired',
  'Cancelled',
] as const;
export const SECOND_CHANCE_NOTIFICATIONS = ['AuctionSecondChanceOffered'] as const;
export const SECOND_CHANCE_MS = 24 * 3_600_000;

const WINNER_STATES = ['BuyNowPending', 'AwaitingWinnerPayment', 'Sold', 'PaymentExpired'];
const OLD_WINNER = and(
  notNull('winnerId'),
  notNull('finalPrice'),
  notNull('paymentDeadline'),
  ne(f('winnerId'), f('sellerId')),
  { $in: [f('state'), WINNER_STATES] },
);
const NEW_WINNER = and(
  notNull('winnerId'),
  notNull('finalPrice'),
  notNull('paymentDeadline'),
  ne(f('winnerId'), f('sellerId')),
  { $in: [f('state'), [...WINNER_STATES, 'SecondChanceOffered', 'Cancelled']] },
);
const OLD_AWAITING = and(
  eq(f('state'), 'AwaitingWinnerPayment'),
  notNull('orderId'),
  eq(f('winnerId'), f('leaderId')),
  eq(f('finalPrice'), f('currentPrice')),
  eq(f('paymentDeadline'), plusMs('endAt', AUCTION_PAYMENT_MS)),
  gte(f('closedAt'), f('endAt')),
);
const NEW_AWAITING = or(
  and(OLD_AWAITING, isNull('runnerUpOutcome')),
  and(
    eq(f('state'), 'AwaitingWinnerPayment'),
    notNull('orderId'),
    eq(f('runnerUpOutcome'), 'Accepted'),
    eq(f('winnerId'), f('runnerUpId')),
    eq(f('finalPrice'), f('runnerUpPrice')),
    gte(f('paymentDeadline'), f('runnerUpOfferedAt')),
    lte(f('paymentDeadline'), plusMs('runnerUpDeadline', AUCTION_PAYMENT_MS)),
  ),
);
const OFFERED = and(
  eq(f('state'), 'SecondChanceOffered'),
  notNull('closedAt'),
  notNull('orderId'),
  eq(f('runnerUpOutcome'), 'Offered'),
  eq(f('orderId'), f('defaultedOrderId')),
);
const OLD_PAYMENT_EXPIRED = and(eq(f('state'), 'PaymentExpired'), notNull('closedAt'));
const NEW_STATE_RULES = or(OLD_PAYMENT_EXPIRED, OFFERED);
const runnerUpRule = or(
  and(
    isNull('runnerUpId'),
    isNull('runnerUpPrice'),
    isNull('runnerUpDeadline'),
    isNull('runnerUpOutcome'),
    isNull('runnerUpOfferedAt'),
    isNull('defaultedOrderId'),
  ),
  and(
    notNull('runnerUpId'),
    notNull('runnerUpPrice'),
    notNull('runnerUpDeadline'),
    notNull('runnerUpOutcome'),
    notNull('runnerUpOfferedAt'),
    notNull('defaultedOrderId'),
    ne(f('runnerUpId'), f('sellerId')),
    gte(f('runnerUpPrice'), f('startPrice')),
    gte(f('runnerUpOfferedAt'), f('closedAt')),
    eq(f('runnerUpDeadline'), plusMs('runnerUpOfferedAt', SECOND_CHANCE_MS)),
  ),
);
const replacements: [unknown, unknown][] = [
  [OLD_WINNER, NEW_WINNER],
  [OLD_AWAITING, NEW_AWAITING],
  [OLD_PAYMENT_EXPIRED, NEW_STATE_RULES],
];

const OLD_ORDER_CANCELLED_PREFIX = { $eq: ['$state', 'Cancelled'] };
const unpaidCancelled = and(
  eq(f('state'), 'Cancelled'),
  eq(f('version'), 2),
  isNull('paidAt'),
  notNull('closedAt'),
  gte(f('closedAt'), f('createdAt')),
);

function replace(x: unknown, from: string, to: unknown): { value: unknown; hits: number } {
  if (JSON.stringify(x) === from) return { value: to, hits: 1 };
  if (Array.isArray(x)) {
    let hits = 0;
    const value = x.map((v) => {
      const r = replace(v, from, to);
      hits += r.hits;
      return r.value;
    });
    return { value, hits };
  }
  if (x && typeof x === 'object') {
    let hits = 0;
    const value: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      const r = replace(v, from, to);
      hits += r.hits;
      value[k] = r.value;
    }
    return { value, hits };
  }
  return { value: x, hits: 0 };
}

// The paid Cancelled branch of the order state $or gains an unpaid sibling.
function addUnpaidCancelled(expr: unknown): { value: unknown; hits: number } {
  if (Array.isArray(expr)) {
    let hits = 0;
    const value: unknown[] = [];
    for (const v of expr) {
      const r = addUnpaidCancelled(v);
      hits += r.hits;
      value.push(r.value);
    }
    return { value, hits };
  }
  if (expr && typeof expr === 'object') {
    const o = expr as Record<string, unknown>;
    if (Array.isArray(o.$or)) {
      const branches = o.$or as unknown[];
      const paid = branches.findIndex((b) => {
        const and = (b as { $and?: unknown[] })?.$and;
        return (
          Array.isArray(and) &&
          JSON.stringify(and[0]) === JSON.stringify(OLD_ORDER_CANCELLED_PREFIX) &&
          JSON.stringify(and).includes('"$resolutionReason"')
        );
      });
      if (paid >= 0) return { value: { $or: [...branches, unpaidCancelled] }, hits: 1 };
    }
    let hits = 0;
    const value: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const r = addUnpaidCancelled(v);
      hits += r.hits;
      value[k] = r.value;
    }
    return { value, hits };
  }
  return { value: expr, hits: 0 };
}

const nmoney = { bsonType: ['int', 'long', 'double', 'null'], maximum: MONEY_MAX, multipleOf: 1 };

export function withAuctionSecondChance(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'auctions') {
    let expr: unknown = spec.expr;
    for (const [from, to] of replacements) {
      const r = replace(expr, JSON.stringify(from), to);
      if (r.hits !== 1)
        throw new Error(`0074: expected one rule ${JSON.stringify(from)}, found ${r.hits}`);
      expr = r.value;
    }
    const properties = spec.schema.properties as Record<string, Document>;
    return {
      ...spec,
      schema: document({
        ...properties,
        state: t.enum(...(properties.state.enum as string[]), 'SecondChanceOffered'),
        runnerUpId: t.nuuid(),
        runnerUpPrice: nmoney,
        runnerUpDeadline: t.ndate(),
        runnerUpOutcome: t.nenum(...SECOND_CHANCE_OUTCOMES),
        runnerUpOfferedAt: t.ndate(),
        defaultedOrderId: t.nuuid(),
      }),
      expr: and(expr as Document, runnerUpRule),
      indexes: [
        ...spec.indexes,
        index({ state: 1, runnerUpDeadline: 1 }, 'auctions_state_runner_up_deadline_idx'),
      ],
    };
  }
  if (spec.name === 'point_orders') {
    const r = addUnpaidCancelled(spec.expr);
    if (r.hits !== 1) throw new Error(`0074: expected one paid Cancelled order rule, found ${r.hits}`);
    return {
      ...spec,
      expr: r.value as Document,
      indexes: [
        ...spec.indexes.filter((i) => i.name !== 'point_orders_auction_id_key'),
        unique({ auctionId: 1, buyerId: 1 }, 'point_orders_auction_buyer_key'),
      ],
    };
  }
  if (spec.name === 'member_notifications') {
    const properties = spec.schema.properties as Record<string, Document>;
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: { ...properties.kind, enum: [...(properties.kind.enum as string[]), ...SECOND_CHANCE_NOTIFICATIONS] },
        },
      },
    };
  }
  return spec;
}

const NEW_FIELDS = ['runnerUpId', 'runnerUpPrice', 'runnerUpDeadline', 'runnerUpOutcome', 'runnerUpOfferedAt', 'defaultedOrderId'];

export function createAuctionSecondChanceMigration(previous: CollectionSpec[]) {
  const names = ['auctions', 'point_orders', 'member_notifications'];
  const before = previous.filter((s) => names.includes(s.name));
  if (before.length !== names.length) throw new Error('0074: missing a predecessor spec');
  const collections = before.map(withAuctionSecondChance);
  // Accepts auction rows without the new fields while they are backfilled.
  const transition = collections.map((spec): CollectionSpec => {
    if (spec.name !== 'auctions') return spec;
    const old = before.find((s) => s.name === spec.name)!;
    const missing = { $eq: [{ $type: f('runnerUpOutcome') }, 'missing'] };
    return {
      ...spec,
      schema: {
        ...spec.schema,
        required: (spec.schema.required as string[]).filter((field) => !NEW_FIELDS.includes(field)),
      },
      expr: or(old.expr ? and(missing, old.expr) : missing, spec.expr),
      indexes: spec.indexes,
    };
  });
  return {
    id: '0074-auction-second-chance',
    definition: { transition, collections, policy: 'auction-second-chance-v1' },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      // The per-buyer key replaces the per-auction one; existing rows have one
      // Order per auction, so they satisfy it.
      await db.collection('point_orders').createIndex({ auctionId: 1, buyerId: 1 }, { name: 'point_orders_auction_buyer_key', unique: true });
      const indexes = await db.collection('point_orders').indexes();
      if (indexes.some((i) => i.name === 'point_orders_auction_id_key'))
        await db.collection('point_orders').dropIndex('point_orders_auction_id_key');
      await applyCollectionSpecs(db, transition);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            await db.collection('auctions').updateMany(
              { runnerUpOutcome: { $exists: false } },
              {
                $set: {
                  runnerUpId: null,
                  runnerUpPrice: null,
                  runnerUpDeadline: null,
                  runnerUpOutcome: null,
                  runnerUpOfferedAt: null,
                  defaultedOrderId: null,
                },
              },
              { session },
            );
          },
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
        );
      } finally {
        await session.endSession();
      }
      await applyCollectionSpecs(db, collections);
    },
  };
}
