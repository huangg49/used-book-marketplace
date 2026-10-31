import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, UUID_PATTERN } from '../schema-dsl.js';
import { exchangePhase6ChangedSpecs } from './0031-exchange-multi-book.js';
import { withExchangeInspectionDeadlines } from './0039-exchange-inspection-deadlines.js';

const OPTIONAL_EXCHANGE_FIELDS = new Set([
  'inspectionDeadline',
  'initiatorInspectionDeadline',
  'recipientInspectionDeadline',
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
  'resolutionDecision',
  'resolutionReason',
  'resolvedBy',
  'resolvedAt',
]);

export const withExchangeDisputeResolution = (
  spec: CollectionSpec,
): CollectionSpec => {
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
        'DisputeResolvedRefund',
        null,
      ],
    },
    cancelledBy: {
      bsonType: ['string', 'null'],
      enum: ['System', 'Initiator', 'Recipient', 'Staff', null],
    },
    resolutionDecision: {
      bsonType: ['string', 'null'],
      enum: ['RefundBoth', 'CompleteExchange', null],
    },
    resolutionReason: {
      bsonType: ['string', 'null'],
      maxLength: 500,
    },
    resolvedBy: {
      bsonType: ['string', 'null'],
      pattern: UUID_PATTERN,
    },
    resolvedAt: {
      bsonType: ['date', 'null'],
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
        key: { status: 1, disputedAt: -1 },
        name: 'exchanges_status_disputed_at_idx',
      },
    ],
  };
};

export const exchangeDisputeResolutionSpecs = exchangePhase6ChangedSpecs
  .map(withExchangeInspectionDeadlines)
  .map(withExchangeDisputeResolution);

export const exchangeDisputeResolutionMigration = {
  id: '0044-exchange-dispute-resolution',
  definition: { collections: exchangeDisputeResolutionSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangeDisputeResolutionSpecs);
  },
};

