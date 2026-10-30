import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document } from '../schema-dsl.js';
import { exchangeDisputeResolutionSpecs } from './0044-exchange-dispute-resolution.js';

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
  'cancellationRequestedBy',
  'cancellationRequestedAt',
]);

export const withExchangeMutualCancellation = (
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
        'MutualAgreement',
        null,
      ],
    },
    cancelledBy: {
      bsonType: ['string', 'null'],
      enum: ['System', 'Initiator', 'Recipient', 'Staff', 'Both', null],
    },
    cancellationRequestedBy: {
      bsonType: ['string', 'null'],
      enum: ['Initiator', 'Recipient', null],
    },
    cancellationRequestedAt: {
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
  };
};

export const exchangeMutualCancellationSpecs = exchangeDisputeResolutionSpecs.map(
  withExchangeMutualCancellation,
);

export const exchangeMutualCancellationMigration = {
  id: '0045-exchange-mutual-cancellation',
  definition: { collections: exchangeMutualCancellationSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangeMutualCancellationSpecs);
  },
};
