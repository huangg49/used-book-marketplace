import type { Db, Document } from 'mongodb';
import type { WalletAccountDoc } from '../documents.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { withAuctionChanges } from './0008-auctions.js';
import { withPointOrderChanges } from './0009-point-orders.js';
import { withPointCollectionChanges } from './0010-point-collection.js';
import { withSettlementChanges } from './0012-point-order-settlement.js';
import { withPurchaseConversationChanges } from './0014-purchase-conversations.js';
import { withNotificationChanges } from './0015-member-notifications.js';
import { applyCollectionSpecs } from './index.js';
import {
  and,
  document,
  eq,
  f,
  isNull,
  nonNullCount,
  notNull,
  oneOf,
  or,
  t,
  unique,
  type CollectionSpec,
} from '../schema-dsl.js';

export const LISTING_FEE_CLEARING_ID = '00000000-0000-4000-8000-000000000022';
export const FEE_JOURNAL_TYPES = [
  'ListingFeeCharge',
  'ListingFeeRefund',
  'ListingFeeSettlement',
] as const;
export const paymentSpecs: CollectionSpec[] = [
  {
    name: 'listing_fees',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      listingId: t.uuid(),
      ownerId: t.uuid(),
      amount: t.int(1, 1_000_000),
      policyCode: t.enum('LISTING-FEE-v1'),
      createdAt: t.date(),
      receiptId: t.uuid(),
    }),
    indexes: [unique({ receiptId: 1 }, 'listing_fees_receipt_key')],
  },
  {
    name: 'vnpay_payments',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      tmnCode: t.str(8),
      createdAt: t.date(),
      expiresAt: t.date(),
      paymentUrl: t.str(3000),
      receiptId: t.uuid(),
    }),
    indexes: [unique({ receiptId: 1 }, 'vnpay_payments_receipt_key')],
  },
  {
    name: 'vnpay_transactions',
    access: 'appendOnly',
    schema: document({
      _id: t.str(32, '^[0-9]+$'),
      intentId: t.uuid(),
      eventId: t.uuid(),
      payDate: t.date(),
    }),
    indexes: [
      unique({ intentId: 1 }, 'vnpay_transactions_intent_key'),
      unique({ eventId: 1 }, 'vnpay_transactions_event_key'),
    ],
  },
];

export function withPayments(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'mutation_receipts' || spec.name === 'audit_events') {
    return {
      ...spec,
      expr: or(
        spec.expr,
        and(
          isNull('actorId'),
          eq(f('systemActor'), 'VNPaySandbox'),
          eq(
            f(spec.name === 'mutation_receipts' ? 'operation' : 'action'),
            'applyVNPayIpn',
          ),
          notNull('topupId'),
          eq(
            nonNullCount(
              'listingId',
              'bookId',
              'mediaId',
              'addressBookId',
              'quoteId',
              'contextId',
              'topupId',
            ),
            1,
          ),
          ...(spec.name === 'mutation_receipts'
            ? [eq(f('principal'), 'system:VNPaySandbox')]
            : []),
        ),
      ),
    };
  }
  if (spec.name === 'simulated_payment_events')
    return {
      ...spec,
      schema: document({
        ...(spec.schema.properties as Record<string, Document>),
        provider: t.enum('LatLaiSimulator-v1', 'VNPaySandbox-v1'),
      }),
    };
  if (spec.name === 'wallet_accounts')
    return {
      ...spec,
      schema: document({
        ...(spec.schema.properties as Record<string, Document>),
        purpose: t.enum(
          'UserAvailable',
          'OrderHold',
          'SimulatorCapital',
          'SimulatorClearing',
          'PlatformCommission',
          'ListingFeeClearing',
        ),
      }),
      expr: or(
        spec.expr,
        and(
          eq(f('_id'), LISTING_FEE_CLEARING_ID),
          eq(f('purpose'), 'ListingFeeClearing'),
          isNull('ownerId'),
          isNull('orderId'),
        ),
      ),
    };
  if (spec.name === 'ledger_journals') {
    const schema = document({
      ...(spec.schema.properties as Record<string, Document>),
      type: t.enum(
        'OpeningCapital',
        'Topup',
        'OrderPayment',
        'OrderRefund',
        'OrderSettlement',
        ...FEE_JOURNAL_TYPES,
      ),
      listingFeeId: t.nuuid(),
    });
    schema.required = (schema.required as string[]).filter(
      (x) => x !== 'listingFeeId',
    );
    return {
      ...spec,
      schema,
      expr: or(
        and(spec.expr, eq({ $ifNull: [f('listingFeeId'), null] }, null)),
        and(
          oneOf(f('type'), [...FEE_JOURNAL_TYPES]),
          notNull('listingFeeId'),
          isNull('topupId'),
          isNull('eventId'),
          isNull('orderId'),
          notNull('receiptId'),
        ),
      ),
      indexes: [
        ...spec.indexes,
        unique({ listingFeeId: 1, type: 1 }, 'ledger_listing_fee_type_key', {
          listingFeeId: { $type: 'string' },
        }),
      ],
    };
  }
  return spec;
}
const changedNames = new Set([
  'wallet_accounts',
  'ledger_journals',
  'simulated_payment_events',
  'mutation_receipts',
  'audit_events',
]);
const changedSpecs = baselineCollections
  .filter((x) => changedNames.has(x.name))
  .map(withAuctionChanges)
  .map(withPointOrderChanges)
  .map(withPointCollectionChanges)
  .map(withSettlementChanges)
  .map(withPurchaseConversationChanges)
  .map(withNotificationChanges)
  .map(withPayments);
export { changedSpecs as paymentChangedSpecs };
export const walletPaymentsMigration = {
  id: '0022-vnpay-wallet-listing-fees',
  definition: {
    changedSpecs,
    paymentSpecs,
    listingFeeClearingId: LISTING_FEE_CLEARING_ID,
  },
  async up(db: Db) {
    await applyCollectionSpecs(db, [...changedSpecs, ...paymentSpecs]);
    await db
      .collection<WalletAccountDoc>('wallet_accounts')
      .insertOne({
        _id: LISTING_FEE_CLEARING_ID,
        ownerId: null,
        orderId: null,
        purpose: 'ListingFeeClearing',
        currency: 'VND',
      });
  },
};
