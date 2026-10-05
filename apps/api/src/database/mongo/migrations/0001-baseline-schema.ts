import {
  and,
  between,
  document,
  eq,
  f,
  gt,
  gte,
  HOUR_MS,
  index,
  isbn10Valid,
  isbn13Valid,
  isNull,
  lt,
  lte,
  ne,
  nonNullCount,
  notNull,
  oneOf,
  or,
  plusMs,
  t,
  trimLen,
  trimmed,
  unique,
  uniqueWhenSet,
  type CollectionSpec,
} from '../schema-dsl.js';

// Frozen baseline equivalent to PostgreSQL migrations 20260924000000 through
// 20260928070000 (see docs/refactor/MIG02_MODEL_MAP.md). Never edit after it has
// been applied anywhere; add a later migration instead (the runner checks the
// checksum of this definition).

const MEDIA_FAILURES = [
  'InvalidImage',
  'UnsupportedFormat',
  'TooLarge',
  'TooManyPixels',
  'MultipleFrames',
  'ProcessingFailed',
  'UploadExpired',
];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const SYSTEM_OPERATIONS: [string, string][] = [
  ['OrderExpiry', 'expireOrder'],
  ['OrderConfirmationExpiry', 'expireSellerConfirmation'],
  ['OrderRefund', 'refundOrder'],
  ['OrderPickupExpiry', 'expireOrderPickup'],
  ['OrderDeliveryExpiry', 'expireOrderDelivery'],
];
const TARGETS = [
  'listingId',
  'bookId',
  'mediaId',
  'addressBookId',
  'quoteId',
  'contextId',
  'topupId',
];
const targetFields = Object.fromEntries(TARGETS.map((k) => [k, t.nuuid()]));
const principalRule = (operationField: string) =>
  and(
    eq(nonNullCount('actorId', 'systemActor'), 1),
    or(
      isNull('systemActor'),
      and(
        notNull('contextId'),
        or(
          ...SYSTEM_OPERATIONS.map(([actor, op]) =>
            and(eq(f('systemActor'), actor), eq(f(operationField), op)),
          ),
        ),
      ),
    ),
  );
const CAPITAL = '00000000-0000-4000-8000-000000000001';
const CLEARING = '00000000-0000-4000-8000-000000000002';
const OPENING = '00000000-0000-4000-8000-000000000003';
const CHECKLIST = [
  'catalogMatches',
  'photosClear',
  'conditionDisclosed',
  'readable',
  'pricingValid',
  'contentAppropriate',
];

export const baselineCollections: CollectionSpec[] = [
  // ---------------------------------------------------------------- auth
  {
    name: 'users',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      emailNormalized: t.str(),
      passwordHash: t.str(),
      displayName: t.str(),
      status: t.enum(
        'PENDING_VERIFICATION',
        'ACTIVE',
        'RESTRICTED',
        'LOCKED',
        'DISABLED',
      ),
      emailVerifiedAt: t.ndate(),
      createdAt: t.date(),
      updatedAt: t.date(),
      roles: {
        bsonType: 'array',
        items: document({
          role: t.enum('MEMBER', 'STAFF', 'ADMIN', 'TEST_OPERATOR'),
          grantedAt: t.date(),
        }),
      },
      lockSeq: t.lockSeq(),
    }),
    // user_roles primary key (user_id, role).
    expr: eq(
      { $size: f('roles.role') },
      { $size: { $setUnion: [f('roles.role')] } },
    ),
    indexes: [unique({ emailNormalized: 1 }, 'users_email_normalized_key')],
  },
  {
    name: 'auth_sessions',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      refreshTokenHash: t.str(),
      expiresAt: t.date(),
      revokedAt: t.ndate(),
      createdAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    indexes: [
      unique({ refreshTokenHash: 1 }, 'auth_sessions_refresh_token_hash_key'),
      index({ userId: 1 }, 'auth_sessions_user_id_idx'),
      index({ expiresAt: 1 }, 'auth_sessions_expires_at_idx'),
    ],
  },
  {
    name: 'login_attempts',
    access: 'deletable',
    schema: document({
      _id: t.str(),
      attempts: t.int(),
      expiresAt: t.date(),
    }),
    indexes: [index({ expiresAt: 1 }, 'login_attempts_expires_at_idx')],
  },
  // ------------------------------------------------------------- catalog
  {
    name: 'catalog_books',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      requesterId: t.uuid(),
      status: t.enum('Pending', 'Confirmed', 'Rejected'),
      version: t.int(1),
      currentRevisionId: t.nuuid(),
      confirmedIsbn: t.nstr(13),
      searchText: t.str(),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    expr: or(
      isNull('confirmedIsbn'),
      and(eq(f('status'), 'Confirmed'), isbn13Valid(f('confirmedIsbn'))),
    ),
    indexes: [
      uniqueWhenSet('confirmedIsbn', 'catalog_books_confirmed_isbn_key'),
      index(
        { requesterId: 1, updatedAt: 1, _id: 1 },
        'catalog_books_requester_id_updated_at_id_idx',
      ),
      index(
        { status: 1, createdAt: 1, _id: 1 },
        'catalog_books_status_created_at_id_idx',
      ),
    ],
  },
  {
    name: 'catalog_revisions',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      bookId: t.uuid(),
      number: t.int(1),
      title: t.str(300),
      authors: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 10,
        items: t.str(),
      },
      publisher: t.nstr(200),
      publicationYear: t.nint(1, 9999),
      language: t.str(35),
      edition: t.nstr(200),
      category: t.str(80),
      isbn: t.nstr(13),
      submittedAt: t.date(),
    }),
    expr: and(
      gt(trimLen('title'), 0),
      gt(trimLen('language'), 0),
      gt(trimLen('category'), 0),
      {
        $allElementsTrue: [
          {
            $map: {
              input: f('authors'),
              in: between(
                { $strLenCP: { $trim: { input: '$$this', chars: ' ' } } },
                1,
                200,
              ),
            },
          },
        ],
      },
      or(isNull('isbn'), isbn10Valid(f('isbn')), isbn13Valid(f('isbn'))),
    ),
    indexes: [
      unique({ bookId: 1, number: 1 }, 'catalog_revisions_book_id_number_key'),
    ],
  },
  {
    name: 'catalog_decisions',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      revisionId: t.uuid(),
      reviewerId: t.uuid(),
      decision: t.enum('Confirm', 'Reject'),
      reason: t.nstr(1000),
      decidedAt: t.date(),
    }),
    expr: or(
      and(
        eq(f('decision'), 'Reject'),
        notNull('reason'),
        between(trimLen('reason'), 10, 1000),
      ),
      and(eq(f('decision'), 'Confirm'), isNull('reason')),
    ),
    indexes: [unique({ revisionId: 1 }, 'catalog_decisions_revision_id_key')],
  },
  // ------------------------------------------------------------- listings
  {
    name: 'listings',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      ownerId: t.uuid(),
      version: t.int(1),
      moderation: t.enum('Draft', 'PendingReview', 'Approved', 'Rejected'),
      visibility: t.enum('Visible', 'Hidden', 'Removed'),
      trade: t.enum(
        'Available',
        'Reserved',
        'Sold',
        'Exchanged',
        'ClosedUnavailable',
      ),
      currentRevisionId: t.nuuid(),
      removalReason: t.nstr(1000),
      deletedAt: t.ndate(),
      publishedAt: t.ndate(),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    expr: or(
      and(
        eq(f('visibility'), 'Removed'),
        notNull('removalReason'),
        between(trimLen('removalReason'), 10, 1000),
      ),
      and(ne(f('visibility'), 'Removed'), isNull('removalReason')),
    ),
    indexes: [
      index(
        { ownerId: 1, updatedAt: 1, _id: 1 },
        'listings_owner_id_updated_at_id_idx',
      ),
      index(
        { moderation: 1, visibility: 1, trade: 1, publishedAt: 1, _id: 1 },
        'listings_moderation_visibility_trade_published_at_id_idx',
      ),
    ],
  },
  {
    name: 'listing_revisions',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      listingId: t.uuid(),
      number: t.int(1),
      bookId: t.nuuid(),
      mode: t.nenum('Sale', 'Exchange', 'Both'),
      condition: t.nenum('LikeNew', 'Good', 'Fair', 'Worn'),
      pages: t.str(1000),
      coverNote: t.str(1000),
      notes: t.str(1000),
      accessories: t.str(1000),
      readable: t.nbool(),
      hasMissingPages: t.nbool(),
      missingEssentialContent: t.nbool(),
      description: t.str(5000),
      salePrice: t.nint(10_000, 1_000_000),
      exchangeValue: t.nint(10_000, 1_000_000),
      submittedAt: t.ndate(),
      ownershipDeclaredAt: t.ndate(),
      createdAt: t.date(),
      originAddressId: t.nuuid(),
      originAddressVersion: t.nint(1),
      originServiceAreaCode: t.nstr(40),
      lockSeq: t.lockSeq(),
    }),
    expr: and(
      // revision_mode_prices
      or(
        and(isNull('mode'), isNull('salePrice'), isNull('exchangeValue')),
        and(eq(f('mode'), 'Sale'), isNull('exchangeValue')),
        and(eq(f('mode'), 'Exchange'), isNull('salePrice')),
        eq(f('mode'), 'Both'),
      ),
      // submitted_content_complete
      or(
        isNull('submittedAt'),
        and(
          notNull('bookId'),
          notNull('mode'),
          notNull('condition'),
          notNull('ownershipDeclaredAt'),
          eq(f('readable'), true),
          eq(f('missingEssentialContent'), false),
          notNull('hasMissingPages'),
          gt(trimLen('pages'), 0),
          gt(trimLen('coverNote'), 0),
          gt(trimLen('notes'), 0),
          gt(trimLen('accessories'), 0),
          between(trimLen('description'), 30, 5000),
          or(eq(f('mode'), 'Exchange'), notNull('salePrice')),
          or(eq(f('mode'), 'Sale'), notNull('exchangeValue')),
        ),
      ),
      // revision_fulfillment_complete
      or(
        eq(
          nonNullCount(
            'originAddressId',
            'originAddressVersion',
            'originServiceAreaCode',
          ),
          0,
        ),
        and(
          eq(
            nonNullCount(
              'originAddressId',
              'originAddressVersion',
              'originServiceAreaCode',
            ),
            3,
          ),
          eq(f('originServiceAreaCode'), 'HCM-DEMO-v1'),
        ),
      ),
    ),
    indexes: [
      unique(
        { listingId: 1, number: 1 },
        'listing_revisions_listing_id_number_key',
      ),
      index({ bookId: 1 }, 'listing_revisions_book_id_idx'),
      index(
        { salePrice: 1, listingId: 1 },
        'listing_revisions_sale_price_listing_id_idx',
      ),
      index(
        { exchangeValue: 1, listingId: 1 },
        'listing_revisions_exchange_value_listing_id_idx',
      ),
      index(
        { submittedAt: 1, listingId: 1 },
        'listing_revisions_submitted_at_listing_id_idx',
      ),
    ],
  },
  {
    name: 'listing_media',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      listingId: t.uuid(),
      version: t.int(1),
      status: t.enum('Pending', 'Processing', 'Ready', 'Failed'),
      stagingKey: t.str(),
      pinnedKey: t.nstr(),
      derivativeKey: t.nstr(),
      mimeType: { bsonType: 'string', enum: IMAGE_MIME },
      byteSize: t.int(1, 10_000_000),
      sha256: t.sha(),
      width: t.nint(1),
      height: t.nint(1),
      failureCode: t.nenum(...MEDIA_FAILURES),
      expiresAt: t.date(),
      purgedAt: t.ndate(),
      reservedBytes: t.int(0, 16_000_000),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    expr: and(
      // media_pixels
      or(
        and(isNull('width'), isNull('height')),
        and(
          notNull('width'),
          notNull('height'),
          lte({ $multiply: [f('width'), f('height')] }, 40_000_000),
        ),
      ),
      // media_ready / media_processing / media_failure
      or(
        ne(f('status'), 'Ready'),
        and(
          notNull('pinnedKey'),
          notNull('derivativeKey'),
          notNull('width'),
          notNull('height'),
        ),
      ),
      or(ne(f('status'), 'Processing'), notNull('pinnedKey')),
      or(
        and(eq(f('status'), 'Failed'), notNull('failureCode')),
        and(ne(f('status'), 'Failed'), isNull('failureCode')),
      ),
    ),
    indexes: [
      unique({ stagingKey: 1 }, 'listing_media_staging_key_key'),
      uniqueWhenSet('pinnedKey', 'listing_media_pinned_key_key'),
      uniqueWhenSet('derivativeKey', 'listing_media_derivative_key_key'),
      index(
        { listingId: 1, createdAt: 1, _id: 1 },
        'listing_media_listing_id_created_at_id_idx',
      ),
      index({ status: 1, expiresAt: 1 }, 'listing_media_status_expires_at_idx'),
    ],
  },
  {
    name: 'revision_media',
    access: 'deletable',
    schema: document({
      _id: t.str(),
      listingId: t.uuid(),
      revisionId: t.uuid(),
      mediaId: t.uuid(),
      position: t.int(0, 7),
    }),
    expr: eq(f('_id'), { $concat: [f('revisionId'), ':', f('mediaId')] }),
    indexes: [
      unique(
        { revisionId: 1, position: 1 },
        'revision_media_revision_id_position_key',
      ),
      index({ mediaId: 1 }, 'revision_media_media_id_idx'),
    ],
  },
  {
    name: 'listing_decisions',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      revisionId: t.uuid(),
      reviewerId: t.uuid(),
      decision: t.enum('Approve', 'Reject'),
      checklist: t.nobject(),
      reason: t.nstr(1000),
      decidedAt: t.date(),
    }),
    expr: or(
      and(
        eq(f('decision'), 'Reject'),
        notNull('reason'),
        between(trimLen('reason'), 10, 1000),
        isNull('checklist'),
      ),
      and(
        eq(f('decision'), 'Approve'),
        isNull('reason'),
        notNull('checklist'),
        eq({ $size: { $objectToArray: f('checklist') } }, CHECKLIST.length),
        ...CHECKLIST.map((k) => eq(f(`checklist.${k}`), true)),
      ),
    ),
    indexes: [unique({ revisionId: 1 }, 'listing_decisions_revision_id_key')],
  },
  // ---------------------------------------------- command history/outbox
  {
    name: 'mutation_receipts',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      principal: t.str(),
      actorId: t.nuuid(),
      systemActor: t.nstr(40),
      operation: t.str(80),
      key: t.uuid(),
      payloadHash: t.sha(),
      ...targetFields,
      resultVersion: t.int(1),
      result: t.object(),
      committedAt: t.date(),
    }),
    expr: and(
      principalRule('operation'),
      eq(f('principal'), {
        $cond: [
          notNull('actorId'),
          { $concat: ['user:', f('actorId')] },
          { $concat: ['system:', f('systemActor')] },
        ],
      }),
      eq(nonNullCount(...TARGETS), 1),
    ),
    indexes: [
      unique(
        { principal: 1, operation: 1, key: 1 },
        'mutation_receipts_principal_operation_key_key',
      ),
      index({ contextId: 1 }, 'mutation_receipts_context_id_idx', {
        contextId: { $type: 'string' },
      }),
      index({ topupId: 1 }, 'mutation_receipts_topup_id_idx', {
        topupId: { $type: 'string' },
      }),
    ],
  },
  {
    name: 'audit_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      actorId: t.nuuid(),
      systemActor: t.nstr(40),
      receiptId: t.nuuid(),
      ...targetFields,
      action: t.str(80),
      before: t.nobject(),
      after: t.nobject(),
      reason: t.nstr(1000),
      requestId: t.uuid(),
      createdAt: t.date(),
    }),
    expr: and(principalRule('action'), eq(nonNullCount(...TARGETS), 1)),
    indexes: [
      uniqueWhenSet('receiptId', 'audit_events_receipt_id_key'),
      index(
        { listingId: 1, createdAt: 1 },
        'audit_events_listing_id_created_at_idx',
      ),
      index({ bookId: 1, createdAt: 1 }, 'audit_events_book_id_created_at_idx'),
    ],
  },
  {
    // Identity/payload immutability (guard_outbox) is a write-protocol rule:
    // only lease/attempt/processed fields are ever $set by the application.
    name: 'outbox_events',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      auditId: t.uuid(),
      type: t.str(80),
      payload: t.object(),
      attempts: t.int(0),
      availableAt: t.date(),
      leaseUntil: t.ndate(),
      processedAt: t.ndate(),
      createdAt: t.date(),
    }),
    indexes: [
      unique({ auditId: 1 }, 'outbox_events_audit_id_key'),
      index(
        { processedAt: 1, availableAt: 1 },
        'outbox_events_processed_at_available_at_idx',
      ),
    ],
  },
  {
    name: 'media_processing_jobs',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      mediaId: t.uuid(),
      attempts: t.int(0),
      availableAt: t.date(),
      leaseUntil: t.ndate(),
      finishedAt: t.ndate(),
    }),
    indexes: [
      unique({ mediaId: 1 }, 'media_processing_jobs_media_id_key'),
      index(
        { finishedAt: 1, availableAt: 1 },
        'media_processing_jobs_finished_at_available_at_idx',
      ),
    ],
  },
  // ------------------------------------------------------------ addresses
  {
    name: 'service_areas',
    access: 'reference',
    schema: document({
      _id: t.str(40),
      name: t.str(100),
      demoOnly: t.bool(),
    }),
    indexes: [],
  },
  {
    name: 'service_localities',
    access: 'reference',
    schema: document({
      _id: t.str(),
      areaCode: t.str(40),
      code: t.str(40),
      label: t.str(120),
    }),
    expr: eq(f('_id'), { $concat: [f('areaCode'), ':', f('code')] }),
    indexes: [],
  },
  {
    name: 'address_books',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      version: t.int(0),
      lockSeq: t.lockSeq(),
    }),
    indexes: [],
  },
  {
    name: 'member_addresses',
    access: 'deletable',
    schema: document({
      _id: t.uuid(),
      ownerId: t.uuid(),
      version: t.int(1),
      recipientName: t.str(100),
      phone: t.str(10, '^0[0-9]{9}$'),
      serviceAreaCode: t.str(40),
      localityCode: t.str(40),
      detail: t.str(300),
      isDefault: t.bool(),
      createdAt: t.date(),
    }),
    expr: and(
      between(trimLen('recipientName'), 2, 100),
      between(trimLen('detail'), 5, 300),
    ),
    indexes: [
      index(
        { ownerId: 1, createdAt: 1, _id: 1 },
        'member_addresses_owner_id_created_at_id_idx',
      ),
      unique({ ownerId: 1 }, 'address_one_default', { isDefault: true }),
    ],
  },
  {
    name: 'address_identities',
    access: 'appendOnly',
    schema: document({ _id: t.uuid(), ownerId: t.uuid() }),
    indexes: [],
  },
  // --------------------------------------------------------------- quotes
  {
    name: 'sale_quote_policies',
    access: 'reference',
    schema: document({
      _id: t.str(60),
      shippingFee: t.int(0, 1_000_000),
      commissionBps: t.int(0, 10_000),
      ttlSeconds: t.int(1, 300),
    }),
    indexes: [],
  },
  {
    name: 'sale_quote_policy_selection',
    access: 'reference',
    schema: document({
      _id: t.enum('DirectSale'),
      policyCode: t.str(60),
    }),
    indexes: [
      unique({ policyCode: 1 }, 'sale_quote_policy_selection_policy_code_key'),
    ],
  },
  {
    name: 'sale_quotes',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      version: t.int(1, 1),
      buyerId: t.uuid(),
      sellerId: t.uuid(),
      listingId: t.uuid(),
      listingVersion: t.int(1),
      listingRevisionId: t.uuid(),
      catalogRevisionId: t.uuid(),
      originAddressId: t.uuid(),
      originAddressVersion: t.int(1),
      destinationAddressId: t.uuid(),
      destinationAddressVersion: t.int(1),
      serviceAreaCode: t.enum('HCM-DEMO-v1'),
      policyCode: t.str(60),
      bookPrice: t.int(10_000, 1_000_000),
      shippingFee: t.int(0, 1_000_000),
      commissionBps: t.int(0, 10_000),
      commission: t.int(),
      buyerTotal: t.int(),
      sellerProceeds: t.int(0),
      createdAt: t.date(),
      expiresAt: t.date(),
    }),
    expr: and(
      ne(f('sellerId'), f('buyerId')),
      eq(f('commission'), {
        $trunc: {
          $divide: [
            {
              $add: [{ $multiply: [f('bookPrice'), f('commissionBps')] }, 5000],
            },
            10_000,
          ],
        },
      }),
      eq(f('buyerTotal'), { $add: [f('bookPrice'), f('shippingFee')] }),
      eq(f('sellerProceeds'), {
        $subtract: [f('buyerTotal'), f('commission')],
      }),
      gt(f('expiresAt'), f('createdAt')),
      lte(f('expiresAt'), plusMs('createdAt', 5 * 60_000)),
    ),
    indexes: [
      index(
        { buyerId: 1, expiresAt: 1 },
        'sale_quotes_buyer_id_expires_at_idx',
      ),
    ],
  },
  // --------------------------------------------------------------- orders
  {
    name: 'direct_orders',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      buyerId: t.uuid(),
      sellerId: t.uuid(),
      quoteId: t.uuid(),
      version: t.int(1),
      state: t.enum(
        'AwaitingPayment',
        'Cancelled',
        'PaymentExpired',
        'PendingSellerConfirmation',
        'SettlementPending',
        'Preparing',
        'InTransit',
        'ResolutionPending',
      ),
      createdAt: t.date(),
      paymentDeadline: t.date(),
      closedAt: t.ndate(),
      paidAt: t.ndate(),
      sellerConfirmationDeadline: t.ndate(),
      cancellationRequestedAt: t.ndate(),
      cancellationReason: t.nstr(40),
      lockSeq: t.lockSeq(),
    }),
    // order_shape + order_terminal_time as of migration 20260928060000.
    expr: and(
      ne(f('buyerId'), f('sellerId')),
      eq(f('paymentDeadline'), plusMs('createdAt', 15 * 60_000)),
      or(
        and(
          isNull('paidAt'),
          isNull('sellerConfirmationDeadline'),
          isNull('cancellationRequestedAt'),
          isNull('cancellationReason'),
          or(
            and(
              eq(f('state'), 'AwaitingPayment'),
              eq(f('version'), 1),
              isNull('closedAt'),
            ),
            and(
              eq(f('state'), 'Cancelled'),
              eq(f('version'), 2),
              gte(f('closedAt'), f('createdAt')),
              lt(f('closedAt'), f('paymentDeadline')),
            ),
            and(
              eq(f('state'), 'PaymentExpired'),
              eq(f('version'), 2),
              gte(f('closedAt'), f('paymentDeadline')),
            ),
          ),
        ),
        and(
          notNull('paidAt'),
          gte(f('paidAt'), f('createdAt')),
          lt(f('paidAt'), f('paymentDeadline')),
          eq(f('sellerConfirmationDeadline'), plusMs('paidAt', 48 * HOUR_MS)),
          or(
            and(
              or(
                and(
                  eq(f('state'), 'PendingSellerConfirmation'),
                  eq(f('version'), 2),
                ),
                and(eq(f('state'), 'Preparing'), eq(f('version'), 3)),
                and(eq(f('state'), 'InTransit'), eq(f('version'), 4)),
                and(
                  eq(f('state'), 'ResolutionPending'),
                  oneOf(f('version'), [4, 5]),
                ),
              ),
              isNull('closedAt'),
              isNull('cancellationRequestedAt'),
              isNull('cancellationReason'),
            ),
            and(
              oneOf(f('state'), ['SettlementPending', 'Cancelled']),
              notNull('cancellationRequestedAt'),
              gte(f('cancellationRequestedAt'), f('paidAt')),
              notNull('cancellationReason'),
              or(
                and(
                  oneOf(f('cancellationReason'), [
                    'BuyerCancelled',
                    'SellerRejected',
                  ]),
                  lt(
                    f('cancellationRequestedAt'),
                    f('sellerConfirmationDeadline'),
                  ),
                ),
                and(
                  eq(f('cancellationReason'), 'SellerConfirmationExpired'),
                  gte(
                    f('cancellationRequestedAt'),
                    f('sellerConfirmationDeadline'),
                  ),
                ),
              ),
              or(
                and(
                  eq(f('state'), 'SettlementPending'),
                  eq(f('version'), 3),
                  isNull('closedAt'),
                ),
                and(
                  eq(f('state'), 'Cancelled'),
                  eq(f('version'), 4),
                  notNull('closedAt'),
                  gte(f('closedAt'), f('cancellationRequestedAt')),
                ),
              ),
            ),
          ),
        ),
      ),
      eq(
        oneOf(f('state'), ['Cancelled', 'PaymentExpired']),
        notNull('closedAt'),
      ),
    ),
    indexes: [
      unique({ quoteId: 1 }, 'direct_orders_quote_id_key'),
      index({ buyerId: 1, state: 1 }, 'direct_orders_buyer_id_state_idx'),
      index({ sellerId: 1, state: 1 }, 'direct_orders_seller_id_state_idx'),
      index(
        { state: 1, paymentDeadline: 1, _id: 1 },
        'direct_orders_state_payment_deadline_id_idx',
      ),
      index(
        { state: 1, sellerConfirmationDeadline: 1, _id: 1 },
        'direct_orders_state_seller_confirmation_deadline_id_idx',
      ),
    ],
  },
  {
    name: 'order_preparations',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      acceptedAt: t.date(),
      pickupDeadline: t.date(),
      policyCode: t.enum('ORDER-PICKUP-v1'),
      receiptId: t.uuid(),
    }),
    expr: eq(f('pickupDeadline'), plusMs('acceptedAt', 48 * HOUR_MS)),
    indexes: [
      unique({ receiptId: 1 }, 'order_preparations_receipt_id_key'),
      index(
        { pickupDeadline: 1, _id: 1 },
        'order_preparations_pickup_deadline_order_id_idx',
      ),
    ],
  },
  {
    name: 'pickup_reviews',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      openedAt: t.date(),
      reason: t.enum('PickupDeadlineExceeded'),
      receiptId: t.uuid(),
    }),
    indexes: [
      unique({ orderId: 1 }, 'pickup_reviews_order_id_key'),
      unique({ receiptId: 1 }, 'pickup_reviews_receipt_id_key'),
    ],
  },
  {
    // Transition Pending -> Ready only (guard_packaging) is a write-protocol rule.
    name: 'order_packaging_evidence',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      version: t.int(1, 2),
      status: t.enum('Pending', 'Ready'),
      mimeType: { bsonType: 'string', enum: IMAGE_MIME },
      byteSize: t.int(1, 10_000_000),
      sha256: t.sha(),
      reservedBytes: t.int(),
      createdAt: t.date(),
      uploadedAt: t.ndate(),
      derivativeSha256: t.nsha(),
      derivativeBytes: t.nint(1, 2_000_000),
      width: t.nint(1, 1600),
      height: t.nint(1, 1600),
      createReceiptId: t.uuid(),
      uploadReceiptId: t.nuuid(),
    }),
    expr: and(
      eq(f('reservedBytes'), { $add: [f('byteSize'), 2_000_000] }),
      or(
        and(
          eq(f('status'), 'Pending'),
          eq(f('version'), 1),
          eq(
            nonNullCount(
              'uploadedAt',
              'derivativeSha256',
              'derivativeBytes',
              'width',
              'height',
              'uploadReceiptId',
            ),
            0,
          ),
        ),
        and(
          eq(f('status'), 'Ready'),
          eq(f('version'), 2),
          eq(
            nonNullCount(
              'uploadedAt',
              'derivativeSha256',
              'derivativeBytes',
              'width',
              'height',
              'uploadReceiptId',
            ),
            6,
          ),
          gte(f('uploadedAt'), f('createdAt')),
        ),
      ),
    ),
    indexes: [
      unique({ orderId: 1, sha256: 1 }, 'packaging_identity'),
      unique(
        { createReceiptId: 1 },
        'order_packaging_evidence_create_receipt_id_key',
      ),
      uniqueWhenSet(
        'uploadReceiptId',
        'order_packaging_evidence_upload_receipt_id_key',
      ),
      index(
        { orderId: 1, createdAt: 1, _id: 1 },
        'order_packaging_evidence_order_id_created_at_id_idx',
      ),
    ],
  },
  {
    name: 'direct_shipments',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      version: t.int(1, 1),
      state: t.enum('LabelCreated'),
      carrier: t.enum('LatLaiSimulator'),
      trackingCode: t.str(35, '^LL-[A-Z0-9]{8,32}$'),
      direction: t.enum('Outbound'),
      origin: t.object(),
      destination: t.object(),
      shippingFee: t.int(0),
      feePolicy: t.enum('SellerAdvanceBuyerReimbursement'),
      registeredAt: t.date(),
      receiptId: t.uuid(),
    }),
    indexes: [
      unique({ orderId: 1 }, 'direct_shipments_order_id_key'),
      unique(
        { carrier: 1, trackingCode: 1 },
        'direct_shipments_carrier_tracking_code_key',
      ),
      unique({ receiptId: 1 }, 'direct_shipments_receipt_id_key'),
    ],
  },
  {
    name: 'shipment_packaging_evidence',
    access: 'appendOnly',
    schema: document({
      _id: t.str(),
      shipmentId: t.uuid(),
      orderId: t.uuid(),
      evidenceId: t.uuid(),
      position: t.int(0, 7),
    }),
    expr: eq(f('_id'), { $concat: [f('shipmentId'), ':', f('evidenceId')] }),
    indexes: [
      unique(
        { shipmentId: 1, position: 1 },
        'shipment_packaging_evidence_shipment_id_position_key',
      ),
    ],
  },
  {
    name: 'carrier_pickup_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      shipmentId: t.uuid(),
      sequence: t.int(1, 128),
      occurredAt: t.date(),
      receivedAt: t.date(),
      outcome: t.enum('Applied', 'Duplicate', 'ReviewRequired'),
      deliveryDeadline: t.ndate(),
      policyCode: t.enum('CARRIER-PICKUP-v1'),
      payloadHash: t.sha(),
      signature: t.sha(),
      receiptId: t.uuid(),
    }),
    expr: and(
      lte(f('occurredAt'), f('receivedAt')),
      or(
        and(
          eq(f('outcome'), 'Applied'),
          eq(f('deliveryDeadline'), plusMs('occurredAt', 240 * HOUR_MS)),
        ),
        and(ne(f('outcome'), 'Applied'), isNull('deliveryDeadline')),
      ),
    ),
    indexes: [
      unique(
        { shipmentId: 1, sequence: 1 },
        'carrier_pickup_events_shipment_id_sequence_key',
      ),
      unique({ shipmentId: 1 }, 'pickup_one_applied', { outcome: 'Applied' }),
      unique({ receiptId: 1 }, 'carrier_pickup_events_receipt_id_key'),
      index(
        { orderId: 1, sequence: 1 },
        'carrier_pickup_events_order_sequence_idx',
      ),
      index(
        { deliveryDeadline: 1, _id: 1 },
        'carrier_pickup_delivery_candidates',
        { outcome: 'Applied' },
      ),
    ],
  },
  {
    name: 'carrier_pickup_reviews',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      eventId: t.uuid(),
      openedAt: t.date(),
      reason: t.enum('LatePickup', 'ConflictingPickup'),
    }),
    indexes: [
      unique({ orderId: 1 }, 'carrier_pickup_reviews_order_id_key'),
      unique({ eventId: 1 }, 'carrier_pickup_reviews_event_id_key'),
    ],
  },
  {
    name: 'order_delivery_reviews',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      pickupEventId: t.uuid(),
      openedAt: t.date(),
      openedBy: t.enum('DeadlineWorker', 'BuyerReport'),
      policyCode: t.enum('ORDER-DELIVERY-REVIEW-v1'),
      receiptId: t.uuid(),
    }),
    indexes: [
      unique({ orderId: 1 }, 'order_delivery_reviews_order_id_key'),
      unique(
        { pickupEventId: 1 },
        'order_delivery_reviews_pickup_event_id_key',
      ),
      unique({ receiptId: 1 }, 'order_delivery_reviews_receipt_id_key'),
      index({ openedAt: 1, _id: 1 }, 'order_delivery_reviews_opened_at_id_idx'),
    ],
  },
  {
    name: 'order_non_receipt_reports',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      orderId: t.uuid(),
      submittedAt: t.date(),
      description: t.str(2000),
      receiptId: t.uuid(),
    }),
    expr: and(
      between(trimLen('description'), 20, 2000),
      eq(f('description'), trimmed('description')),
    ),
    indexes: [
      unique({ orderId: 1 }, 'order_non_receipt_reports_order_id_key'),
      unique({ receiptId: 1 }, 'order_non_receipt_reports_receipt_id_key'),
    ],
  },
  // ----------------------------------------------- workflow/commitments
  {
    name: 'workflow_contexts',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      kind: t.enum('Order'),
      orderId: t.uuid(),
      version: t.int(1, 2),
      ownershipPhase: t.enum('Holding', 'Closed'),
      lockSeq: t.lockSeq(),
    }),
    indexes: [unique({ orderId: 1 }, 'workflow_contexts_order_id_key')],
  },
  {
    name: 'workflow_items',
    access: 'appendOnly',
    schema: document({
      _id: t.str(),
      contextId: t.uuid(),
      listingId: t.uuid(),
      listingRevisionId: t.uuid(),
      catalogRevisionId: t.uuid(),
      snapshot: t.object(),
    }),
    expr: eq(f('_id'), { $concat: [f('contextId'), ':', f('listingId')] }),
    indexes: [index({ contextId: 1 }, 'workflow_items_context_id_idx')],
  },
  {
    name: 'agreement_snapshots',
    access: 'appendOnly',
    schema: document({ _id: t.uuid(), snapshot: t.object() }),
    expr: eq(f('snapshot.schemaVersion'), 1),
    indexes: [],
  },
  {
    name: 'exclusive_commitments',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      listingId: t.uuid(),
      currentContextId: t.uuid(),
      version: t.int(1, 2),
      status: t.enum('Active', 'Released'),
      acquiredAt: t.date(),
      endedAt: t.ndate(),
      reason: t.nenum('Cancelled', 'PaymentExpired'),
      lockSeq: t.lockSeq(),
    }),
    expr: or(
      and(
        eq(f('status'), 'Active'),
        eq(f('version'), 1),
        isNull('endedAt'),
        isNull('reason'),
      ),
      and(
        eq(f('status'), 'Released'),
        eq(f('version'), 2),
        notNull('endedAt'),
        notNull('reason'),
        gte(f('endedAt'), f('acquiredAt')),
      ),
    ),
    indexes: [
      unique({ listingId: 1 }, 'commitment_one_active_listing', {
        status: 'Active',
      }),
      index(
        { currentContextId: 1, listingId: 1 },
        'exclusive_commitments_current_context_id_listing_id_idx',
      ),
    ],
  },
  {
    name: 'commitment_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      commitmentId: t.uuid(),
      sequence: t.int(1, 2),
      kind: t.enum('Acquired', 'Released'),
      beforeVersion: t.int(),
      afterVersion: t.int(),
      receiptId: t.uuid(),
      occurredAt: t.date(),
    }),
    expr: or(
      and(
        eq(f('kind'), 'Acquired'),
        eq(f('sequence'), 1),
        eq(f('beforeVersion'), 0),
        eq(f('afterVersion'), 1),
      ),
      and(
        eq(f('kind'), 'Released'),
        eq(f('sequence'), 2),
        eq(f('beforeVersion'), 1),
        eq(f('afterVersion'), 2),
      ),
    ),
    indexes: [
      unique(
        { commitmentId: 1, sequence: 1 },
        'commitment_events_commitment_id_sequence_key',
      ),
    ],
  },
  // --------------------------------------------------------------- wallet
  {
    // Append-only like the PostgreSQL immutability trigger. Postings serialize
    // on account_locks (the ledger_entry_lock trigger equivalent).
    name: 'wallet_accounts',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      ownerId: t.nuuid(),
      orderId: t.nuuid(),
      purpose: t.enum(
        'UserAvailable',
        'OrderHold',
        'SimulatorCapital',
        'SimulatorClearing',
      ),
      currency: t.enum('VND'),
    }),
    expr: or(
      and(
        eq(f('purpose'), 'UserAvailable'),
        notNull('ownerId'),
        isNull('orderId'),
      ),
      and(eq(f('purpose'), 'OrderHold'), isNull('ownerId'), notNull('orderId')),
      and(
        isNull('ownerId'),
        isNull('orderId'),
        or(
          and(eq(f('purpose'), 'SimulatorCapital'), eq(f('_id'), CAPITAL)),
          and(eq(f('purpose'), 'SimulatorClearing'), eq(f('_id'), CLEARING)),
        ),
      ),
    ),
    indexes: [
      uniqueWhenSet('ownerId', 'wallet_accounts_owner_id_key'),
      uniqueWhenSet('orderId', 'wallet_accounts_order_id_key'),
    ],
  },
  {
    name: 'topup_intents',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      ownerId: t.uuid(),
      amount: t.int(1000, 10_000_000),
      currency: t.enum('VND'),
      state: t.enum(
        'Pending',
        'Processing',
        'Succeeded',
        'Failed',
        'ReviewRequired',
      ),
      version: t.int(1),
      createdAt: t.date(),
      updatedAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    expr: gte(f('updatedAt'), f('createdAt')),
    indexes: [
      index(
        { ownerId: 1, createdAt: 1, _id: 1 },
        'topup_intents_owner_id_created_at_id_idx',
      ),
    ],
  },
  {
    name: 'simulated_payment_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      intentId: t.uuid(),
      provider: t.enum('LatLaiSimulator-v1'),
      payloadHash: t.sha(),
      recipientId: t.uuid(),
      amount: t.int(1, 10_000_000),
      currency: t.str(3, '^[A-Z]{3}$'),
      outcome: t.enum('Processing', 'Succeeded', 'Failed'),
      disposition: t.enum('Applied', 'Ignored', 'ReviewRequired'),
      occurredAt: t.date(),
      receivedAt: t.date(),
      receiptId: t.uuid(),
    }),
    indexes: [
      index(
        { intentId: 1, receivedAt: 1, _id: 1 },
        'simulated_payment_events_intent_id_received_at_id_idx',
      ),
    ],
  },
  {
    name: 'ledger_journals',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      sequence: t.int(1),
      type: t.enum('OpeningCapital', 'Topup', 'OrderPayment', 'OrderRefund'),
      topupId: t.nuuid(),
      eventId: t.nuuid(),
      orderId: t.nuuid(),
      receiptId: t.nuuid(),
      postedAt: t.date(),
    }),
    expr: or(
      and(
        eq(f('type'), 'OpeningCapital'),
        eq(nonNullCount('topupId', 'eventId', 'orderId', 'receiptId'), 0),
        eq(f('_id'), OPENING),
      ),
      and(
        eq(f('type'), 'Topup'),
        notNull('topupId'),
        notNull('eventId'),
        isNull('orderId'),
        isNull('receiptId'),
      ),
      and(
        oneOf(f('type'), ['OrderPayment', 'OrderRefund']),
        isNull('topupId'),
        isNull('eventId'),
        notNull('orderId'),
        notNull('receiptId'),
      ),
    ),
    indexes: [
      unique({ sequence: 1 }, 'ledger_journals_sequence_key'),
      uniqueWhenSet('topupId', 'ledger_journals_topup_id_key'),
      uniqueWhenSet('eventId', 'ledger_journals_event_id_key'),
      uniqueWhenSet('receiptId', 'ledger_journals_receipt_id_key'),
      unique({ orderId: 1, type: 1 }, 'ledger_journals_order_id_type_key', {
        orderId: { $type: 'string' },
      }),
      index({ postedAt: 1, _id: 1 }, 'ledger_journals_posted_at_id_idx'),
    ],
  },
  {
    name: 'ledger_entries',
    access: 'appendOnly',
    schema: document({
      _id: t.str(),
      journalId: t.uuid(),
      accountId: t.uuid(),
      debit: t.int(0, 100_000_000),
      credit: t.int(0, 100_000_000),
    }),
    expr: and(
      eq(f('_id'), { $concat: [f('journalId'), ':', f('accountId')] }),
      or(
        and(gt(f('debit'), 0), eq(f('credit'), 0)),
        and(gt(f('credit'), 0), eq(f('debit'), 0)),
      ),
    ),
    indexes: [
      index(
        { accountId: 1, journalId: 1 },
        'ledger_entries_account_id_journal_id_idx',
      ),
      index({ journalId: 1 }, 'ledger_entries_journal_id_idx'),
    ],
  },
  // ------------------------------------------------------ infrastructure
  {
    // ADR 0027 idempotency-key lock documents; expired ones are removed by TTL
    // (receipts, not these documents, are the durable replay record).
    name: 'command_locks',
    access: 'mutable',
    schema: document({
      _id: t.sha(),
      expiresAt: t.date(),
      lockSeq: t.lockSeq(),
    }),
    indexes: [
      {
        key: { expiresAt: 1 },
        name: 'command_locks_ttl',
        expireAfterSeconds: 0,
      },
    ],
  },
  {
    // One document per wallet account; every ledger posting locks the accounts
    // it touches here before checking balances (ADR 0027 lock-by-write).
    name: 'account_locks',
    access: 'mutable',
    schema: document({ _id: t.uuid(), lockSeq: t.lockSeq() }),
    indexes: [],
  },
  {
    name: 'counters',
    access: 'mutable',
    schema: document({ _id: t.str(), value: t.int(0) }),
    indexes: [],
  },
];

// Guard against silently dropping or adding a model.
export const POSTGRES_MODEL_COUNT = 45;
export const EMBEDDED_MODELS = ['UserRole'];
export const INFRASTRUCTURE_COLLECTIONS = [
  'command_locks',
  'account_locks',
  'counters',
];
