import type { ClientSession, Db, Document, MongoClient } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  nonNullCount,
  or,
  type CollectionSpec,
} from '../schema-dsl.js';
import {
  CAPITAL_ACCOUNT_ID,
  CLEARING_ACCOUNT_ID,
  LEDGER_SEQUENCE_COUNTER,
  OPENING_CAPITAL,
} from './0002-reference-data.js';

// ADR 0067: the opening journal stays immutable; one more fixed, journaled
// simulator capital posting raises the total so uncapped auctions can be paid.
export const CAPITAL_INCREASE_JOURNAL_ID = '00000000-0000-4000-8000-000000000004';
export const SIMULATED_CAPITAL = 1_000_000_000_000;
export const CAPITAL_INCREASE = SIMULATED_CAPITAL - OPENING_CAPITAL;
// A simulator top-up may move the whole capital; VNPay's vnp_Amount (VND × 100)
// has at most 12 digits.
export const TOPUP_MAX = SIMULATED_CAPITAL;
export const VNPAY_TOPUP_MAX = 9_999_999_999;

const amount = (minimum: number, maximum: number) => ({
  bsonType: ['int', 'long', 'double'],
  minimum,
  maximum,
  multipleOf: 1,
});

export function withCapitalIncrease(spec: CollectionSpec): CollectionSpec {
  const properties = spec.schema.properties as Record<string, Document>;
  if (spec.name === 'ledger_journals') {
    const schema = document({
      ...properties,
      type: {
        ...properties.type,
        enum: [...(properties.type.enum as string[]), 'CapitalIncrease'],
      },
    });
    schema.required = spec.schema.required;
    return {
      ...spec,
      schema,
      expr: or(
        spec.expr!,
        and(
          eq(f('type'), 'CapitalIncrease'),
          eq(nonNullCount('topupId', 'eventId', 'orderId', 'receiptId'), 0),
          eq({ $ifNull: [f('listingFeeId'), null] }, null),
          eq(f('_id'), CAPITAL_INCREASE_JOURNAL_ID),
        ),
      ),
    };
  }
  if (spec.name === 'topup_intents' || spec.name === 'simulated_payment_events')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          amount: amount(properties.amount.minimum as number, TOPUP_MAX),
        },
      },
    };
  return spec;
}

// Idempotent: posted once, after every journal already in the database.
export async function postCapitalIncrease(db: Db, session?: ClientSession) {
  const s = session ? { session } : {};
  if (
    await db
      .collection('ledger_journals')
      .findOne({ _id: CAPITAL_INCREASE_JOURNAL_ID } as never, s)
  )
    return;
  const counter = await db
    .collection<{ _id: string; value: number }>('counters')
    .findOneAndUpdate(
      { _id: LEDGER_SEQUENCE_COUNTER },
      { $inc: { value: 1 } },
      { returnDocument: 'after', ...s },
    );
  const [{ now }] = await db
    .aggregate<{ now: Date }>(
      [{ $documents: [{}] }, { $project: { _id: 0, now: '$$NOW' } }],
      s,
    )
    .toArray();
  await db.collection('ledger_journals').insertOne(
    {
      _id: CAPITAL_INCREASE_JOURNAL_ID,
      sequence: counter!.value,
      type: 'CapitalIncrease',
      topupId: null,
      eventId: null,
      orderId: null,
      receiptId: null,
      postedAt: now,
    } as never,
    s,
  );
  await db.collection('ledger_entries').insertMany(
    [
      { accountId: CAPITAL_ACCOUNT_ID, debit: 0, credit: CAPITAL_INCREASE },
      { accountId: CLEARING_ACCOUNT_ID, debit: CAPITAL_INCREASE, credit: 0 },
    ].map((entry) => ({
      _id: `${CAPITAL_INCREASE_JOURNAL_ID}:${entry.accountId}`,
      journalId: CAPITAL_INCREASE_JOURNAL_ID,
      ...entry,
    })) as never[],
    s,
  );
}

export function createCapitalIncreaseMigration(previous: CollectionSpec[]) {
  const collections = previous.map(withCapitalIncrease);
  return {
    id: '0055-simulator-capital-increase',
    definition: {
      collections,
      capitalIncrease: CAPITAL_INCREASE,
      journalId: CAPITAL_INCREASE_JOURNAL_ID,
    },
    async up(db: Db, client: MongoClient) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
      const session = client.startSession();
      try {
        await session.withTransaction(() => postCapitalIncrease(db, session), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        });
      } finally {
        await session.endSession();
      }
    },
  };
}
