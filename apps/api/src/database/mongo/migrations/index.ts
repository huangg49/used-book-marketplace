import {
  exchangeCollectionSpecs,
  exchangesMigration,
} from './0016-exchanges.js';
import {
  exchangesPhase2Migration,
  withExchangePhase2Changes,
} from './0017-exchanges-phase2.js';
import {
  exchangesPhase3Migration,
  withExchangePhase3Changes,
} from './0018-exchanges-proposal-expiry.js';
import {
  exchangesPhase4Migration,
  withExchangePhase4Changes,
} from './0022-exchange-completion.js';
import {
  exchangeMessageSpecs,
  exchangeMessagesMigration,
} from './0023-exchange-messages.js';
import { createHash } from 'node:crypto';
import {
  catalogVocabularyV2Migration,
  withCatalogVocabularyV2,
} from './0019-catalog-vocabulary-v2.js';
import { authOtpMigration, authOtpSpecs } from './0018-auth-otp.js';
import {
  accountRecoveryMigration,
  accountRecoverySpecs,
} from './0017-account-recovery.js';
import type { Db, MongoClient } from 'mongodb';
import { canonicalJson } from '../../../common/canonical-json.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { baselineCollections } from './0001-baseline-schema.js';
import { insertReferenceData, referenceData } from './0002-reference-data.js';
import {
  backfillTitleKeys,
  catalogTitleKey,
  withTitleKey,
} from './0003-catalog-title-key.js';
import { wishlistMigration, wishlistSpec } from './0004-wishlist.js';
import { priceAssistMigration } from './0005-price-assist.js';
import {
  priceAssistSpecsV2,
  priceSuggestionInputMigration,
} from './0006-price-suggestion-input.js';
import {
  onlinePriceLookupMigration,
  onlinePriceSpecs,
} from './0007-online-price-lookup.js';
import {
  auctionCollectionSpecs,
  auctionsMigration,
  withAuctionChanges,
} from './0008-auctions.js';
import {
  pointOrderCollectionSpecs,
  pointOrdersMigration,
  withPointOrderChanges,
} from './0009-point-orders.js';
import {
  pointCollectionMigration,
  pointCollectionSpecs,
  withPointCollectionChanges,
} from './0010-point-collection.js';
import {
  pointOrderResolutionMigration,
  resolutionCollectionSpecs,
  withResolutionChanges,
} from './0011-point-order-resolution.js';
import {
  pointOrderSettlementMigration,
  settlementCollectionSpecs,
  withSettlementChanges,
} from './0012-point-order-settlement.js';
import {
  auctionBusinessRulesMigration,
  rulesCollectionSpecs,
  withRulesChanges,
} from './0013-auction-business-rules.js';
import {
  purchaseConversationSpecs,
  purchaseConversationsMigration,
  withPurchaseConversationChanges,
} from './0014-purchase-conversations.js';
import {
  memberNotificationsMigration,
  notificationSpecs,
  withNotificationChanges,
} from './0015-member-notifications.js';
import {
  catalogClassificationMigration,
  withCatalogClassification,
} from './0016-catalog-classification.js';
import {
  directDeliveryCompletionMigration,
  directDeliveryCompletionSpecs,
} from './0020-direct-delivery-completion.js';
import {
  directDeliveryCompletionLegacyShapeMigration,
  withDirectDeliveryCompletionLegacyShape,
} from './0021-direct-delivery-completion-legacy-shape.js';
import {
  pointAdministrationMigration,
  withPointAdministrationChanges,
} from './0022-point-administration.js';
import {
  inspectionEvidenceCollectionSpecs,
  inspectionEvidenceMigration,
  withInspectionEvidenceChanges,
} from './0023-inspection-evidence.js';
import {
  pointIncidentCollectionSpecs,
  pointIncidentsMigration,
} from './0024-point-incidents.js';
import {
  exchangeNotificationsMigration,
  withExchangeNotificationChanges,
} from './0024-exchange-notifications.js';
import {
  exchangeReviewsMigration,
  transactionReviewSpecs,
} from './0025-exchange-reviews.js';
import {
  exchangeMutualCompletionMigration,
  withExchangePhase5Changes,
} from './0026-exchange-mutual-completion.js';

export interface Migration {
  id: string;
  // Frozen content the checksum is computed from; editing an applied
  // migration makes the runner refuse to continue.
  definition: unknown;
  up(db: Db, client: MongoClient): Promise<void>;
}

export const validatorOf = (spec: CollectionSpec) => ({
  $jsonSchema: spec.schema,
  ...(spec.expr ? { $expr: spec.expr } : {}),
});

export async function applyCollectionSpecs(db: Db, specs: CollectionSpec[]) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
  );
  for (const spec of specs) {
    const options = {
      validator: validatorOf(spec),
      validationLevel: 'strict' as const,
      validationAction: 'error' as const,
    };
    if (existing.has(spec.name))
      await db.command({ collMod: spec.name, ...options });
    else await db.createCollection(spec.name, options);
    if (spec.indexes.length)
      await db.collection(spec.name).createIndexes(spec.indexes);
  }
}

export const migrations: Migration[] = [
  {
    id: '0001-baseline-schema',
    definition: baselineCollections,
    up: (db) => applyCollectionSpecs(db, baselineCollections),
  },
  {
    id: '0002-reference-data',
    definition: referenceData,
    async up(db, client) {
      const session = client.startSession();
      try {
        await session.withTransaction(() => insertReferenceData(db, session), {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        });
      } finally {
        await session.endSession();
      }
    },
  },
  {
    id: '0003-catalog-title-key',
    definition: catalogTitleKey,
    async up(db) {
      await backfillTitleKeys(db);
      await applyCollectionSpecs(
        db,
        baselineCollections
          .filter((spec) => spec.name === catalogTitleKey.collection)
          .map(withTitleKey),
      );
    },
  },
  wishlistMigration,
  priceAssistMigration,
  priceSuggestionInputMigration,
  onlinePriceLookupMigration,
  auctionsMigration,
  pointOrdersMigration,
  pointCollectionMigration,
  pointOrderResolutionMigration,
  pointOrderSettlementMigration,
  auctionBusinessRulesMigration,
  purchaseConversationsMigration,
  memberNotificationsMigration,
  catalogClassificationMigration,
  accountRecoveryMigration,
  authOtpMigration,
  catalogVocabularyV2Migration,
  exchangesMigration,
  exchangesPhase2Migration,
  exchangesPhase3Migration,
  directDeliveryCompletionMigration,
  directDeliveryCompletionLegacyShapeMigration,
  pointAdministrationMigration,
  inspectionEvidenceMigration,
  pointIncidentsMigration,
  exchangesPhase4Migration,
  exchangeMessagesMigration,
  exchangeNotificationsMigration,
  exchangeReviewsMigration,
  exchangeMutualCompletionMigration,
];

export const checksumOf = (migration: Migration) =>
  createHash('sha256')
    .update(canonicalJson(migration.definition))
    .digest('hex');

// The latest schema, for tests and for the app role privileges.
export const currentCollections = (): CollectionSpec[] => [
  ...baselineCollections
    .filter((spec) => spec.name !== 'direct_orders')
    .map(withTitleKey)
    .map(withAuctionChanges)
    .map(withPointOrderChanges)
    .map(withPointCollectionChanges)
    .map(withSettlementChanges)
    .map(withPurchaseConversationChanges)
    .map(withNotificationChanges)
    .map(withCatalogClassification)
    .map(withCatalogVocabularyV2)
    .map(withPointAdministrationChanges),
  ...baselineCollections
    .filter((spec) => spec.name === 'direct_orders')
    .map(withDirectDeliveryCompletionLegacyShape),
  wishlistSpec,
  ...priceAssistSpecsV2,
  ...onlinePriceSpecs,
  ...auctionCollectionSpecs
    .map(withPointOrderChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges)
    .map(withRulesChanges)
    .map(withPointAdministrationChanges)
    .map(withInspectionEvidenceChanges),
  ...pointOrderCollectionSpecs
    .map(withPointCollectionChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges),
  ...pointCollectionSpecs,
  ...resolutionCollectionSpecs.map(withSettlementChanges).map(withRulesChanges),
  ...settlementCollectionSpecs.map(withRulesChanges),
  ...rulesCollectionSpecs,
  ...purchaseConversationSpecs,
  ...notificationSpecs.map(withExchangeNotificationChanges),
  ...accountRecoverySpecs,
  ...authOtpSpecs,
  ...exchangeCollectionSpecs
    .map(withExchangePhase2Changes)
    .map(withExchangePhase3Changes)
    .map(withExchangePhase4Changes)
    .map(withExchangePhase5Changes),
  ...directDeliveryCompletionSpecs,
  ...exchangeMessageSpecs,
  ...transactionReviewSpecs,
  ...inspectionEvidenceCollectionSpecs,
  ...pointIncidentCollectionSpecs,
];
