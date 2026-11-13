import { createMessageSendLimitsMigration, withMessageSendLimits } from './0062-message-send-limits.js';
import { createBuyNowModeMigration, withBuyNowMode } from './0063-auction-buy-now-mode.js';
import { createAuctionTypesMigration, withAuctionTypes } from './0065-auction-types.js';
import { createAuctionRegistrationMigration, registrationSpec, withAuctionRegistration } from './0066-auction-registration.js';
import { createAuctionLifecycleMigration, withAuctionLifecycle } from './0067-auction-lifecycle.js';
import { createAuctionResumeMigration, withAuctionResume } from './0068-auction-resume.js';
import { createAuctionScheduledOpenMigration, withAuctionScheduledOpen } from './0069-auction-scheduled-open.js';
import { createAuctionOpenMonthMigration, withAuctionOpenMonth } from './0070-auction-open-month.js';
import { createSupportTargetIndexMigration, withSupportTargetIndex } from './0071-support-target-index.js';
import { createAuctionPauseBudgetMigration, withAuctionPauseBudget } from './0072-auction-pause-budget.js';
import { createAuctionReachedNoticeMigration, withAuctionReachedNotice } from './0073-auction-reached-notice.js';
import { createAuctionSecondChanceMigration, withAuctionSecondChance } from './0074-auction-second-chance.js';
import { createAuctionDepositShareMigration, withAuctionDepositShare } from './0075-auction-deposit-share.js';
import { createExchangeReturnMigration, withExchangeReturnResolution } from './0077-exchange-return-resolution.js';
import { createExchangeOutboundDeliveryMigration, withExchangeOutboundDeliveryVerification } from './0078-exchange-outbound-delivery-verification.js';
import { createExchangeDemoArchiveMigration, withExchangeDemoArchive } from './0079-exchange-demo-archive.js';
import { onlinePriceCatalogRevisionMigration, withOnlinePriceCatalogRevision } from './0076-online-price-catalog-revision.js';
import { createAuctionBidHoldsMigration, withAuctionBidHolds } from './0064-auction-bid-holds.js';
import { withdrawalProofMigration, withdrawalProofSpecs, withWithdrawalProofReference } from './0063-withdrawal-proofs.js';
import { withdrawalProofReferenceMigration } from './0064-withdrawal-proof-reference.js';
import { manualWithdrawalsMigration, withManualWithdrawals } from './0061-manual-wallet-withdrawals.js';
import { createWithdrawalsMigration, withdrawalSpecs, withWithdrawals } from './0060-wallet-withdrawals.js';
import { autoReviewV2UpgradeBridgeMigration } from './0056-auto-review-v2-upgrade-bridge.js';
import { exchangeEvidenceMigration, exchangeEvidenceSpecs } from './0054-exchange-evidence.js';
import { createLocalDemoCompletionMigration, demoCompletionSpec, withLocalDemoCompletion } from './0054-local-demo-completion.js';
import { createFreeShippingMigration, withFreeShipping } from './0052-free-shipping.js';
import { createMemberProfilesMigration, memberProfileSpecs, withMemberProfiles } from './0047-member-profiles.js';
import { createAccountControlsMigration, withAccountControls } from './0048-account-controls.js';
import {memberCartMigration,memberCartSpec} from './0049-member-cart.js';
import { exchangeAgreementMigration } from './0053-exchange-agreement.js';
import { exchangeNegotiatedDiffMigration } from './0054-exchange-negotiated-diff.js';
import { exchangeFlexibleDiffMigration, exchangeFlexibleDiffSpecs } from './0055-exchange-negotiated-diff-payer.js';
import { createUncappedAuctionAmountsMigration, withUncappedAuctionAmounts } from './0054-uncapped-auction-amounts.js';
import { createCapitalIncreaseMigration, withCapitalIncrease } from './0055-simulator-capital-increase.js';
import { createAuctionStepOptionsMigration, withAuctionStepOptions } from './0056-auction-step-options.js';
import { createCustomAuctionStepMigration, withCustomAuctionStep } from './0057-custom-auction-step.js';
import { createBuyNowRivalWindowMigration, withBuyNowRivalWindow } from './0058-buy-now-rival-window.js';
import { createAuctionFreeShippingReconcileMigration } from './0059-auction-free-shipping-reconcile.js';
import { createSupportCasesMigration, supportSpecs, withSupportCases } from './0050-support-cases.js';
import { createSupportAutoReviewUnionMigration } from './0051-support-auto-review-union.js';
import { createListingAutoReviewMigration, withListingAutoReview } from './0050-listing-auto-review.js';
import { listingAutoReviewCheckSpec, listingAutoReviewSpecV2, listingAutoReviewV2Migration } from './0052-listing-auto-review-v2.js';
import { transactionReviewValidatorFixMigration } from './0039-transaction-review-validator-fix.js';
import { reviewValidatorReconciliationMigration } from './0041-review-validator-reconciliation.js';
import { catalogRecoveryMigration, withCatalogRecovery } from './0042-catalog-recovery-index.js';
import { priceSourceOriginMigration, withPriceSourceOrigin } from './0043-price-source-origin.js';
import { conversationAgreementsMigration, conversationAgreementSpecs } from './0032-conversation-agreements.js';
import { wholeBookBundlesMigration, withBookBundles } from './0035-whole-book-bundles.js';
import { bundleReviewSearchMigration, withBundleReviewSearch } from './0036-bundle-review-search.js';
import { moderationOverviewIndexesMigration, withModerationIndexes } from './0037-moderation-overview-indexes.js';
import { buyNowNotificationsMigration, withBuyNowNotifications } from './0029-buy-now-notifications.js';
import { bookCirculationRegionsMigration } from './0030-book-circulation-regions.js';
import {
  auctionOnlyListingsMigration,
  withListingChannel,
} from './0032-auction-only-listings.js';
import {
  auctionDeliveryCollectionSpecs,
  auctionDeliveryMigration,
  withAuctionDelivery,
} from './0034-auction-delivery.js';
import {
  buyNowChallengeMigration,
  withBuyNowChallenge,
} from './0033-buy-now-challenge.js';
import {
  sellerScheduledAuctionsMigration,
  withSellerScheduledAuctions,
} from './0037-seller-scheduled-auctions.js';
import {
  exchangeDisputeResolutionMigration,
} from './0044-exchange-dispute-resolution.js';
import {
  exchangeMutualCancellationMigration,
} from './0045-exchange-mutual-cancellation.js';
import {
  listingExchangePreferencesMigration,
  withListingExchangePreferences,
} from './0046-listing-exchange-preferences.js';
import {
  listingAutofillMigration,
  listingAutofillSpecs,
} from './0038-listing-autofill.js';
import {
  exchangesMigration,
} from './0016-exchanges.js';
import {
  exchangesPhase2Migration,
} from './0017-exchanges-phase2.js';
import {
  exchangesPhase3Migration,
} from './0018-exchanges-proposal-expiry.js';
import {
  exchangesPhase4Migration,
} from './0022-exchange-completion.js';
import {
  exchangeMessageSpecs,
  exchangeMessagesMigration,
} from './0023-exchange-messages.js';
import { createHash } from 'node:crypto';
import {
  paymentSpecs,
  walletPaymentsMigration,
  withPayments,
} from './0022-vnpay-wallet-listing-fees.js';
export { paymentSpecs };
import {
  integratedWalletPointMigration,
  withIntegratedWalletPointCommands,
} from './0027-wallet-point-command-union.js';
import {
  sellerSelectedOrdersMigration,
  sellerSelectedConversationSpecs,
} from './0028-seller-selected-orders.js';
import {
  directSettlementPrincipalMigration,
  withDirectSettlementPrincipal,
} from './0023-direct-order-settlement-principals.js';
import { vnpayQueryMigration, withVNPayQuery } from './0024-vnpay-querydr.js';
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
  purchaseConversationsMigration,
  purchaseConversationSpecs,
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
import { exchangeReviewsMigration } from './0025-exchange-reviews.js';
import {
  exchangeMutualCompletionMigration,
} from './0026-exchange-mutual-completion.js';
import {
  exchangeMultiBookMigration,
  withExchangePhase6Changes,
} from './0031-exchange-multi-book.js';
import { vnpayTopupExpiryMigration, withVNPayExpiry } from './0032-vnpay-topup-expiry.js';
import { exchangeInspectionDeadlinesMigration, withExchangeInspectionDeadlines } from './0039-exchange-inspection-deadlines.js';
import {
  transactionReviewLifecycleMigration,
  reviewLifecycleSpecs,
  withReviewCommandTarget,
} from './0040-transaction-review-lifecycle.js';

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

const memberProfilesMigration = createMemberProfilesMigration([
  ...baselineCollections.filter(spec => spec.name === 'users'),
  ...baselineCollections.filter(spec => ['mutation_receipts', 'audit_events'].includes(spec.name))
    .map(withIntegratedWalletPointCommands).map(withVNPayExpiry).map(withReviewCommandTarget),
]);
const accountControlsMigration = createAccountControlsMigration(memberProfilesMigration.definition.collections.filter(spec => ['users','audit_events'].includes(spec.name)));
const listingAutoReviewMigration = createListingAutoReviewMigration([
  ...memberProfilesMigration.definition.collections.filter(spec => spec.name === 'mutation_receipts'),
  ...accountControlsMigration.definition.collections.filter(spec => spec.name === 'audit_events'),
]);
const supportCasesMigration = createSupportCasesMigration([
  ...memberProfilesMigration.definition.collections.filter(spec => spec.name === 'mutation_receipts'),
  ...accountControlsMigration.definition.collections.filter(spec => spec.name === 'audit_events'),
  ...notificationSpecs.map(withExchangeNotificationChanges).map(withBuyNowNotifications).map(withExchangePhase6Changes),
]);
const supportAutoReviewUnionMigration = createSupportAutoReviewUnionMigration(supportCasesMigration.definition.collections);
// Frozen snapshot of every collection 0054 widens, as of migration 0053.
const uncappedAuctionAmountsMigration = createUncappedAuctionAmountsMigration([
  ...auctionCollectionSpecs
    .filter((spec) =>
      ['auction_intakes', 'auctions', 'auction_bidders', 'auction_bids'].includes(spec.name),
    )
    .map(withPointOrderChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges)
    .map(withRulesChanges)
    .map(withPointAdministrationChanges)
    .map(withInspectionEvidenceChanges)
    .map(withBuyNowChallenge)
    .map(withSellerScheduledAuctions),
  ...pointOrderCollectionSpecs
    .filter((spec) => spec.name === 'point_orders')
    .map(withPointCollectionChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges)
    .map(withAuctionDelivery),
  ...pointIncidentCollectionSpecs.filter((spec) => spec.name === 'point_incidents'),
  ...baselineCollections
    .filter((spec) => spec.name === 'ledger_entries')
    .map(withTitleKey)
    .map(withAuctionChanges)
    .map(withPointOrderChanges)
    .map(withPointCollectionChanges)
    .map(withSettlementChanges)
    .map(withPurchaseConversationChanges)
    .map(withNotificationChanges)
    .map(withCatalogClassification)
    .map(withCatalogVocabularyV2)
    .map(withPointAdministrationChanges)
    .map(withPayments)
    .map(withDirectSettlementPrincipal)
    .map(withVNPayQuery)
    .map(withIntegratedWalletPointCommands)
    .map(withVNPayExpiry),
]);
// Frozen snapshot of the collections 0055 widens, as of migration 0054.
const capitalIncreaseMigration = createCapitalIncreaseMigration(
  baselineCollections
    .filter((spec) =>
      ['ledger_journals', 'topup_intents', 'simulated_payment_events'].includes(spec.name),
    )
    .map(withTitleKey)
    .map(withAuctionChanges)
    .map(withPointOrderChanges)
    .map(withPointCollectionChanges)
    .map(withSettlementChanges)
    .map(withPurchaseConversationChanges)
    .map(withNotificationChanges)
    .map(withCatalogClassification)
    .map(withCatalogVocabularyV2)
    .map(withPointAdministrationChanges)
    .map(withPayments)
    .map(withDirectSettlementPrincipal)
    .map(withVNPayQuery)
    .map(withIntegratedWalletPointCommands)
    .map(withVNPayExpiry),
);
// 0056 widens the step list on the 0054 snapshots, which 0055 leaves untouched.
const auctionStepOptionsMigration = createAuctionStepOptionsMigration(
  uncappedAuctionAmountsMigration.definition.collections,
);
const customAuctionStepMigration = createCustomAuctionStepMigration(
  auctionStepOptionsMigration.definition.collections,
);
const buyNowRivalWindowMigration = createBuyNowRivalWindowMigration(
  customAuctionStepMigration.definition.collections,
);
const auctionFreeShippingReconcileMigration =
  createAuctionFreeShippingReconcileMigration(
    customAuctionStepMigration.definition.collections,
  );
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
  walletPaymentsMigration,
  directSettlementPrincipalMigration,
  vnpayQueryMigration,
  pointAdministrationMigration,
  inspectionEvidenceMigration,
  pointIncidentsMigration,
  exchangesPhase4Migration,
  exchangeMessagesMigration,
  exchangeNotificationsMigration,
  exchangeReviewsMigration,
  exchangeMutualCompletionMigration,
  integratedWalletPointMigration,
  sellerSelectedOrdersMigration,
  buyNowNotificationsMigration,
  bookCirculationRegionsMigration,
  exchangeMultiBookMigration,
  vnpayTopupExpiryMigration,
  conversationAgreementsMigration,
  auctionOnlyListingsMigration,
  buyNowChallengeMigration,
  auctionDeliveryMigration,
  wholeBookBundlesMigration,
  bundleReviewSearchMigration,
  sellerScheduledAuctionsMigration,
  moderationOverviewIndexesMigration,
  listingAutofillMigration,
  transactionReviewValidatorFixMigration,
  exchangeInspectionDeadlinesMigration,
  transactionReviewLifecycleMigration,
  reviewValidatorReconciliationMigration,
  catalogRecoveryMigration,
  priceSourceOriginMigration,
  exchangeDisputeResolutionMigration,
  exchangeMutualCancellationMigration,
  listingExchangePreferencesMigration,
  memberProfilesMigration,
  accountControlsMigration,
  memberCartMigration,
  listingAutoReviewMigration,
  supportCasesMigration,
  supportAutoReviewUnionMigration,
  autoReviewV2UpgradeBridgeMigration,
  listingAutoReviewV2Migration,
  exchangeAgreementMigration,
  exchangeEvidenceMigration,
  createFreeShippingMigration(auctionDeliveryMigration.definition.collections),
  exchangeNegotiatedDiffMigration,
  exchangeFlexibleDiffMigration,
  createLocalDemoCompletionMigration([
    ...supportAutoReviewUnionMigration.definition.collections,
    directDeliveryCompletionLegacyShapeMigration.definition.directOrders,
  ]),
  uncappedAuctionAmountsMigration,
  capitalIncreaseMigration,
  auctionStepOptionsMigration,
  customAuctionStepMigration,
  buyNowRivalWindowMigration,
  auctionFreeShippingReconcileMigration,
];

export const checksumOf = (migration: Migration) =>
  createHash('sha256')
    .update(canonicalJson(migration.definition))
    .digest('hex');

// The latest schema, for tests and for the app role privileges.
const baselineBeforeWithdrawals = (select: (spec: CollectionSpec) => boolean): CollectionSpec[] =>
  baselineCollections
    .filter(select)
    .map(withTitleKey)
    .map(withAuctionChanges)
    .map(withPointOrderChanges)
    .map(withPointCollectionChanges)
    .map(withSettlementChanges)
    .map(withPurchaseConversationChanges)
    .map(withNotificationChanges)
    .map(withCatalogClassification)
    .map(withCatalogVocabularyV2)
    .map(withPointAdministrationChanges)
    .map(withPayments)
    .map(withDirectSettlementPrincipal)
    .map(withVNPayQuery)
    .map(withIntegratedWalletPointCommands)
    .map(withVNPayExpiry)
    .map(withListingChannel)
    .map(withBookBundles)
    .map(withBundleReviewSearch)
    .map(withModerationIndexes)
    .map(withReviewCommandTarget)
    .map(withCatalogRecovery)
    .map(withListingExchangePreferences)
    .map(withMemberProfiles)
    .map(withAccountControls)
    .map(withListingAutoReview)
    .map(withSupportCases).map(withLocalDemoCompletion)
    .map(withUncappedAuctionAmounts)
    .map(withCapitalIncrease);

const beforeWithdrawals = (): CollectionSpec[] => [
  ...baselineBeforeWithdrawals(spec => spec.name !== 'direct_orders'),
  ...baselineCollections
    .filter((spec) => spec.name === 'direct_orders')
    .map(withDirectDeliveryCompletionLegacyShape).map(withLocalDemoCompletion),
  wishlistSpec,
  ...priceAssistSpecsV2.map(withPriceSourceOrigin),
  ...onlinePriceSpecs,
  ...auctionCollectionSpecs
    .map(withPointOrderChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges)
    .map(withRulesChanges)
    .map(withPointAdministrationChanges)
    .map(withInspectionEvidenceChanges)
    .map(withBuyNowChallenge)
    .map(withSellerScheduledAuctions)
    .map(withUncappedAuctionAmounts)
    .map(withAuctionStepOptions)
    .map(withCustomAuctionStep)
    .map(withBuyNowRivalWindow)
    .map(withBuyNowMode)
    .map(withAuctionTypes),
  ...pointOrderCollectionSpecs
    .map(withPointCollectionChanges)
    .map(withResolutionChanges)
    .map(withSettlementChanges)
    .map(withAuctionDelivery).map(withFreeShipping)
    .map(withUncappedAuctionAmounts)
    .map(withAuctionStepOptions)
    .map(withCustomAuctionStep),
  ...pointCollectionSpecs.map(withAuctionDelivery),
  ...resolutionCollectionSpecs
    .map(withSettlementChanges)
    .map(withRulesChanges)
    .map(withAuctionDelivery),
  ...settlementCollectionSpecs.map(withRulesChanges),
  ...rulesCollectionSpecs,
  ...sellerSelectedConversationSpecs,
  ...notificationSpecs
    .map(withExchangeNotificationChanges)
    .map(withBuyNowNotifications)
    .map(withExchangePhase6Changes)
    .map(withSupportCases),
  ...accountRecoverySpecs,
  ...authOtpSpecs,
  // Use the final frozen migration's schema, rather than retaining the older
  // formula for who pays alongside the negotiated-payer rule.
  ...exchangeFlexibleDiffSpecs,
  ...directDeliveryCompletionSpecs,
  ...paymentSpecs.map(withVNPayExpiry),
  ...exchangeMessageSpecs,
  ...conversationAgreementSpecs,
  ...reviewLifecycleSpecs,
  ...inspectionEvidenceCollectionSpecs,
  ...pointIncidentCollectionSpecs.map(withUncappedAuctionAmounts),
  ...auctionDeliveryCollectionSpecs.map(withFreeShipping),
  ...listingAutofillSpecs,
  ...memberProfileSpecs,
  memberCartSpec,
  listingAutoReviewSpecV2,
  listingAutoReviewCheckSpec,
  ...supportSpecs,
  ...exchangeEvidenceSpecs,
  demoCompletionSpec,
];

export const currentCollections = (): CollectionSpec[] => [...beforeWithdrawals().map(withWithdrawals).map(withMessageSendLimits).map(withAuctionBidHolds).map(withAuctionRegistration).map(withAuctionLifecycle).map(withAuctionResume).map(withAuctionScheduledOpen).map(withAuctionOpenMonth).map(withSupportTargetIndex).map(withAuctionPauseBudget).map(withAuctionReachedNotice).map(withAuctionSecondChance).map(withAuctionDepositShare), ...withdrawalSpecs.map(withManualWithdrawals).map(withWithdrawalProofReference), registrationSpec, ...withdrawalProofSpecs].map((spec) =>
  onlinePriceSpecs.some(({ name }) => name === spec.name) ? withOnlinePriceCatalogRevision(spec) : spec,
).map(withExchangeReturnResolution).map(withExchangeOutboundDeliveryVerification).map(withExchangeDemoArchive);
// Only the affected predecessor schemas are evaluated eagerly. Building the full
// catalogue here would read its taxonomy while an import cycle is initializing.
const withdrawalsMigration = createWithdrawalsMigration([
  ...baselineBeforeWithdrawals(spec => ['wallet_accounts','ledger_journals','mutation_receipts','audit_events'].includes(spec.name)),
  ...notificationSpecs.map(withExchangeNotificationChanges).map(withBuyNowNotifications).map(withExchangePhase6Changes).map(withSupportCases),
]);
migrations.push(withdrawalsMigration);

migrations.push(manualWithdrawalsMigration, createMessageSendLimitsMigration([
  ...purchaseConversationSpecs.filter((spec) => spec.name === 'purchase_messages'),
  ...exchangeMessageSpecs,
]));
// ADR 0074: Buy Now mode on the 0058 snapshots of auction_intakes/auctions.
const buyNowModeMigration = createBuyNowModeMigration(
  buyNowRivalWindowMigration.definition.collections,
);
migrations.push(buyNowModeMigration);
// ADR 0075: leader holds on the 0060 snapshots of wallet/ledger/notifications.
const bidHoldsMigration = createAuctionBidHoldsMigration(
  withdrawalsMigration.definition.collections,
);
migrations.push(bidHoldsMigration);
// ADR 0076: auction formats on the 0063 snapshots of auction_intakes/auctions.
const auctionTypesMigration = createAuctionTypesMigration(
  buyNowModeMigration.definition.collections,
);
migrations.push(auctionTypesMigration);
// ADR 0077: registration on the 0065 auction and 0064 ledger/notification snapshots.
const registrationMigration = createAuctionRegistrationMigration([
  ...auctionTypesMigration.definition.collections,
  ...bidHoldsMigration.definition.collections,
]);
migrations.push(registrationMigration);
// ADR 0079: bounded registration lifecycle on the 0066 snapshots.
const lifecycleMigration = createAuctionLifecycleMigration(
  registrationMigration.definition.collections,
);
migrations.push(lifecycleMigration);
// ADR 0080: one Admin resume of an OnHold auction, on the 0067 snapshots.
const resumeMigration = createAuctionResumeMigration(
  lifecycleMigration.definition.collections,
);
migrations.push(resumeMigration);
// ADR 0081: the seller's open time, gated by registrants, on the 0068 snapshots.
const scheduledOpenMigration = createAuctionScheduledOpenMigration(
  resumeMigration.definition.collections,
);
migrations.push(scheduledOpenMigration);
// ADR 0082: open up to 30 days ahead, at most two open-time changes.
const openMonthMigration = createAuctionOpenMonthMigration(
  scheduledOpenMigration.definition.collections,
);
migrations.push(openMonthMigration);
// ADR 0083: open reports grouped and filtered by target, on the 0050 spec.
migrations.push(createSupportTargetIndexMigration(supportSpecs));
// ADR 0084: one pause model with a budget, on the 0070 auction snapshot.
const pauseBudgetMigration = createAuctionPauseBudgetMigration(
  openMonthMigration.definition.collections,
);
migrations.push(pauseBudgetMigration);
// ADR 0085: a late-reached auction opens after a notice, never at night.
const reachedNoticeMigration = createAuctionReachedNoticeMigration(
  pauseBudgetMigration.definition.collections,
);
migrations.push(reachedNoticeMigration);
// ADR 0086: runner-up offer and unpaid report cancel, on the 0073 auctions,
// 0059 point_orders and 0068 member_notifications snapshots.
const secondChanceMigration = createAuctionSecondChanceMigration([
  ...reachedNoticeMigration.definition.collections,
  ...auctionFreeShippingReconcileMigration.definition.collections,
  ...resumeMigration.definition.collections.filter((s) => s.name === 'member_notifications'),
]);
migrations.push(secondChanceMigration);
// ADR 0087: seller share of a forfeited deposit and a seller-set deposit, on
// the 0074 auctions/member_notifications, 0067 auction_intakes and 0066
// ledger_journals snapshots.
const auctionDepositShareMigration = createAuctionDepositShareMigration([
  ...secondChanceMigration.definition.collections.filter((s) => s.name !== 'point_orders'),
  ...lifecycleMigration.definition.collections.filter((s) => s.name === 'auction_intakes'),
  ...registrationMigration.definition.collections.filter((s) => s.name === 'ledger_journals'),
]);
migrations.push(auctionDepositShareMigration);
migrations.push(withdrawalProofMigration, withdrawalProofReferenceMigration);
migrations.push(onlinePriceCatalogRevisionMigration);

const exchangeReturnMigration = createExchangeReturnMigration([
  ...exchangeFlexibleDiffSpecs,
  ...auctionDepositShareMigration.definition.collections.filter((spec) => spec.name === 'ledger_journals'),
  ...rulesCollectionSpecs,
]);
migrations.push(exchangeReturnMigration);
const exchangeOutboundMigration = createExchangeOutboundDeliveryMigration(
  exchangeReturnMigration.definition.collections.find((spec) => spec.name === 'exchanges')!,
);
migrations.push(exchangeOutboundMigration);
migrations.push(createExchangeDemoArchiveMigration(exchangeOutboundMigration.definition.collections[0]));
