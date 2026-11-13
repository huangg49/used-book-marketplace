import type { Db } from 'mongodb';
import {
  and,
  document,
  eq,
  f,
  isNull,
  notNull,
  or,
  t,
  type CollectionSpec,
} from '../schema-dsl.js';

const returnResolution = document({
  phase: t.enum(
    'Evidence',
    'ReturnOrdered',
    'ReturnInProgress',
    'CheckingReturn',
    'ReturnIssue',
    'CompensationOrdered',
    'NeedsReview',
    'Closed',
  ),
  note: t.str(500),
  evidenceDueAt: t.ndate(),
  appealDueAt: t.ndate(),
  appeals: {
    bsonType: 'array',
    maxItems: 2,
    items: document({ by: t.uuid(), note: t.str(500) }),
  },
  decisionBy: t.nuuid(),
  effectiveAt: t.ndate(),
  returnDueAt: t.ndate(),
  trackingCode: t.nstr(80),
  dispatchedAt: t.ndate(),
  returnedAt: t.ndate(),
  checkDueAt: t.ndate(),
  outcome: t.nenum('Returned', 'Compensated'),
  settlementReceiptId: t.nuuid(),
  evidenceId: t.nuuid(),
});

export function withExchangeReturnResolution(
  spec: CollectionSpec,
): CollectionSpec {
  const properties = spec.schema.properties as Record<
    string,
    Record<string, unknown>
  >;
  if (spec.name === 'exchanges') {
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: { ...properties, returnResolution },
      },
      expr: and(
        spec.expr!,
        or(
          eq({ $type: f('returnResolution') }, 'missing'),
          and(
            eq(f('returnResolution.phase'), 'Closed'),
            eq(f('status'), 'Cancelled'),
            notNull('returnResolution.outcome'),
            notNull('returnResolution.settlementReceiptId'),
          ),
          and(
            { $ne: [f('returnResolution.phase'), 'Closed'] },
            eq(f('status'), 'ResolutionPending'),
            isNull('returnResolution.outcome'),
            isNull('returnResolution.settlementReceiptId'),
          ),
        ),
      ),
    };
  }
  if (spec.name === 'member_violations') {
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...properties,
          kind: t.enum(
            'AuctionNonPayment',
            'PointOrderBuyerDefault',
            'ExchangeReturnDefault',
          ),
        },
      },
    };
  }
  if (spec.name !== 'ledger_journals') return spec;
  const kinds = ['ExchangeReturnRefund', 'ExchangeNonReturnCompensation'];
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...properties,
        type: t.enum(...(properties.type.enum as string[]), ...kinds),
      },
    },
    expr: or(
      spec.expr!,
      and(
        { $in: [f('type'), kinds] },
        notNull('orderId'),
        notNull('receiptId'),
        isNull('topupId'),
        isNull('eventId'),
        ...['auctionId', 'listingFeeId', 'withdrawalId'].map((key) =>
          eq({ $ifNull: [f(key), null] }, null),
        ),
      ),
    ),
  };
}

export function createExchangeReturnMigration(previous: CollectionSpec[]) {
  const collections = previous.map(withExchangeReturnResolution);
  return {
    id: '0077-exchange-return-resolution',
    definition: { collections },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
    },
  };
}
