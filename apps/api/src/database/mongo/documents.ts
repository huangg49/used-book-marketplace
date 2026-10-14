// Document shapes for every PostgreSQL model (MIG-02 model map). Field names
// keep the Prisma camelCase names; `_id` is the external UUID string (never an
// ObjectId). Natural/composite keys use deterministic string ids documented per
// collection. `lockSeq` is the ADR 0027 write-lock counter on lockable documents.

export type Json = Record<string, unknown>;
export type UserStatus =
  'PENDING_VERIFICATION' | 'ACTIVE' | 'RESTRICTED' | 'LOCKED' | 'DISABLED';
export type RoleCode = 'MEMBER' | 'STAFF' | 'ADMIN' | 'TEST_OPERATOR';
export type CatalogStatus = 'Pending' | 'Confirmed' | 'Rejected';
export type ListingMode = 'Sale' | 'Exchange' | 'Both';
export type BookCondition = 'LikeNew' | 'Good' | 'Fair' | 'Worn';
export type ModerationStatus =
  'Draft' | 'PendingReview' | 'Approved' | 'Rejected';
export type VisibilityStatus = 'Visible' | 'Hidden' | 'Removed';
export type TradeStatus =
  'Available' | 'Reserved' | 'Sold' | 'Exchanged' | 'ClosedUnavailable';
export type MediaStatus = 'Pending' | 'Processing' | 'Ready' | 'Failed';
export type SystemActor =
  | 'OrderExpiry'
  | 'OrderConfirmationExpiry'
  | 'OrderRefund'
  | 'OrderPickupExpiry'
  | 'OrderDeliveryExpiry'
  | 'OrderInspectionExpiry'
  | 'AuctionClose'
  | 'AuctionPaymentExpiry'
  | 'AuctionIntakeExpiry'
  | 'PointOrderDeadline'
  | 'PointOrderSettlement'
  | 'PurchaseConversationExpiry'
  | 'AuctionHold';

type Lockable = { lockSeq: number };

// Roles are embedded so role writers write the locked user document (replaces
// the role_mutation_lock trigger); UserRole's composite key becomes role uniqueness.
export interface UserDoc extends Lockable {
  _id: string;
  emailNormalized: string;
  passwordHash: string;
  displayName: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: RoleCode; grantedAt: Date }[];
}
export interface AuthSessionDoc extends Lockable {
  _id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
export interface LoginAttemptDoc {
  _id: string; // key
  attempts: number;
  expiresAt: Date;
}

export interface CatalogBookDoc extends Lockable {
  _id: string;
  requesterId: string;
  status: CatalogStatus;
  version: number;
  currentRevisionId: string | null;
  confirmedIsbn: string | null;
  searchText: string;
  // Normalized title of the current revision (migration 0003).
  titleKey: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface CatalogRevisionDoc {
  _id: string;
  bookId: string;
  number: number;
  title: string;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  language: string;
  edition: string | null;
  category: string;
  categoryId?: import('@used-books/api-contract').components['schemas']['CatalogMetadata']['categoryId'];
  attributes?: Record<string, string[]>;
  series?: string | null;
  isbn: string | null;
  submittedAt: Date;
}
export interface CatalogDecisionDoc {
  _id: string;
  revisionId: string;
  reviewerId: string;
  decision: 'Confirm' | 'Reject';
  reason: string | null;
  decidedAt: Date;
}

export interface ListingDoc extends Lockable {
  _id: string;
  ownerId: string;
  version: number;
  moderation: ModerationStatus;
  visibility: VisibilityStatus;
  trade: TradeStatus;
  currentRevisionId: string | null;
  removalReason: string | null;
  deletedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
// A short, no-money negotiation opened from the public shelf. It is deliberately
// not an Order: it creates no quote, wallet hold, shipment, or custody claim.
export interface PurchaseConversationDoc extends Lockable {
  _id: string;
  listingId: string;
  listingVersion: number;
  buyerId: string;
  sellerId: string;
  version: number;
  status: 'Active' | 'Expired' | 'Cancelled';
  expiresAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface PurchaseMessageDoc {
  _id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: Date;
}
export interface ListingRevisionDoc extends Lockable {
  _id: string;
  listingId: string;
  number: number;
  bookId: string | null;
  mode: ListingMode | null;
  condition: BookCondition | null;
  pages: string;
  coverNote: string;
  notes: string;
  accessories: string;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
  description: string;
  salePrice: number | null;
  exchangeValue: number | null;
  submittedAt: Date | null;
  ownershipDeclaredAt: Date | null;
  createdAt: Date;
  originAddressId: string | null;
  originAddressVersion: number | null;
  originServiceAreaCode: string | null;
}
export interface ListingMediaDoc extends Lockable {
  _id: string;
  listingId: string;
  version: number;
  status: MediaStatus;
  stagingKey: string;
  pinnedKey: string | null;
  derivativeKey: string | null;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  failureCode: string | null;
  expiresAt: Date;
  purgedAt: Date | null;
  reservedBytes: number;
  createdAt: Date;
  updatedAt: Date;
}
// _id = `${revisionId}:${mediaId}`
export interface RevisionMediaDoc {
  _id: string;
  listingId: string;
  revisionId: string;
  mediaId: string;
  position: number;
}
export interface ListingDecisionDoc {
  _id: string;
  revisionId: string;
  reviewerId: string;
  decision: 'Approve' | 'Reject';
  checklist: Json | null;
  reason: string | null;
  decidedAt: Date;
}

// Exactly one target field is set; `principal` is the idempotency identity:
// `user:<actorId>` or `system:<systemActor>`.
export interface MutationReceiptDoc {
  _id: string;
  principal: string;
  actorId: string | null;
  systemActor: SystemActor | null;
  operation: string;
  key: string;
  payloadHash: string;
  listingId: string | null;
  bookId: string | null;
  mediaId: string | null;
  addressBookId: string | null;
  quoteId: string | null;
  contextId: string | null;
  topupId: string | null;
  pointId?: string | null;
  resultVersion: number;
  result: Json;
  committedAt: Date;
}
export interface AuditEventDoc {
  _id: string;
  actorId: string | null;
  systemActor: SystemActor | null;
  receiptId: string | null;
  listingId: string | null;
  bookId: string | null;
  mediaId: string | null;
  addressBookId: string | null;
  quoteId: string | null;
  contextId: string | null;
  topupId: string | null;
  pointId?: string | null;
  action: string;
  before: Json | null;
  after: Json | null;
  reason: string | null;
  requestId: string;
  createdAt: Date;
}
export interface OutboxEventDoc {
  _id: string;
  auditId: string;
  type: string;
  payload: Json;
  attempts: number;
  availableAt: Date;
  leaseUntil: Date | null;
  processedAt: Date | null;
  createdAt: Date;
}
export interface MediaProcessingJobDoc {
  _id: string;
  mediaId: string;
  attempts: number;
  availableAt: Date;
  leaseUntil: Date | null;
  finishedAt: Date | null;
}

export interface ServiceAreaDoc {
  _id: string; // code
  name: string;
  demoOnly: boolean;
}
// _id = `${areaCode}:${code}`
export interface ServiceLocalityDoc {
  _id: string;
  areaCode: string;
  code: string;
  label: string;
}
export interface AddressBookDoc extends Lockable {
  _id: string; // ownerId
  version: number;
}
export interface MemberAddressDoc {
  _id: string;
  ownerId: string;
  version: number;
  recipientName: string;
  phone: string;
  serviceAreaCode: string;
  localityCode: string;
  detail: string;
  isDefault: boolean;
  createdAt: Date;
}
export interface AddressIdentityDoc {
  _id: string;
  ownerId: string;
}

export interface SaleQuotePolicyDoc {
  _id: string; // code
  shippingFee: number;
  commissionBps: number;
  ttlSeconds: number;
}
export interface SaleQuotePolicySelectionDoc {
  _id: string; // scope
  policyCode: string;
}
export interface SaleQuoteDoc {
  _id: string;
  version: number;
  buyerId: string;
  sellerId: string;
  listingId: string;
  listingVersion: number;
  listingRevisionId: string;
  catalogRevisionId: string;
  originAddressId: string;
  originAddressVersion: number;
  destinationAddressId: string;
  destinationAddressVersion: number;
  serviceAreaCode: string;
  policyCode: string;
  bookPrice: number;
  shippingFee: number;
  commissionBps: number;
  commission: number;
  buyerTotal: number;
  sellerProceeds: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface DirectOrderDoc extends Lockable {
  _id: string;
  buyerId: string;
  sellerId: string;
  quoteId: string;
  version: number;
  state: string;
  createdAt: Date;
  paymentDeadline: Date;
  closedAt: Date | null;
  paidAt: Date | null;
  sellerConfirmationDeadline: Date | null;
  cancellationRequestedAt: Date | null;
  cancellationReason: string | null;
  deliveredAt: Date | null;
  inspectionDeadline: Date | null;
  completedAt: Date | null;
}
export interface DirectDeliveryEventDoc {
  _id: string;
  orderId: string;
  shipmentId: string;
  source: 'CarrierDelivered' | 'BuyerReceived';
  occurredAt: Date;
  receivedAt: Date;
  payloadHash: string;
  signature: string;
  receiptId: string;
}
export interface OrderPreparationDoc {
  _id: string; // orderId
  acceptedAt: Date;
  pickupDeadline: Date;
  policyCode: string;
  receiptId: string;
}
export interface PickupReviewDoc {
  _id: string;
  orderId: string;
  openedAt: Date;
  reason: string;
  receiptId: string;
}
export interface OrderPackagingEvidenceDoc {
  _id: string;
  orderId: string;
  version: number;
  status: 'Pending' | 'Ready';
  mimeType: string;
  byteSize: number;
  sha256: string;
  reservedBytes: number;
  createdAt: Date;
  uploadedAt: Date | null;
  derivativeSha256: string | null;
  derivativeBytes: number | null;
  width: number | null;
  height: number | null;
  createReceiptId: string;
  uploadReceiptId: string | null;
}
export interface DirectShipmentDoc {
  _id: string;
  orderId: string;
  version: number;
  state: 'LabelCreated';
  carrier: string;
  trackingCode: string;
  direction: 'Outbound';
  origin: Json;
  destination: Json;
  shippingFee: number;
  feePolicy: string;
  registeredAt: Date;
  receiptId: string;
}
// _id = `${shipmentId}:${evidenceId}`
export interface ShipmentPackagingEvidenceDoc {
  _id: string;
  shipmentId: string;
  orderId: string;
  evidenceId: string;
  position: number;
}
export interface CarrierPickupEventDoc {
  _id: string;
  orderId: string;
  shipmentId: string;
  sequence: number;
  occurredAt: Date;
  receivedAt: Date;
  outcome: 'Applied' | 'Duplicate' | 'ReviewRequired';
  deliveryDeadline: Date | null;
  policyCode: string;
  payloadHash: string;
  signature: string;
  receiptId: string;
}
export interface CarrierPickupReviewDoc {
  _id: string;
  orderId: string;
  eventId: string;
  openedAt: Date;
  reason: 'LatePickup' | 'ConflictingPickup';
}
export interface OrderDeliveryReviewDoc {
  _id: string;
  orderId: string;
  pickupEventId: string;
  openedAt: Date;
  openedBy: 'DeadlineWorker' | 'BuyerReport';
  policyCode: string;
  receiptId: string;
}
export interface OrderNonReceiptReportDoc {
  _id: string;
  orderId: string;
  submittedAt: Date;
  description: string;
  receiptId: string;
}

export interface WorkflowContextDoc extends Lockable {
  _id: string;
  kind: 'Order';
  orderId: string;
  auctionIntakeId: null;
  version: number;
  ownershipPhase: 'Holding' | 'Closed';
}
// Kind PointOrder: orderId references point_orders (migration 0009).
export interface PointOrderContextDoc extends Lockable {
  _id: string;
  kind: 'PointOrder';
  orderId: string;
  auctionIntakeId: null;
  version: number;
  ownershipPhase: 'Holding' | 'Closed';
}
// Stored in workflow_contexts; Order code only reads contexts by orderId.
export interface AuctionIntakeContextDoc extends Lockable {
  _id: string;
  kind: 'AuctionIntake';
  orderId: null;
  auctionIntakeId: string;
  version: number;
  ownershipPhase: 'Holding' | 'Closed';
}
// _id = `${contextId}:${listingId}`
export interface WorkflowItemDoc {
  _id: string;
  contextId: string;
  listingId: string;
  listingRevisionId: string;
  catalogRevisionId: string;
  snapshot: Json;
}
export interface AgreementSnapshotDoc {
  _id: string; // contextId
  snapshot: Json;
}
export interface ExclusiveCommitmentDoc extends Lockable {
  _id: string;
  listingId: string;
  currentContextId: string;
  version: number;
  status: 'Active' | 'Released';
  acquiredAt: Date;
  endedAt: Date | null;
  reason: 'Cancelled' | 'PaymentExpired' | 'Reclaimed' | 'Completed' | null;
}
export interface CommitmentEventDoc {
  _id: string;
  commitmentId: string;
  sequence: number;
  kind: 'Acquired' | 'Transferred' | 'Released';
  beforeVersion: number;
  afterVersion: number;
  receiptId: string;
  occurredAt: Date;
}

export interface WalletAccountDoc {
  _id: string;
  ownerId: string | null;
  orderId: string | null;
  purpose:
    | 'UserAvailable'
    | 'OrderHold'
    | 'SimulatorCapital'
    | 'SimulatorClearing'
    | 'PlatformCommission';
  currency: 'VND';
}
export interface TopupIntentDoc extends Lockable {
  _id: string;
  ownerId: string;
  amount: number;
  currency: 'VND';
  state: 'Pending' | 'Processing' | 'Succeeded' | 'Failed' | 'ReviewRequired';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface SimulatedPaymentEventDoc {
  _id: string;
  intentId: string;
  provider: string;
  payloadHash: string;
  recipientId: string;
  amount: number;
  currency: string;
  outcome: 'Processing' | 'Succeeded' | 'Failed';
  disposition: 'Applied' | 'Ignored' | 'ReviewRequired';
  occurredAt: Date;
  receivedAt: Date;
  receiptId: string;
}
export interface LedgerJournalDoc {
  _id: string;
  sequence: number;
  type:
    | 'OpeningCapital'
    | 'Topup'
    | 'OrderPayment'
    | 'OrderRefund'
    | 'OrderSettlement';
  topupId: string | null;
  eventId: string | null;
  orderId: string | null;
  receiptId: string | null;
  postedAt: Date;
}
// _id = `${journalId}:${accountId}`
export interface LedgerEntryDoc {
  _id: string;
  journalId: string;
  accountId: string;
  debit: number;
  credit: number;
}

// Infrastructure collections (no PostgreSQL model).
export interface CommandLockDoc extends Lockable {
  _id: string;
  expiresAt: Date;
}
export interface AccountLockDoc extends Lockable {
  _id: string; // wallet account id
}
export interface CounterDoc {
  _id: string;
  value: number;
}
export interface WishlistItemDoc {
  _id: string;
  userId: string;
  subjectType: 'CATALOG_BOOK' | 'LISTING';
  subjectId: string;
  wantsToExchange: boolean;
  receiveNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type PriceSourceKind =
  | 'CoverPrice'
  | 'EditorialReference'
  | 'InternalAsking'
  | 'CompletedSale'
  | 'OnlineRetail';
// Curated, sourced price facts. Written only by the migrator-role import tool.
export interface PriceReferenceDoc {
  _id: string;
  bookId: string;
  isbn: string | null;
  kind: Exclude<PriceSourceKind, 'InternalAsking' | 'OnlineRetail'>;
  amount: number;
  condition: 'LikeNew' | 'Good' | 'Fair' | 'Worn' | null;
  sourceLabel: string;
  sourceUrl: string | null;
  observedAt: Date;
  enteredBy: string;
  rightsNote: string;
  retiredAt: Date | null;
  createdAt: Date;
}
export interface PriceSuggestionOutcome {
  revisionId: string;
  applied: boolean;
  chosenSalePrice: number | null;
  withinRange: boolean | null;
  decidedAt: Date;
}
export interface PriceSuggestionInput {
  bookId: string;
  condition: 'LikeNew' | 'Good' | 'Fair' | 'Worn' | null;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
}
export interface PriceSuggestionDoc {
  _id: string;
  ownerId: string;
  listingId: string;
  bookId: string;
  inputFingerprint: string;
  requestKey: string;
  requestHash: string;
  status: 'Pending' | 'Suggested' | 'NeedsMoreData' | 'Refused' | 'Failed';
  failure: 'Timeout' | 'InvalidOutput' | 'ProviderError' | 'Refusal' | null;
  evidenceLevel: 'Strong' | 'Limited' | 'Insufficient';
  rangeLow: number | null;
  rangeHigh: number | null;
  // Full API projection (without id/cached) for replay of a cached answer.
  response: Record<string, unknown> | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMicroUsd: number | null;
  latencyMs: number | null;
  outcome: PriceSuggestionOutcome | null;
  // Inputs the suggestion was made for; null on records before 0006.
  input: PriceSuggestionInput | null;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
  lockSeq: number;
}
export interface PriceAssistUsageDoc {
  _id: string;
  calls: number;
  costMicroUsd: number;
  expiresAt: Date;
}
export interface MigrationDoc {
  _id: string; // migration id
  checksum: string;
  appliedAt: Date;
}

// Online price lookup (ADR 0029, migration 0007). _id = catalog book id.
export interface PriceLookupDoc {
  _id: string;
  status: 'Running' | 'Done' | 'Failed';
  runId: string;
  leaseUntil: Date;
  nextAt: Date;
  lastRunAt: Date;
  offersFound: number;
  failure: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  searches: number;
  costMicroUsd: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface OnlinePriceOfferDoc {
  _id: string;
  bookId: string;
  runId: string;
  shop: string;
  url: string;
  amount: number;
  isbnMatched: boolean;
  pageTitle: string | null;
  observedAt: Date;
  retiredAt: Date | null;
  createdAt: Date;
}

// ------------------------------------------------ points and auctions (0008)
export interface HandoverPointDoc extends Lockable {
  _id: string;
  code: string;
  name: string;
  displayAddress: string;
  serviceAreaCode: 'HCM-DEMO-v1';
  capacity: number;
  status: 'Active' | 'Paused' | 'Closed';
  demoOnly: boolean;
  version: number;
  updatedAt: Date;
}
export interface PointStaffAssignmentDoc {
  _id: string;
  pointId: string;
  userId: string;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
}
export interface PointSlotDoc extends Lockable {
  _id: string;
  pointId: string;
  listingId: string;
  contextId: string;
  active: boolean;
  reservedAt: Date;
  releasedAt: Date | null;
  releaseReason: 'Cancelled' | 'Reclaimed' | 'Sold' | null;
}
export type AuctionIntakeState =
  | 'AwaitingDropoff'
  | 'Received'
  | 'Passed'
  | 'NeedsEvidence'
  | 'Auctioning'
  | 'ReclaimRequired'
  | 'Reclaimed'
  | 'Cancelled'
  | 'Sold';
export type ReclaimReason =
  | 'SellerCancelled'
  | 'InspectionFailed'
  | 'Unsold'
  | 'PaymentExpired'
  | 'AuctionCancelled'
  | 'OrderCancelled'
  | 'OrderReturned'
  | 'BookMisdescribed';
export interface AuctionIntakeDoc extends Lockable {
  _id: string;
  contextId: string;
  listingId: string;
  listingRevisionId: string;
  sellerId: string;
  pointId: string;
  slotId: string;
  startPrice: number;
  step: number;
  buyNowPrice: number | null;
  protectiveValue: number;
  policyCode: 'HCM-AUCTION-v1';
  state: AuctionIntakeState;
  version: number;
  createdAt: Date;
  dropoffDeadline: Date;
  receivedAt: Date | null;
  receivedBy: string | null;
  shelfCode: string | null;
  inspectedAt: Date | null;
  inspectorId: string | null;
  inspectionOutcome: 'Pass' | 'Fail' | 'NeedsEvidence' | null;
  inspectionNote: string | null;
  evidenceRequestedBy: string | null;
  evidenceDeadline: Date | null;
  evidenceNote: string | null;
  evidenceSubmittedAt: Date | null;
  reclaimRequiredAt: Date | null;
  auctionId: string | null;
  reclaimReason: ReclaimReason | null;
  closedAt: Date | null;
  updatedAt: Date;
}
export interface InspectionChecklist {
  titleEditionMatches: boolean;
  privateMarksMatch: boolean;
  coverPagesMatch: boolean;
  notesAccessoriesMatch: boolean;
  suspectedCopy: boolean;
}
// Immutable revision of the point inspection report (FR-T01).
export interface IntakeInspectionReportDoc {
  _id: string;
  intakeId: string;
  revision: number;
  outcome: 'Pass' | 'Fail' | 'NeedsEvidence';
  checklist: InspectionChecklist | null;
  note: string | null;
  inspectorId: string;
  createdAt: Date;
}
// N4-13 (FR-T04, POL-42): incidents at a point and the simulated fund.
export type PointIncidentKind =
  | 'Lost'
  | 'Damaged'
  | 'ArrivalMismatch'
  | 'LateArrival'
  | 'EmergencyClose'
  | 'Other';
export interface PointIncidentDoc extends Lockable {
  _id: string;
  pointId: string;
  intakeId: string | null;
  kind: PointIncidentKind;
  description: string;
  protectedValue: number | null;
  state: 'Open' | 'Decided' | 'Underfunded';
  openedBy: string;
  openedAt: Date;
  decision: 'Compensate' | 'NoCompensation' | null;
  approvedAmount: number | null;
  fundedAmount: number | null;
  unfundedAmount: number | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  version: number;
  updatedAt: Date;
}
export interface IncidentFundEntryDoc {
  _id: string;
  sequence: number;
  type: 'Opening' | 'CompensationApproved';
  amount: number;
  incidentId: string | null;
  balanceAfter: number;
  createdAt: Date;
}
export type AuctionState =
  | 'Active'
  | 'BuyNowPending'
  | 'AwaitingWinnerPayment'
  | 'Sold'
  | 'Unsold'
  | 'OnHold'
  | 'Cancelled'
  | 'PaymentExpired';
export interface AuctionDoc extends Lockable {
  _id: string;
  intakeId: string;
  contextId: string;
  listingId: string;
  sellerId: string;
  pointId: string;
  startPrice: number;
  step: number;
  buyNowPrice: number | null;
  startAt: Date;
  endAt: Date;
  state: AuctionState;
  currentPrice: number | null;
  leaderId: string | null;
  bidderCount: number;
  bidCount: number;
  nextSequence: number;
  winnerId: string | null;
  finalPrice: number | null;
  closedAt: Date | null;
  paymentDeadline: Date | null;
  cancelReason: string | null;
  orderId: string | null;
  version: number;
  updatedAt: Date;
}
// _id = `${auctionId}:${bidderId}`; level is the private commitment ceiling.
export interface AuctionBidderDoc extends Lockable {
  _id: string;
  auctionId: string;
  bidderId: string;
  alias: number;
  mode: 'Manual' | 'Auto';
  level: number;
  levelSequence: number;
  fulfillmentMethod: 'SelfCollect';
  firstBidAt: Date;
  updatedAt: Date;
  version: number;
}
export interface AuctionBidDoc {
  _id: string;
  auctionId: string;
  bidderId: string;
  kind: 'Manual' | 'AutoSet' | 'AutoDisable' | 'BuyNow';
  amount: number | null;
  levelSequence: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
  leaderAfter: string | null;
  receiptId: string;
  decidedAt: Date;
}
// ViaPoint Order formed by an auction win or Buy Now (migration 0009).
export interface PointOrderDoc extends Lockable {
  _id: string;
  source: 'Auction';
  auctionId: string;
  intakeId: string;
  contextId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  pointId: string;
  fulfillmentMethod: 'SelfCollect';
  bookPrice: number;
  outboundFee: number;
  buyerTotal: number;
  commissionBps: number;
  commission: number;
  sellerProceeds: number;
  state: PointOrderState;
  version: number;
  createdAt: Date;
  paymentDeadline: Date;
  paidAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
  // Collection at the point (migration 0010).
  acceptanceDeadline: Date | null;
  acceptedAt: Date | null;
  collectionDeadline: Date | null;
  collectedAt: Date | null;
  inspectionDeadline: Date | null;
  resolutionReason:
    | 'ReportRejected'
    | 'RecipientDecisionOverdue'
    | 'CollectionOverdue'
    | 'InspectionClaim'
    | 'ReturnOverdue'
    | null;
  resolutionNote: string | null;
  resolutionOpenedAt: Date | null;
  // Start of the current collection window (migration 0011).
  collectionOpenedAt: Date | null;
  // Return to the point after an accepted claim (migration 0012).
  returnDeadline: Date | null;
  returnedAt: Date | null;
}
export interface PointOrderResolutionDoc {
  _id: string;
  orderId: string;
  decision:
    'RefundBuyer' | 'ResumeCollection' | 'DismissClaim' | 'RequireReturn';
  openReason: NonNullable<PointOrderDoc['resolutionReason']>;
  reason: string;
  adminId: string;
  journalId: string | null;
  // Stated with every refund decision (migration 0013).
  fault: 'BookMisdescribed' | 'BuyerDefault' | 'NoFault' | null;
  decidedAt: Date;
  receiptId: string;
}
export type PointOrderState =
  | 'AwaitingPayment'
  | 'Fulfilling'
  | 'ReadyForCollection'
  | 'Inspection'
  | 'ResolutionPending'
  | 'ReturnPending'
  | 'Completed'
  | 'Cancelled'
  | 'PaymentExpired';
export interface PointOrderClaimDoc {
  _id: string;
  orderId: string;
  claimantId: string;
  description: string;
  claimedAt: Date;
  receiptId: string;
}
export interface PointReturnDoc {
  _id: string;
  orderId: string;
  pointId: string;
  staffId: string;
  returnedBy: string;
  note: string | null;
  // Refused: the item did not match the report; nothing changed hands.
  outcome: 'Accepted' | 'Refused';
  journalId: string | null;
  receivedAt: Date;
  receiptId: string;
}
// FR-AU08 / POL-17 verified violation (migration 0013).
export interface MemberViolationDoc {
  _id: string;
  userId: string;
  kind: 'AuctionNonPayment' | 'PointOrderBuyerDefault';
  sourceId: string;
  recordedAt: Date;
  receiptId: string;
}
export interface CollectionCodeDoc extends Lockable {
  _id: string;
  orderId: string;
  recipientId: string;
  listingId: string;
  pointId: string;
  salt: string;
  codeHash: string;
  issuedAt: Date;
  expiresAt: Date;
  live: boolean;
  usedAt: Date | null;
  revokedAt: Date | null;
  receiptId: string;
}
export interface CollectionAttemptDoc {
  _id: string;
  orderId: string;
  staffId: string;
  codeId: string | null;
  outcome: 'Accepted' | 'WrongCode' | 'Expired' | 'RateLimited';
  receiptId: string;
  at: Date;
}
export interface PointHandoverDoc {
  _id: string;
  orderId: string;
  listingId: string;
  pointId: string;
  recipientId: string;
  staffId: string;
  codeId: string;
  method: 'SelfCollect';
  handedOverAt: Date;
  receiptId: string;
}

export type ExchangeStatus =
  | 'Proposed'
  | 'AcceptedAwaitingFunding'
  | 'Preparing'
  | 'InTransit'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled'
  | 'ResolutionPending';

export type ExchangeCancelReason =
  | 'FundingExpired'
  | 'ProposalExpired'
  | 'CancelledByUser'
  | 'ListingUnavailable';

export type ExchangeCancelledBy = 'System' | 'Initiator' | 'Recipient';

export interface ExchangeAddressSnapshot {
  recipientName: string;
  phone: string;
  detail: string;
  localityCode?: string | null;
  serviceAreaCode?: string | null;
}

export interface ExchangeShipmentSnapshot {
  method: 'carrier' | 'direct';
  carrierCode?: string | null;
  carrierName?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
  meetupLocation?: string | null;
  shippedAt?: Date | null;
}

export interface ExchangeDoc extends Lockable {
  _id: string;
  initiatorId: string;
  recipientId: string;
  initiatorListingId: string;
  recipientListingId: string;
  status: ExchangeStatus;
  revision: number;
  initiatorDeposit: number;
  recipientDeposit: number;
  diffAmount: number;
  diffPayerId: string | null;
  initiatorOrderId: string;
  recipientOrderId: string;
  fundingDeadline: Date | null;
  initiatorFundedAt: Date | null;
  recipientFundedAt: Date | null;
  proposalExpiresAt: Date | null;
  rejectionReason: string | null;
  cancelReason?: ExchangeCancelReason | null;
  cancelledBy?: ExchangeCancelledBy | null;
  cancelledAt?: Date | null;
  initiatorShippedAt: Date | null;
  recipientShippedAt: Date | null;
  initiatorReceivedAt: Date | null;
  recipientReceivedAt: Date | null;
  inspectionDeadline: Date | null;
  completedAt: Date | null;
  initiatorCompletedAt?: Date | null;
  recipientCompletedAt?: Date | null;
  initiatorAddress?: ExchangeAddressSnapshot | null;
  recipientAddress?: ExchangeAddressSnapshot | null;
  initiatorShipment?: ExchangeShipmentSnapshot | null;
  recipientShipment?: ExchangeShipmentSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
  lockSeq: number;
}

export interface MemberNotificationDoc {
  _id: string;
  userId: string;
  kind:
    | 'AuctionOutbid'
    | 'AuctionWon'
    | 'AuctionSold'
    | 'AuctionBoughtNow'
    | 'AuctionUnsold'
    | 'AuctionCancelled'
    | 'AuctionOnHold'
    | 'AuctionPaymentExpired'
    | 'AuctionPaid'
    | 'ExchangeProposed'
    | 'ExchangeAccepted'
    | 'ExchangeFunded'
    | 'ExchangeShipped'
    | 'ExchangeReceived'
    | 'ExchangeCompleted'
    | 'ExchangeCancelled'
    | 'ExchangeRejected';
  title: string;
  body: string;
  targetType: 'Auction' | 'Exchange';
  targetId: string;
  dedupeKey: string;
  createdAt: Date;
  readAt: Date | null;
}
export interface AuthActionTokenDoc {
  _id: string; userId: string; purpose: 'VerifyEmail' | 'ResetPassword';
  tokenHash: string; createdAt: Date; expiresAt: Date; consumedAt: Date | null;
}
export interface AuthOtpChallengeDoc {
  _id: string; userId: string | null; emailHash: string;
  purpose: 'VerifyEmail' | 'ResetPassword'; codeHash: string;
  attempts: number; lockSeq: number; createdAt: Date; expiresAt: Date;
  consumedAt: Date | null;
}
export interface AuthMailJobDoc {
  _id: string; userId: string; tokenId: string | null; encryptedPayload: string;
  status: 'Pending' | 'Sending' | 'Sent' | 'Failed' | 'Cancelled'; attempts: number;
  nextAttemptAt: Date; leaseId: string | null; leaseUntil: Date | null;
  expiresAt: Date; createdAt: Date; updatedAt: Date;
}
export interface AuthEventDoc {
  _id: string; userId: string; action: 'Registered' | 'EmailVerified' | 'PasswordReset'; createdAt: Date;
}

export interface ExchangeMessageDoc {
  _id: string;
  exchangeId: string;
  senderId: string;
  body: string;
  sentAt: Date;
}

export interface TransactionReviewDoc extends Lockable {
  _id: string;
  transactionType: 'Exchange' | 'Order';
  transactionId: string;
  authorId: string;
  authorName: string;
  targetUserId: string;
  bookRating: number;
  partnerRating: number;
  tags: string[];
  comment: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
