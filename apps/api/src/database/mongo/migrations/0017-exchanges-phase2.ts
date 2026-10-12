import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t, unique } from '../schema-dsl.js';
import { exchangeCollectionSpecs } from './0016-exchanges.js';

export const withExchangePhase2Changes = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'exchanges') return spec;
  const existingProps = spec.schema.properties as Record<string, unknown>;
  return {
    ...spec,
    schema: document({
      ...existingProps,
      lockSeq: t.lockSeq(),
      initiatorOrderId: t.uuid(),
      recipientOrderId: t.uuid(),
      fundingDeadline: t.ndate(),
      initiatorFundedAt: t.ndate(),
      recipientFundedAt: t.ndate(),
      rejectionReason: t.nstr(),
      cancelReason: t.nenum('FundingExpired', 'CancelledByUser', 'ListingUnavailable'),
      cancelledBy: t.nenum('System', 'Initiator', 'Recipient'),
      cancelledAt: t.ndate(),
      initiatorShippedAt: t.ndate(),
      recipientShippedAt: t.ndate(),
      initiatorReceivedAt: t.ndate(),
      recipientReceivedAt: t.ndate(),
    }),
    indexes: [
      ...spec.indexes,
      unique({ initiatorOrderId: 1 }, 'exchanges_initiator_order_id_key'),
      unique({ recipientOrderId: 1 }, 'exchanges_recipient_order_id_key'),
      {
        key: { status: 1, fundingDeadline: 1 },
        name: 'exchanges_status_funding_deadline_idx',
      },
    ],
  };
};

export const exchangePhase2ChangedSpecs = exchangeCollectionSpecs.map(
  withExchangePhase2Changes,
);

export const exchangesPhase2Migration = {
  id: '0017-exchanges-phase2',
  definition: { collections: exchangePhase2ChangedSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangePhase2ChangedSpecs);
  },
};
