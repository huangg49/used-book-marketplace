import { canonicalJson } from '../../common/canonical-json.js';
import type {
  DirectOrderDoc,
  Json,
  MutationReceiptDoc,
  WorkflowContextDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { checkListing } from '../listings/listing-projection.js';

// Commit-time replacements for the PostgreSQL deferred constraint triggers of
// the Order aggregate (MIG02_MODEL_MAP, section C): latlai_check_order and its
// funding, preparation, pickup, delivery-review, shipment and packaging parts.
// They read through the transaction, so they see its own uncommitted writes.

type Chain = {
  r: MutationReceiptDoc;
  a: NonNullable<Awaited<ReturnType<Tx['c']['audit_events']['findOne']>>>;
  o: NonNullable<Awaited<ReturnType<Tx['c']['outbox_events']['findOne']>>>;
};
const fail = (message: string): never => {
  throw new Error(message);
};
const time = (value: unknown) =>
  value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const get = (value: Json | null | undefined, key: string) =>
  value ? (value as Record<string, unknown>)[key] : undefined;

async function chain(tx: Tx, receiptId: string): Promise<Chain | null> {
  const r = await tx.c.mutation_receipts.findOne({ _id: receiptId });
  if (!r) return null;
  const a = await tx.c.audit_events.findOne({ receiptId });
  if (!a) return null;
  const o = await tx.c.outbox_events.findOne({ auditId: a._id });
  return o ? { r, a, o } : null;
}

export async function checkOrder(tx: Tx, orderId: string) {
  const o = await tx.c.direct_orders.findOne({ _id: orderId });
  if (!o) return;
  const c = await tx.c.workflow_contexts.findOne({ orderId });
  const q = await tx.c.sale_quotes.findOne({ _id: o.quoteId });
  const items = c
    ? await tx.c.workflow_items.find({ contextId: c._id }).toArray()
    : [];
  if (
    !c ||
    !q ||
    c.version !== (o.closedAt ? 2 : 1) ||
    c.ownershipPhase !== (o.closedAt ? 'Closed' : 'Holding') ||
    items.length !== 1 ||
    q.buyerId !== o.buyerId ||
    q.sellerId !== o.sellerId ||
    o.createdAt < q.createdAt ||
    o.createdAt >= q.expiresAt
  )
    fail('Order/context/quote mismatch');
  const i = items[0];
  const a = await tx.c.agreement_snapshots.findOne({ _id: c!._id });
  const snapshot = a?.snapshot;
  const amounts = get(snapshot, 'amounts') as Json | undefined;
  if (
    !a ||
    i.listingId !== q!.listingId ||
    i.listingRevisionId !== q!.listingRevisionId ||
    i.catalogRevisionId !== q!.catalogRevisionId ||
    get(i.snapshot, 'listingId') !== i.listingId ||
    get(i.snapshot, 'listingRevisionId') !== i.listingRevisionId ||
    get(i.snapshot, 'catalogRevisionId') !== i.catalogRevisionId ||
    get(snapshot, 'buyerId') !== o.buyerId ||
    get(snapshot, 'sellerId') !== o.sellerId ||
    time(get(snapshot, 'createdAt')) !== o.createdAt.getTime() ||
    time(get(snapshot, 'paymentDeadline')) !== o.paymentDeadline.getTime() ||
    get(snapshot, 'policyVersion') !== q!.policyCode ||
    get(amounts, 'buyerTotal') !== q!.buyerTotal
  )
    fail('Order snapshot mismatch');
  const commitments = await tx.c.exclusive_commitments
    .find({ currentContextId: c!._id })
    .toArray();
  if (commitments.length !== 1) fail('Order must own one commitment');
  const e = commitments[0];
  const listing = await tx.c.listings.findOne({ _id: i.listingId });
  const events = await tx.c.commitment_events
    .find({ commitmentId: e._id })
    .toArray();
  if (
    e.listingId !== i.listingId ||
    e.version !== c!.version ||
    e.acquiredAt.getTime() !== o.createdAt.getTime() ||
    (!o.closedAt &&
      (e.status !== 'Active' ||
        listing?.currentRevisionId !== i.listingRevisionId)) ||
    (o.closedAt &&
      (e.status !== 'Released' ||
        e.reason !== o.state ||
        e.endedAt?.getTime() !== o.closedAt.getTime())) ||
    events.length !== e.version
  )
    fail('Order commitment mismatch');
  for (const ev of events) {
    const x = await chain(tx, ev.receiptId);
    const expected = ev.sequence === 1 ? 1 : o.paidAt ? 4 : 2;
    if (
      !x ||
      x.r.contextId !== c!._id ||
      x.r.resultVersion !== expected ||
      x.a.contextId !== c!._id ||
      ev.occurredAt.getTime() !==
        (ev.sequence === 1 ? e.acquiredAt : e.endedAt)?.getTime()
    )
      fail('Missing commitment receipt/audit/outbox');
  }
  await checkOrderFunding(tx, o, c!, q!.buyerTotal);
  await checkOrderPreparation(tx, o, c!);
  tx.check(`listing:${i.listingId}`, () => checkListing(tx, i.listingId));
}

async function checkOrderFunding(
  tx: Tx,
  o: DirectOrderDoc,
  c: WorkflowContextDoc,
  buyerTotal: number,
) {
  const p = await tx.c.ledger_journals.findOne({
    orderId: o._id,
    type: 'OrderPayment',
  });
  const f = await tx.c.ledger_journals.findOne({
    orderId: o._id,
    type: 'OrderRefund',
  });
  const hold = await tx.c.wallet_accounts.findOne({ orderId: o._id });
  if (!o.paidAt) {
    if (p || f || hold) fail('Unpaid order cannot own funds');
    return;
  }
  const [balance] = hold
    ? await tx.c.ledger_entries
        .aggregate<{ amount: number }>([
          { $match: { accountId: hold._id } },
          {
            $group: {
              _id: null,
              amount: { $sum: { $subtract: ['$debit', '$credit'] } },
            },
          },
        ])
        .toArray()
    : [];
  if (
    !p ||
    !hold ||
    hold.purpose !== 'OrderHold' ||
    p.postedAt.getTime() !== o.paidAt.getTime() ||
    (o.state === 'Cancelled') !== !!f ||
    (f && f.postedAt.getTime() !== o.closedAt?.getTime()) ||
    (balance?.amount ?? 0) !== (o.state === 'Cancelled' ? 0 : buyerTotal)
  )
    fail('Order funding/hold projection mismatch');
  for (const j of await tx.c.ledger_journals
    .find({ orderId: o._id })
    .toArray()) {
    const x = j.receiptId ? await chain(tx, j.receiptId) : null;
    if (
      !x ||
      x.r.contextId !== c._id ||
      x.a.contextId !== c._id ||
      x.r.committedAt.getTime() !== j.postedAt.getTime() ||
      (j.type === 'OrderPayment' &&
        (x.r.operation !== 'payOrder' ||
          x.r.actorId !== o.buyerId ||
          x.r.resultVersion !== 2)) ||
      (j.type === 'OrderRefund' &&
        (x.r.operation !== 'refundOrder' ||
          x.r.systemActor !== 'OrderRefund' ||
          x.r.resultVersion !== 4))
    )
      fail('Order journal receipt mismatch');
  }
  if (o.cancellationRequestedAt) {
    const operation =
      o.cancellationReason === 'BuyerCancelled'
        ? 'cancelPaidOrder'
        : o.cancellationReason === 'SellerRejected'
          ? 'rejectPaidOrder'
          : 'expireSellerConfirmation';
    const actor =
      o.cancellationReason === 'BuyerCancelled'
        ? o.buyerId
        : o.cancellationReason === 'SellerRejected'
          ? o.sellerId
          : null;
    const receipts = await tx.c.mutation_receipts
      .find({
        contextId: c._id,
        operation,
        actorId: actor,
        resultVersion: 3,
        committedAt: o.cancellationRequestedAt,
      })
      .toArray();
    let ok = false;
    for (const r of receipts) {
      const x = await chain(tx, r._id);
      if (
        x?.a.contextId === c._id &&
        (actor !== null || r.systemActor === 'OrderConfirmationExpiry')
      )
        ok = true;
    }
    if (!ok) fail('Missing authorized refund decision');
  }
}

async function checkOrderPreparation(
  tx: Tx,
  o: DirectOrderDoc,
  c: WorkflowContextDoc,
) {
  const p = await tx.c.order_preparations.findOne({ _id: o._id });
  const review = await tx.c.pickup_reviews.findOne({ orderId: o._id });
  if (!['Preparing', 'InTransit', 'ResolutionPending'].includes(o.state)) {
    if (p || review) fail('Unexpected preparation history');
    return;
  }
  const accepted = p ? await chain(tx, p.receiptId) : null;
  if (
    !p ||
    !accepted ||
    p.acceptedAt < o.paidAt! ||
    p.acceptedAt >= o.sellerConfirmationDeadline! ||
    accepted.r.contextId !== c._id ||
    accepted.r.operation !== 'acceptOrder' ||
    accepted.r.actorId !== o.sellerId ||
    accepted.r.systemActor !== null ||
    accepted.r.resultVersion !== 3 ||
    accepted.r.committedAt.getTime() !== p.acceptedAt.getTime() ||
    get(accepted.r.result, 'state') !== 'Preparing' ||
    accepted.a.contextId !== c._id ||
    accepted.a.actorId !== o.sellerId ||
    accepted.a.action !== 'acceptOrder' ||
    accepted.o.type !== 'OrderAccepted'
  )
    fail('Order acceptance receipt/deadline mismatch');
  const carrierReview = await tx.c.carrier_pickup_reviews.findOne({
    orderId: o._id,
  });
  const deliveryReview = await tx.c.order_delivery_reviews.findOne({
    orderId: o._id,
  });
  if (
    (o.state === 'ResolutionPending') !==
    !!(review || carrierReview || deliveryReview)
  )
    fail('Pickup verification task mismatch');
  if (review) {
    const x = await chain(tx, review.receiptId);
    if (
      review.openedAt < p!.pickupDeadline ||
      !x ||
      x.r.contextId !== c._id ||
      x.r.operation !== 'expireOrderPickup' ||
      x.r.systemActor !== 'OrderPickupExpiry' ||
      x.r.actorId !== null ||
      x.r.resultVersion !== 4 ||
      x.r.committedAt.getTime() !== review.openedAt.getTime() ||
      get(x.r.result, 'state') !== 'ResolutionPending' ||
      x.a.contextId !== c._id ||
      x.a.systemActor !== 'OrderPickupExpiry' ||
      x.a.action !== 'expireOrderPickup' ||
      x.o.type !== 'OrderPickupReviewOpened'
    )
      fail('Pickup verification task mismatch');
  }
  await checkOrderPickup(tx, o, c);
  await checkDeliveryReview(tx, o, c);
}

async function checkOrderPickup(
  tx: Tx,
  o: DirectOrderDoc,
  c: WorkflowContextDoc,
) {
  const p = await tx.c.order_preparations.findOne({ _id: o._id });
  const s = await tx.c.direct_shipments.findOne({ orderId: o._id });
  const cr = await tx.c.carrier_pickup_reviews.findOne({ orderId: o._id });
  const delivery = await tx.c.order_delivery_reviews.findOne({
    orderId: o._id,
  });
  const events = await tx.c.carrier_pickup_events
    .find({ orderId: o._id }, { sort: { sequence: 1 } })
    .toArray();
  let n = 0,
    prior: Date | null = null,
    hasApplied = false,
    expectedState = '',
    expectedVersion = 0,
    firstReview: (typeof events)[number] | null = null;
  const first = events[0];
  for (const e of events) {
    n++;
    let expectedOutcome: string;
    if (n === 1) {
      hasApplied = e.receivedAt < p!.pickupDeadline;
      expectedOutcome = hasApplied ? 'Applied' : 'ReviewRequired';
      expectedState = hasApplied ? 'InTransit' : 'ResolutionPending';
      expectedVersion = 4;
    } else {
      expectedOutcome =
        e.occurredAt.getTime() === first.occurredAt.getTime()
          ? 'Duplicate'
          : 'ReviewRequired';
      if (expectedOutcome === 'ReviewRequired') {
        expectedState = 'ResolutionPending';
        expectedVersion = hasApplied ? 5 : 4;
      }
    }
    if (expectedOutcome === 'ReviewRequired' && !firstReview) firstReview = e;
    if (
      e.sequence !== n ||
      n > 128 ||
      e.shipmentId !== s?._id ||
      e.occurredAt < s.registeredAt ||
      (prior && e.receivedAt < prior) ||
      e.outcome !== expectedOutcome
    )
      fail('Invalid pickup chronology/outcome');
    const x = await chain(tx, e.receiptId);
    const result = x?.r.result;
    const after = x?.a.after ?? null;
    const payload = x?.o.payload ?? null;
    const orderMatches =
      (get(result, 'orderVersion') === expectedVersion &&
        get(result, 'orderState') === expectedState) ||
      (expectedState === 'InTransit' &&
        get(result, 'orderVersion') === 5 &&
        get(result, 'orderState') === 'ResolutionPending' &&
        !!delivery &&
        delivery.openedAt <= e.receivedAt);
    if (
      !x ||
      x.r.operation !== 'emitSimulatedPickupEvent' ||
      x.r.systemActor !== null ||
      !x.r.actorId ||
      [o.buyerId, o.sellerId].includes(x.r.actorId) ||
      x.r.key !== e._id ||
      x.r.contextId !== c._id ||
      x.r.resultVersion !== e.sequence ||
      x.r.committedAt.getTime() !== e.receivedAt.getTime() ||
      get(result, 'entityType') !== 'CarrierEvent' ||
      get(result, 'entityId') !== e._id ||
      get(result, 'shipmentId') !== s!._id ||
      get(result, 'orderId') !== o._id ||
      get(result, 'contextId') !== c._id ||
      get(result, 'state') !== 'Recorded' ||
      get(result, 'version') !== e.sequence ||
      get(result, 'outcome') !== e.outcome ||
      !orderMatches ||
      time(get(result, 'serverTime')) !== e.receivedAt.getTime() ||
      x.a.actorId !== x.r.actorId ||
      x.a.systemActor !== null ||
      x.a.contextId !== c._id ||
      x.a.action !== x.r.operation ||
      get(after, 'eventId') !== e._id ||
      get(after, 'shipmentId') !== s!._id ||
      get(after, 'orderId') !== o._id ||
      get(after, 'version') !== e.sequence ||
      get(after, 'state') !== 'Recorded' ||
      get(after, 'outcome') !== e.outcome ||
      get(after, 'orderVersion') !== get(result, 'orderVersion') ||
      get(after, 'orderState') !== get(result, 'orderState') ||
      x.o.type !== 'CarrierPickupRecorded' ||
      get(payload, 'entityId') !== e._id ||
      get(payload, 'contextId') !== c._id ||
      get(payload, 'orderId') !== o._id ||
      get(payload, 'state') !== 'Recorded' ||
      get(payload, 'version') !== e.sequence
    )
      fail('Pickup receipt/audit/outbox mismatch');
    prior = e.receivedAt;
  }
  if (delivery) {
    expectedState = 'ResolutionPending';
    expectedVersion = 5;
  }
  const pickupReview = await tx.c.pickup_reviews.findOne({ orderId: o._id });
  if (
    (n > 0 && (o.state !== expectedState || o.version !== expectedVersion)) ||
    (n === 0 && o.state === 'InTransit') ||
    (hasApplied && pickupReview) ||
    !cr !== !firstReview ||
    (cr &&
      (cr.eventId !== firstReview!._id ||
        cr.openedAt.getTime() !== firstReview!.receivedAt.getTime() ||
        cr.reason !== (hasApplied ? 'ConflictingPickup' : 'LatePickup'))) ||
    (o.state === 'ResolutionPending' && o.version !== (hasApplied ? 5 : 4))
  )
    fail('Pickup state/review mismatch');
}

async function checkDeliveryReview(
  tx: Tx,
  o: DirectOrderDoc,
  c: WorkflowContextDoc,
) {
  const d = await tx.c.order_delivery_reviews.findOne({ orderId: o._id });
  if (!d) return;
  const p = await tx.c.carrier_pickup_events.findOne({ _id: d.pickupEventId });
  const b = await tx.c.order_non_receipt_reports.findOne({ orderId: o._id });
  if (
    o.state !== 'ResolutionPending' ||
    o.version !== 5 ||
    !p ||
    p.orderId !== o._id ||
    p.outcome !== 'Applied' ||
    !p.deliveryDeadline ||
    d.openedAt < p.deliveryDeadline ||
    d.openedAt < p.receivedAt ||
    (d.openedBy === 'BuyerReport' &&
      (!b ||
        b.receiptId !== d.receiptId ||
        b.submittedAt.getTime() !== d.openedAt.getTime()))
  )
    fail('Invalid delivery review anchor/state/deadline');
  const matches = (x: Chain | null, at: Date) =>
    !!x &&
    x.r.contextId === c._id &&
    x.r.resultVersion === 5 &&
    x.r.committedAt.getTime() === at.getTime() &&
    get(x.r.result, 'id') === x.r._id &&
    get(x.r.result, 'entityType') === 'Order' &&
    get(x.r.result, 'entityId') === o._id &&
    get(x.r.result, 'contextId') === c._id &&
    get(x.r.result, 'state') === 'ResolutionPending' &&
    get(x.r.result, 'version') === 5 &&
    time(get(x.r.result, 'serverTime')) === at.getTime() &&
    time(get(x.r.result, 'paymentDeadline')) === o.paymentDeadline.getTime() &&
    same(get(x.r.result, 'affectedListings'), []) &&
    x.a.contextId === c._id &&
    x.a.actorId === x.r.actorId &&
    x.a.systemActor === x.r.systemActor &&
    x.a.action === x.r.operation &&
    get(x.a.after, 'state') === 'ResolutionPending' &&
    get(x.a.after, 'version') === 5 &&
    x.a.reason === 'DeliveryDeadlineExceeded' &&
    get(x.o.payload, 'entityId') === o._id &&
    get(x.o.payload, 'contextId') === c._id &&
    get(x.o.payload, 'state') === 'ResolutionPending' &&
    get(x.o.payload, 'version') === 5;
  const x = await chain(tx, d.receiptId);
  if (
    !matches(x, d.openedAt) ||
    !(
      (d.openedBy === 'DeadlineWorker' &&
        x!.r.operation === 'expireOrderDelivery' &&
        x!.r.systemActor === 'OrderDeliveryExpiry' &&
        x!.r.actorId === null &&
        x!.r.key === o._id &&
        x!.o.type === 'OrderDeliveryReviewOpened') ||
      (d.openedBy === 'BuyerReport' &&
        x!.r.operation === 'reportOrderNonReceipt' &&
        x!.r.actorId === o.buyerId &&
        x!.r.systemActor === null &&
        x!.o.type === 'OrderNonReceiptReported')
    )
  )
    fail('Delivery review receipt/audit/outbox mismatch');
  if (b) {
    const y = await chain(tx, b.receiptId);
    if (
      b.submittedAt < d.openedAt ||
      b.submittedAt < p!.deliveryDeadline! ||
      !matches(y, b.submittedAt) ||
      y!.r.operation !== 'reportOrderNonReceipt' ||
      y!.r.actorId !== o.buyerId ||
      y!.r.systemActor !== null ||
      y!.o.type !== 'OrderNonReceiptReported'
    )
      fail('Non-receipt report identity/deadline/audit mismatch');
  }
}

// latlai_check_shipment (+ the order check it ends with).
export async function checkShipment(tx: Tx, shipmentId: string) {
  const s = await tx.c.direct_shipments.findOne({ _id: shipmentId });
  if (!s) fail('Shipment missing');
  const p = await tx.c.order_preparations.findOne({ _id: s!.orderId });
  const o = await tx.c.direct_orders.findOne({ _id: s!.orderId });
  const c = await tx.c.workflow_contexts.findOne({ orderId: s!.orderId });
  const a = c ? await tx.c.agreement_snapshots.findOne({ _id: c._id }) : null;
  if (
    !p ||
    !o ||
    !c ||
    !a ||
    s!.registeredAt < p.acceptedAt ||
    s!.registeredAt >= p.pickupDeadline ||
    !same(s!.origin, get(a.snapshot, 'origin')) ||
    !same(s!.destination, get(a.snapshot, 'destination')) ||
    s!.shippingFee !== get(get(a.snapshot, 'amounts') as Json, 'shippingFee')
  )
    fail('Shipment frozen agreement/deadline mismatch');
  const links = await tx.c.shipment_packaging_evidence
    .find({ shipmentId })
    .toArray();
  const evidence = await tx.c.order_packaging_evidence
    .find({ _id: { $in: links.map((l) => l.evidenceId) } })
    .toArray();
  if (
    links.length < 1 ||
    links.length > 8 ||
    Math.max(...links.map((l) => l.position)) !== links.length - 1 ||
    evidence.length !== links.length ||
    evidence.some(
      (e) =>
        e.orderId !== s!.orderId ||
        e.status !== 'Ready' ||
        !e.uploadedAt ||
        e.uploadedAt > s!.registeredAt,
    )
  )
    fail('Shipment requires pinned Ready packaging images');
  const x = await chain(tx, s!.receiptId);
  if (
    !x ||
    x.r.contextId !== c!._id ||
    x.r.actorId !== o!.sellerId ||
    x.r.systemActor !== null ||
    x.r.operation !== 'registerDirectShipment' ||
    x.r.resultVersion !== 1 ||
    x.r.committedAt.getTime() !== s!.registeredAt.getTime() ||
    get(x.r.result, 'entityType') !== 'Shipment' ||
    get(x.r.result, 'entityId') !== shipmentId ||
    get(x.r.result, 'orderId') !== s!.orderId ||
    get(x.r.result, 'contextId') !== c!._id ||
    get(x.r.result, 'version') !== 1 ||
    get(x.r.result, 'state') !== 'LabelCreated' ||
    x.a.actorId !== o!.sellerId ||
    x.a.contextId !== c!._id ||
    x.a.action !== x.r.operation ||
    get(x.a.after, 'shipmentId') !== shipmentId ||
    x.o.type !== 'DirectShipmentRegistered' ||
    get(x.o.payload, 'entityId') !== shipmentId ||
    get(x.o.payload, 'contextId') !== c!._id
  )
    fail('Shipment receipt/audit/outbox mismatch');
  await checkOrder(tx, o!._id);
}

// latlai_packaging_consistency.
export async function checkPackaging(tx: Tx, evidenceId: string) {
  const e = await tx.c.order_packaging_evidence.findOne({ _id: evidenceId });
  if (!e) fail('Packaging evidence missing');
  const o = await tx.c.direct_orders.findOne({ _id: e!.orderId });
  const p = await tx.c.order_preparations.findOne({ _id: e!.orderId });
  const c = await tx.c.workflow_contexts.findOne({ orderId: e!.orderId });
  const matches = (
    x: Chain | null,
    operation: string,
    version: number,
    state: string,
    at: Date | null,
    event: string,
  ) =>
    !!x &&
    x.r.contextId === c!._id &&
    x.r.actorId === o!.sellerId &&
    x.r.systemActor === null &&
    x.r.operation === operation &&
    x.r.resultVersion === version &&
    x.r.committedAt.getTime() === at?.getTime() &&
    get(x.r.result, 'entityType') === 'OrderPackagingEvidence' &&
    get(x.r.result, 'entityId') === evidenceId &&
    get(x.r.result, 'orderId') === e!.orderId &&
    get(x.r.result, 'contextId') === c!._id &&
    get(x.r.result, 'state') === state &&
    get(x.r.result, 'version') === version &&
    x.a.contextId === c!._id &&
    x.a.actorId === o!.sellerId &&
    x.a.action === operation &&
    get(x.a.after, 'evidenceId') === evidenceId &&
    x.o.type === event &&
    get(x.o.payload, 'entityId') === evidenceId &&
    get(x.o.payload, 'contextId') === c!._id;
  if (
    !o ||
    !p ||
    !c ||
    e!.createdAt < p.acceptedAt ||
    // Historical evidence survives pickup. The service still limits creation
    // and upload to Preparing/ResolutionPending; this is not a command gate.
    !['Preparing', 'InTransit', 'ResolutionPending'].includes(o.state) ||
    !matches(
      await chain(tx, e!.createReceiptId),
      'createPackagingEvidence',
      1,
      'Pending',
      e!.createdAt,
      'PackagingEvidenceReserved',
    )
  )
    fail('Packaging intent/receipt mismatch');
  if (
    e!.status === 'Ready' &&
    !matches(
      e!.uploadReceiptId ? await chain(tx, e!.uploadReceiptId) : null,
      'uploadPackagingEvidence',
      2,
      'Ready',
      e!.uploadedAt,
      'PackagingEvidenceSubmitted',
    )
  )
    fail('Packaging upload/receipt mismatch');
}
