import { randomUUID } from 'node:crypto';
import type pg from 'pg';

// Synthetic import source, not an HTTP permission or live-storage test. All 17
// PostgreSQL migrations/triggers remain enabled. Commit each historical phase:
// packaging must be committed while Preparing, before a subsequent pickup.
export async function postgresOrderFixture(
  db: pg.Client,
  source: {
    member: string;
    admin: string;
    book: string;
    revision: string;
    address: string;
  },
) {
  const insert = async (table: string, row: Record<string, unknown>) => {
    const columns = Object.keys(row);
    // Identifiers below are test-owned literals; values always use parameters.
    await db.query(
      `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`,
      Object.values(row),
    );
  };
  const at = (second: number) =>
    new Date(Date.UTC(2026, 8, 29, 1) + second * 1000);
  const json = JSON.stringify;
  const digest = 'a'.repeat(64);
  const operator = randomUUID(),
    originId = randomUUID(),
    walletId = randomUUID();
  const origin = {
    recipientName: 'QA seller',
    phone: '0900000000',
    serviceAreaCode: 'HCM-DEMO-v1',
    localityCode: 'DEMO-A',
    detail: 'QA origin',
  };
  const destination = {
    recipientName: 'Người nhận',
    phone: '0900000000',
    serviceAreaCode: 'HCM-DEMO-v1',
    localityCode: 'DEMO-A',
    detail: '12 Đường số 3',
  };
  async function chain(
    actor: string,
    target: Record<string, string>,
    operation: string,
    version: number,
    time: Date,
    result: Record<string, unknown>,
    event: string,
    after = result,
    receipt = randomUUID(),
    key = randomUUID(),
  ) {
    const audit = randomUUID();
    await insert('mutation_receipts', {
      id: receipt,
      actor_id: actor,
      ...target,
      operation,
      key,
      payload_hash: digest,
      result_version: version,
      result: json(result),
      committed_at: time,
    });
    await insert('audit_events', {
      id: audit,
      actor_id: actor,
      ...target,
      receipt_id: receipt,
      action: operation,
      after: json(after),
      request_id: randomUUID(),
      created_at: time,
    });
    await insert('outbox_events', {
      id: randomUUID(),
      audit_id: audit,
      type: event,
      payload: json(result),
      created_at: time,
      available_at: time,
    });
    return receipt;
  }
  async function posting(
    journal: Record<string, unknown>,
    debit: string,
    credit: string,
    amount: number,
  ) {
    const id = randomUUID();
    await insert('ledger_journals', { id, ...journal });
    await insert('ledger_entries', {
      journal_id: id,
      account_id: debit,
      debit: amount,
      credit: 0,
    });
    await insert('ledger_entries', {
      journal_id: id,
      account_id: credit,
      debit: 0,
      credit: amount,
    });
    return id;
  }
  await db.query('BEGIN');
  await insert('users', {
    id: operator,
    email_normalized: `${operator}@import.test`,
    password_hash: 'test-only',
    display_name: 'Independent QA operator',
    status: 'ACTIVE',
    email_verified_at: at(0),
    updated_at: at(0),
  });
  await insert('user_roles', { user_id: operator, role: 'TEST_OPERATOR' });
  await insert('address_books', { owner_id: source.admin, version: 1 });
  await insert('member_addresses', {
    id: originId,
    owner_id: source.admin,
    recipient_name: origin.recipientName,
    phone: origin.phone,
    service_area_code: origin.serviceAreaCode,
    locality_code: origin.localityCode,
    detail: origin.detail,
    is_default: true,
  });
  await insert('wallet_accounts', {
    id: walletId,
    owner_id: source.member,
    purpose: 'UserAvailable',
  });
  const topupId = randomUUID(),
    eventId = randomUUID();
  await insert('topup_intents', {
    id: topupId,
    owner_id: source.member,
    amount: 1_000_000,
    created_at: at(0),
    updated_at: at(0),
  });
  await chain(
    source.member,
    { topup_id: topupId },
    'createTopupIntent',
    1,
    at(0),
    { entityId: topupId },
    'TopupIntentCreated',
  );
  const receipt = await chain(
    operator,
    { topup_id: topupId },
    'emitSimulatedTopupEvent',
    2,
    at(1),
    { entityId: topupId },
    'SimulatedTopupEventRecorded',
  );
  await insert('simulated_payment_events', {
    id: eventId,
    intent_id: topupId,
    provider: 'LatLaiSimulator-v1',
    payload_hash: digest,
    recipient_id: source.member,
    amount: 1_000_000,
    currency: 'VND',
    outcome: 'Succeeded',
    disposition: 'Applied',
    occurred_at: at(1),
    received_at: at(1),
    receipt_id: receipt,
  });
  await db.query(
    "UPDATE topup_intents SET state='Succeeded',version=2,updated_at=$2 WHERE id=$1",
    [topupId, at(1)],
  );
  await posting(
    { type: 'Topup', topup_id: topupId, event_id: eventId, posted_at: at(1) },
    walletId,
    '00000000-0000-4000-8000-000000000002',
    1_000_000,
  );
  await db.query('COMMIT');

  const orders = [];
  for (const state of [
    'PendingSellerConfirmation',
    'InTransit',
    'ResolutionPending',
  ] as const) {
    const orderId = randomUUID(),
      contextId = randomUUID(),
      listingId = randomUUID(),
      revisionId = randomUUID(),
      mediaId = randomUUID(),
      quoteId = randomUUID(),
      commitmentId = randomUUID(),
      holdId = randomUUID();
    const target = { context_id: contextId };
    await db.query('BEGIN');
    await insert('listings', {
      id: listingId,
      owner_id: source.admin,
      updated_at: at(2),
    });
    const condition = {
      condition: 'Good',
      pages: 'Đủ trang',
      coverNote: 'Bìa còn nguyên',
      notes: 'Không ghi chú',
      accessories: 'Không có',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description: 'Sách QA để kiểm tra chuyển dữ liệu, không giao dịch thật.',
    };
    await insert('listing_revisions', {
      id: revisionId,
      listing_id: listingId,
      number: 1,
      book_id: source.book,
      mode: 'Sale',
      condition: condition.condition,
      pages: condition.pages,
      cover_note: condition.coverNote,
      notes: condition.notes,
      accessories: condition.accessories,
      readable: true,
      has_missing_pages: false,
      missing_essential_content: false,
      description: condition.description,
      sale_price: 200000,
      origin_address_id: originId,
      origin_address_version: 1,
      origin_service_area_code: 'HCM-DEMO-v1',
    });
    await insert('listing_media', {
      id: mediaId,
      listing_id: listingId,
      status: 'Ready',
      staging_key: `qa/${mediaId}/staging`,
      pinned_key: `qa/${mediaId}/original`,
      derivative_key: `qa/${mediaId}/preview`,
      mime_type: 'image/jpeg',
      byte_size: 100,
      sha256: digest,
      width: 20,
      height: 20,
      reserved_bytes: 2_000_100,
      expires_at: at(3600),
      updated_at: at(2),
    });
    await insert('revision_media', {
      listing_id: listingId,
      revision_id: revisionId,
      media_id: mediaId,
      position: 0,
    });
    await db.query(
      'UPDATE listing_revisions SET submitted_at=$2,ownership_declared_at=$2 WHERE id=$1',
      [revisionId, at(3)],
    );
    await db.query(
      "UPDATE listings SET current_revision_id=$2,moderation='PendingReview' WHERE id=$1",
      [listingId, revisionId],
    );
    await insert('listing_decisions', {
      id: randomUUID(),
      revision_id: revisionId,
      reviewer_id: source.member,
      decision: 'Approve',
      checklist: json({
        catalogMatches: true,
        photosClear: true,
        conditionDisclosed: true,
        readable: true,
        pricingValid: true,
        contentAppropriate: true,
      }),
    });
    await db.query(
      "UPDATE listings SET moderation='Approved',version=2,published_at=$2 WHERE id=$1",
      [listingId, at(4)],
    );
    await insert('sale_quotes', {
      id: quoteId,
      buyer_id: source.member,
      seller_id: source.admin,
      listing_id: listingId,
      listing_version: 2,
      listing_revision_id: revisionId,
      catalog_revision_id: source.revision,
      origin_address_id: originId,
      origin_address_version: 1,
      destination_address_id: source.address,
      destination_address_version: 1,
      service_area_code: 'HCM-DEMO-v1',
      policy_code: 'HCM-DIRECT-v1',
      book_price: 200000,
      shipping_fee: 30000,
      commission_bps: 500,
      commission: 10000,
      buyer_total: 230000,
      seller_proceeds: 220000,
      created_at: at(5),
      expires_at: at(305),
    });
    await insert('direct_orders', {
      id: orderId,
      buyer_id: source.member,
      seller_id: source.admin,
      quote_id: quoteId,
      state: 'AwaitingPayment',
      created_at: at(6),
      payment_deadline: at(906),
    });
    await insert('workflow_contexts', {
      id: contextId,
      kind: 'Order',
      order_id: orderId,
      ownership_phase: 'Holding',
    });
    const catalog = (
      await db.query('SELECT * FROM catalog_revisions WHERE id=$1', [
        source.revision,
      ])
    ).rows[0];
    const metadata = {
      title: catalog.title,
      authors: catalog.authors,
      publisher: catalog.publisher,
      publicationYear: catalog.publication_year,
      language: catalog.language,
      edition: catalog.edition,
      category: catalog.category,
      isbn: catalog.isbn,
    };
    await insert('workflow_items', {
      context_id: contextId,
      listing_id: listingId,
      listing_revision_id: revisionId,
      catalog_revision_id: source.revision,
      snapshot: json({
        listingId,
        listingRevisionId: revisionId,
        catalogRevisionId: source.revision,
        metadata,
        ...condition,
        mediaIds: [mediaId],
      }),
    });
    const agreement = {
      schemaVersion: 1,
      policyVersion: 'HCM-DIRECT-v1',
      method: 'DirectDelivery',
      demoOnly: true,
      currency: 'VND',
      buyerId: source.member,
      sellerId: source.admin,
      origin,
      destination,
      amounts: {
        bookPrice: 200000,
        shippingFee: 30000,
        buyerTotal: 230000,
        commissionBps: 500,
        commission: 10000,
        sellerProceedsOnCompletion: 220000,
      },
      createdAt: at(6).toISOString(),
      paymentDeadline: at(906).toISOString(),
    };
    await insert('agreement_snapshots', {
      context_id: contextId,
      snapshot: json(agreement),
    });
    await insert('exclusive_commitments', {
      id: commitmentId,
      listing_id: listingId,
      current_context_id: contextId,
      status: 'Active',
      acquired_at: at(6),
    });
    const created = await chain(
      source.member,
      target,
      'createOrder',
      1,
      at(6),
      { entityId: orderId },
      'OrderCreated',
    );
    await insert('commitment_events', {
      id: randomUUID(),
      commitment_id: commitmentId,
      sequence: 1,
      kind: 'Acquired',
      before_version: 0,
      after_version: 1,
      receipt_id: created,
      occurred_at: at(6),
    });
    await db.query(
      "UPDATE listings SET trade='Reserved',version=3 WHERE id=$1",
      [listingId],
    );
    await db.query('COMMIT');

    await db.query('BEGIN');
    await db.query(
      "UPDATE direct_orders SET state='PendingSellerConfirmation',version=2,paid_at=$2,seller_confirmation_deadline=$3 WHERE id=$1",
      [orderId, at(7), at(7 + 48 * 3600)],
    );
    await insert('wallet_accounts', {
      id: holdId,
      order_id: orderId,
      purpose: 'OrderHold',
    });
    const paymentReceipt = await chain(
      source.member,
      target,
      'payOrder',
      2,
      at(7),
      { entityId: orderId, state: 'PendingSellerConfirmation' },
      'OrderPaid',
    );
    await posting(
      {
        type: 'OrderPayment',
        order_id: orderId,
        receipt_id: paymentReceipt,
        posted_at: at(7),
      },
      holdId,
      walletId,
      230000,
    );
    await db.query('COMMIT');
    const expected = {
      state,
      orderId,
      contextId,
      listingId,
      holdId,
      commitmentId,
      agreement,
      shipmentId: null as string | null,
      evidenceId: null as string | null,
      appliedId: null as string | null,
      reviewId: null as string | null,
    };
    orders.push(expected);
    if (state === 'PendingSellerConfirmation') continue;

    await db.query('BEGIN');
    await db.query(
      "UPDATE direct_orders SET state='Preparing',version=3 WHERE id=$1",
      [orderId],
    );
    const accepted = await chain(
      source.admin,
      target,
      'acceptOrder',
      3,
      at(8),
      { entityId: orderId, state: 'Preparing' },
      'OrderAccepted',
    );
    await insert('order_preparations', {
      order_id: orderId,
      accepted_at: at(8),
      pickup_deadline: at(8 + 48 * 3600),
      receipt_id: accepted,
    });
    const evidenceId = randomUUID(),
      shipmentId = randomUUID();
    expected.evidenceId = evidenceId;
    expected.shipmentId = shipmentId;
    const evidenceResult = {
      entityType: 'OrderPackagingEvidence',
      entityId: evidenceId,
      orderId,
      contextId,
      state: 'Pending',
      version: 1,
    };
    const reserved = await chain(
      source.admin,
      target,
      'createPackagingEvidence',
      1,
      at(9),
      evidenceResult,
      'PackagingEvidenceReserved',
      { evidenceId },
    );
    await insert('order_packaging_evidence', {
      id: evidenceId,
      order_id: orderId,
      mime_type: 'image/jpeg',
      byte_size: 100,
      sha256: digest,
      reserved_bytes: 2000100,
      created_at: at(9),
      create_receipt_id: reserved,
    });
    const uploaded = await chain(
      source.admin,
      target,
      'uploadPackagingEvidence',
      2,
      at(10),
      { ...evidenceResult, state: 'Ready', version: 2 },
      'PackagingEvidenceSubmitted',
      { evidenceId },
    );
    await db.query(
      "UPDATE order_packaging_evidence SET status='Ready',version=2,uploaded_at=$2,derivative_sha256=$3,derivative_bytes=100,width=20,height=20,upload_receipt_id=$4 WHERE id=$1",
      [evidenceId, at(10), digest, uploaded],
    );
    const shipmentReceipt = randomUUID();
    await insert('direct_shipments', {
      id: shipmentId,
      order_id: orderId,
      carrier: 'LatLaiSimulator',
      tracking_code: `LL-${shipmentId.replaceAll('-', '').toUpperCase()}`,
      origin: json(origin),
      destination: json(destination),
      shipping_fee: 30000,
      registered_at: at(11),
      receipt_id: shipmentReceipt,
    });
    await insert('shipment_packaging_evidence', {
      shipment_id: shipmentId,
      order_id: orderId,
      evidence_id: evidenceId,
      position: 0,
    });
    await chain(
      source.admin,
      target,
      'registerDirectShipment',
      1,
      at(11),
      {
        entityType: 'Shipment',
        entityId: shipmentId,
        orderId,
        contextId,
        version: 1,
        state: 'LabelCreated',
      },
      'DirectShipmentRegistered',
      { shipmentId },
      shipmentReceipt,
    );
    await db.query('COMMIT');

    for (const sequence of state === 'InTransit' ? [1] : [1, 2]) {
      await db.query('BEGIN');
      const event = randomUUID(),
        received = at(11 + sequence),
        outcome = sequence === 1 ? 'Applied' : 'ReviewRequired',
        nextState = sequence === 1 ? 'InTransit' : 'ResolutionPending',
        orderVersion = sequence + 3;
      const result = {
        entityType: 'CarrierEvent',
        entityId: event,
        shipmentId,
        orderId,
        contextId,
        state: 'Recorded',
        version: sequence,
        outcome,
        orderVersion,
        orderState: nextState,
        serverTime: received.toISOString(),
      };
      const pickupReceipt = await chain(
        operator,
        target,
        'emitSimulatedPickupEvent',
        sequence,
        received,
        result,
        'CarrierPickupRecorded',
        { ...result, eventId: event },
        randomUUID(),
        event,
      );
      await insert('carrier_pickup_events', {
        id: event,
        order_id: orderId,
        shipment_id: shipmentId,
        sequence,
        occurred_at: received,
        received_at: received,
        outcome,
        delivery_deadline: sequence === 1 ? at(12 + 240 * 3600) : null,
        payload_hash: digest,
        signature: digest,
        receipt_id: pickupReceipt,
      });
      if (sequence === 1) expected.appliedId = event;
      else {
        expected.reviewId = randomUUID();
        await insert('carrier_pickup_reviews', {
          id: expected.reviewId,
          order_id: orderId,
          event_id: event,
          opened_at: received,
          reason: 'ConflictingPickup',
        });
      }
      await db.query(
        'UPDATE direct_orders SET state=$2,version=$3 WHERE id=$1',
        [orderId, nextState, orderVersion],
      );
      await db.query('COMMIT');
    }
  }
  return { orders, walletId, topupId, member: source.member };
}
