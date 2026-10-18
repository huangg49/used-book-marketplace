import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, UUID_PATTERN } from '../schema-dsl.js';
import { exchangePhase5ChangedSpecs } from './0026-exchange-mutual-completion.js';
import { buyNowNotificationSpecs } from './0029-buy-now-notifications.js';

const OPTIONAL_EXCHANGE_FIELDS = new Set([
  'inspectionDeadline',
  'completedAt',
  'initiatorAddress',
  'recipientAddress',
  'initiatorShipment',
  'recipientShipment',
  'initiatorCompletedAt',
  'recipientCompletedAt',
  'initiatorListingIds',
  'lastProposedById',
  'shippingDeadline',
  'disputedAt',
  'disputeReason',
  'disputedBy',
]);

export const withExchangePhase6Changes = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name === 'member_notifications') {
    const existingProps = spec.schema.properties as Record<string, unknown>;
    const rawSchema = document({
      ...existingProps,
      kind: {
        bsonType: 'string',
        enum: [
          'AuctionOutbid',
          'AuctionWon',
          'AuctionSold',
          'AuctionBoughtNow',
          'AuctionUnsold',
          'AuctionCancelled',
          'AuctionOnHold',
          'AuctionPaymentExpired',
          'AuctionPaid',
          'ExchangeProposed',
          'ExchangeAccepted',
          'ExchangeFunded',
          'ExchangeShipped',
          'ExchangeReceived',
          'ExchangeCompleted',
          'ExchangeCancelled',
          'ExchangeRejected',
          'ExchangeDisputed',
          'OrderBuyNowPaid',
        ],
      },
      targetType: {
        bsonType: 'string',
        enum: ['Auction', 'Exchange', 'Order'],
      },
    });
    return {
      ...spec,
      schema: rawSchema,
    };
  }

  if (spec.name !== 'exchanges') return spec;
  const existingProps = spec.schema.properties as Record<string, unknown>;
  const rawSchema = document({
    ...existingProps,
    cancelReason: {
      bsonType: ['string', 'null'],
      enum: [
        'FundingExpired',
        'ProposalExpired',
        'CancelledByUser',
        'ListingUnavailable',
        'ShippingExpired',
        null,
      ],
    },
    initiatorListingIds: {
      bsonType: ['array', 'null'],
      items: {
        bsonType: 'string',
        pattern: UUID_PATTERN,
      },
    },
    lastProposedById: {
      bsonType: ['string', 'null'],
      pattern: UUID_PATTERN,
    },
    shippingDeadline: {
      bsonType: ['date', 'null'],
    },
    disputedAt: {
      bsonType: ['date', 'null'],
    },
    disputeReason: {
      bsonType: ['string', 'null'],
      maxLength: 500,
    },
    disputedBy: {
      bsonType: ['string', 'null'],
      pattern: '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|System)$',
    },
  });

  return {
    ...spec,
    schema: {
      ...rawSchema,
      required: (rawSchema.required as string[]).filter(
        (field) => !OPTIONAL_EXCHANGE_FIELDS.has(field),
      ),
    },
    indexes: [
      ...spec.indexes,
      {
        key: { status: 1, shippingDeadline: 1 },
        name: 'exchanges_status_shipping_deadline_idx',
      },
    ],
  };
};

export const exchangePhase6ChangedSpecs = [
  ...exchangePhase5ChangedSpecs.map(withExchangePhase6Changes),
  ...buyNowNotificationSpecs.map(withExchangePhase6Changes),
];

export const exchangeMultiBookMigration = {
  id: '0031-exchange-multi-book',
  definition: { collections: exchangePhase6ChangedSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangePhase6ChangedSpecs);
  },
};
