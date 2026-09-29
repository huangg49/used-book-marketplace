import type {
  AggregateOptions,
  AggregationCursor,
  BulkWriteOptions,
  ClientSession,
  Collection,
  CountDocumentsOptions,
  Db,
  DeleteOptions,
  DeleteResult,
  Document,
  Filter,
  FindCursor,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertManyResult,
  InsertOneOptions,
  InsertOneResult,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
} from 'mongodb';
import type * as D from './documents.js';

// Collection name -> document type. One entry per collection in the baseline.
export interface CollectionTypes {
  users: D.UserDoc;
  auth_sessions: D.AuthSessionDoc;
  login_attempts: D.LoginAttemptDoc;
  catalog_books: D.CatalogBookDoc;
  catalog_revisions: D.CatalogRevisionDoc;
  catalog_decisions: D.CatalogDecisionDoc;
  listings: D.ListingDoc;
  listing_revisions: D.ListingRevisionDoc;
  listing_media: D.ListingMediaDoc;
  revision_media: D.RevisionMediaDoc;
  listing_decisions: D.ListingDecisionDoc;
  mutation_receipts: D.MutationReceiptDoc;
  audit_events: D.AuditEventDoc;
  outbox_events: D.OutboxEventDoc;
  media_processing_jobs: D.MediaProcessingJobDoc;
  service_areas: D.ServiceAreaDoc;
  service_localities: D.ServiceLocalityDoc;
  address_books: D.AddressBookDoc;
  member_addresses: D.MemberAddressDoc;
  address_identities: D.AddressIdentityDoc;
  sale_quote_policies: D.SaleQuotePolicyDoc;
  sale_quote_policy_selection: D.SaleQuotePolicySelectionDoc;
  sale_quotes: D.SaleQuoteDoc;
  direct_orders: D.DirectOrderDoc;
  order_preparations: D.OrderPreparationDoc;
  pickup_reviews: D.PickupReviewDoc;
  order_packaging_evidence: D.OrderPackagingEvidenceDoc;
  direct_shipments: D.DirectShipmentDoc;
  shipment_packaging_evidence: D.ShipmentPackagingEvidenceDoc;
  carrier_pickup_events: D.CarrierPickupEventDoc;
  carrier_pickup_reviews: D.CarrierPickupReviewDoc;
  order_delivery_reviews: D.OrderDeliveryReviewDoc;
  order_non_receipt_reports: D.OrderNonReceiptReportDoc;
  workflow_contexts: D.WorkflowContextDoc;
  workflow_items: D.WorkflowItemDoc;
  agreement_snapshots: D.AgreementSnapshotDoc;
  exclusive_commitments: D.ExclusiveCommitmentDoc;
  commitment_events: D.CommitmentEventDoc;
  wallet_accounts: D.WalletAccountDoc;
  topup_intents: D.TopupIntentDoc;
  simulated_payment_events: D.SimulatedPaymentEventDoc;
  ledger_journals: D.LedgerJournalDoc;
  ledger_entries: D.LedgerEntryDoc;
  command_locks: D.CommandLockDoc;
  account_locks: D.AccountLockDoc;
  counters: D.CounterDoc;
}
export type CollectionName = keyof CollectionTypes;

// The subset of Collection used by services. Every call made through a
// session-bound instance carries the transaction session implicitly, so an
// operation can never escape its transaction by a forgotten option.
export interface BoundCollection<T extends Document> {
  readonly raw: Collection<T>;
  findOne(filter: Filter<T>, options?: FindOptions): Promise<WithId<T> | null>;
  find(filter: Filter<T>, options?: FindOptions): FindCursor<WithId<T>>;
  countDocuments(
    filter?: Filter<T>,
    options?: CountDocumentsOptions,
  ): Promise<number>;
  aggregate<R extends Document = Document>(
    pipeline: Document[],
    options?: AggregateOptions,
  ): AggregationCursor<R>;
  insertOne(
    doc: OptionalUnlessRequiredId<T>,
    options?: InsertOneOptions,
  ): Promise<InsertOneResult<T>>;
  insertMany(
    docs: OptionalUnlessRequiredId<T>[],
    options?: BulkWriteOptions,
  ): Promise<InsertManyResult<T>>;
  updateOne(
    filter: Filter<T>,
    update: UpdateFilter<T> | Document[],
    options?: UpdateOptions,
  ): Promise<UpdateResult<T>>;
  updateMany(
    filter: Filter<T>,
    update: UpdateFilter<T> | Document[],
    options?: UpdateOptions,
  ): Promise<UpdateResult<T>>;
  findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T> | Document[],
    options?: FindOneAndUpdateOptions,
  ): Promise<WithId<T> | null>;
  deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult>;
  deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult>;
}

function bind<T extends Document>(
  raw: Collection<T>,
  session: ClientSession | undefined,
): BoundCollection<T> {
  const s = <O extends object>(options?: O) =>
    (session ? { ...options, session } : { ...options }) as O & {
      session?: ClientSession;
    };
  return {
    raw,
    findOne: (filter, options) => raw.findOne(filter, s(options)),
    find: (filter, options) => raw.find(filter, s(options)),
    countDocuments: (filter = {}, options) =>
      raw.countDocuments(filter, s(options)),
    aggregate: <R extends Document>(
      pipeline: Document[],
      options?: AggregateOptions,
    ) => raw.aggregate<R>(pipeline, s(options)),
    insertOne: (doc, options) => raw.insertOne(doc, s(options)),
    insertMany: (docs, options) => raw.insertMany(docs, s(options)),
    updateOne: (filter, update, options) =>
      raw.updateOne(filter, update, s(options)),
    updateMany: (filter, update, options) =>
      raw.updateMany(filter, update, s(options)),
    findOneAndUpdate: (filter, update, options) =>
      raw.findOneAndUpdate(filter, update, s({ ...options })),
    deleteOne: (filter, options) => raw.deleteOne(filter, s(options)),
    deleteMany: (filter, options) => raw.deleteMany(filter, s(options)),
  };
}

export type Collections = {
  [K in CollectionName]: BoundCollection<CollectionTypes[K]>;
};

const NAMES: CollectionName[] = [
  'users',
  'auth_sessions',
  'login_attempts',
  'catalog_books',
  'catalog_revisions',
  'catalog_decisions',
  'listings',
  'listing_revisions',
  'listing_media',
  'revision_media',
  'listing_decisions',
  'mutation_receipts',
  'audit_events',
  'outbox_events',
  'media_processing_jobs',
  'service_areas',
  'service_localities',
  'address_books',
  'member_addresses',
  'address_identities',
  'sale_quote_policies',
  'sale_quote_policy_selection',
  'sale_quotes',
  'direct_orders',
  'order_preparations',
  'pickup_reviews',
  'order_packaging_evidence',
  'direct_shipments',
  'shipment_packaging_evidence',
  'carrier_pickup_events',
  'carrier_pickup_reviews',
  'order_delivery_reviews',
  'order_non_receipt_reports',
  'workflow_contexts',
  'workflow_items',
  'agreement_snapshots',
  'exclusive_commitments',
  'commitment_events',
  'wallet_accounts',
  'topup_intents',
  'simulated_payment_events',
  'ledger_journals',
  'ledger_entries',
  'command_locks',
  'account_locks',
  'counters',
];
export const COLLECTION_NAMES: readonly CollectionName[] = NAMES;

export function bindCollections(db: Db, session?: ClientSession): Collections {
  return Object.fromEntries(
    NAMES.map((name) => [name, bind(db.collection(name), session)]),
  ) as unknown as Collections;
}
