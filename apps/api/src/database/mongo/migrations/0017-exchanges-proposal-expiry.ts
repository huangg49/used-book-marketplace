import type { Db } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { document, t, unique } from '../schema-dsl.js';
import { exchangePhase2ChangedSpecs } from './0016-exchanges-phase2.js';

const PROPOSAL_TTL_HOURS = 72;

export const withExchangePhase3Changes = (
  spec: CollectionSpec,
): CollectionSpec => {
  if (spec.name !== 'exchanges') return spec;
  const existingProps = spec.schema.properties as Record<string, unknown>;
  return {
    ...spec,
    schema: document({
      ...existingProps,
      proposalExpiresAt: t.ndate(),
      cancelReason: t.nenum(
        'FundingExpired',
        'ProposalExpired',
        'CancelledByUser',
        'ListingUnavailable',
      ),
    }),
    indexes: [
      ...spec.indexes,
      {
        key: { status: 1, proposalExpiresAt: 1 },
        name: 'exchanges_status_proposal_expires_idx',
      },
    ],
  };
};

export const exchangePhase3ChangedSpecs = exchangePhase2ChangedSpecs.map(
  withExchangePhase3Changes,
);

export const exchangesPhase3Migration = {
  id: '0017-exchanges-proposal-expiry',
  definition: { collections: exchangePhase3ChangedSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, exchangePhase3ChangedSpecs);

    // Backfill proposalExpiresAt for existing Proposed documents that don't have it.
    // Strategy: set proposalExpiresAt = createdAt + TTL_DEFAULT so old proposals are
    // given a grace deadline instead of being swept immediately.
    // Proposed docs older than TTL will be expired by the next worker tick, which is
    // the desired behaviour: stale proposals that were never responded to should close.
    await db.collection('exchanges').updateMany(
      { status: 'Proposed', proposalExpiresAt: { $exists: false } },
      [
        {
          $set: {
            proposalExpiresAt: {
              $dateAdd: {
                startDate: '$createdAt',
                unit: 'hour',
                amount: PROPOSAL_TTL_HOURS,
              },
            },
          },
        },
      ],
    );
  },
};
