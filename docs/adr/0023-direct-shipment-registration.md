# ADR 0023: Register a DirectDelivery outbound label with pinned packaging evidence

Follow-up: [ADR 0024](0024-carrier-pickup.md) implements independent simulated pickup
in0.19.0; registration semantics below remain unchanged and label rows stay immutable.

Accepted 2026-09-28 · OpenAPI 0.18.0. Follows ADRs0013/0017/0020–0022;
SRS FR-O06, FR-S01/02, BR-46 and POL-03. Implementation evidence:
[shipment report](../features/DIRECT_SHIPMENT_REPORT.md).

## Scope and meaning

One accepted DirectDelivery Order can register exactly one outbound Shipment.
The new APIs register and read the label. They do not create carrier events,
record custody or mark an Order InTransit. LabelCreated/pickupConfirmed=false
means a Seller registered a tracking code with packaging images, not verified
dispatch. The existing pickup deadline and expiry worker remain authoritative.

Use the explicit demo carrier `LatLaiSimulator`, not a real carrier's name or URL.
The Seller supplies `LL-` followed by8–32 uppercase ASCII letters/digits. Existing
input normalization trims outer whitespace and lowercases evidence UUIDs before
validation and receipt hashing; internal spaces/lowercase tracking are rejected.
The normalized `(carrier,trackingCode)` is globally unique, including past labels.
This establishes a usable simulator identity, not a booking with a logistics company.

## Command and authorization

`POST /orders/{orderId}/shipment` requires verified MEMBER Seller, active session,
Idempotency-Key, expectedOrderVersion, carrier, trackingCode and1–8 distinct Ready
packaging evidence IDs. RESTRICTED/LOCKED may fulfill this accepted obligation.
Buyer account restrictions do not erase the Seller's obligation. Buyers, unrelated
Members and generic Staff/Admin/TEST_OPERATOR roles cannot register on their behalf.

Authorization is checked before receipt replay. New registration reuses the Order
service's explicit fulfillment lock protocol: sorted participants/session, catalog/
listing, context/Order, revisions/media/commitment, packaging rows, tracking advisory
lock and ledger accounts. No storage or carrier request runs inside the transaction.
Require Preparing, original Order version, no existing Shipment, Active commitment,
Ready photos from this exact Order and full held P+S. Read decision time/recheck
session **after all decisive locks**. `decisionAt < pickupDeadline`; exact deadline
loses even if the worker is delayed. Tracking contenders serialize across independent
Orders and return a generic409 without disclosing the competing Order.

Snapshot origin, destination and shippingFee from the immutable agreement. There
is no client-controlled address/fee/direction/pickup flag. Direct shipping retains
the SRS SellerAdvanceBuyerReimbursement policy; registration neither charges the
Seller nor pays a carrier or reimburses anyone. It does not modify Order version,
listing, commitment, money or deadline. Receipt version1 belongs to Shipment.

The shared command executor writes Shipment, ordered evidence membership, receipt,
audit and outbox atomically. Same-key/same-normalized-payload replay returns the
original receipt after timeout/review/restart while current access remains valid.
Different key cannot replace an existing label. A changed payload with an old key
returns409. Outbox/receipt have IDs/state only, not contacts or tracking details.

## Database and reads

Migration15 adds `direct_shipments` (unique OrderPreparation FK, carrier/code,
frozen contacts/fee, registeredAt, receipt FK) and `shipment_packaging_evidence`.
Composite FKs `(orderId, shipmentId)` and `(orderId, evidenceId)` prevent cross-Order
linking. The registered image order is preserved. Required1–8 consecutive positions,
Ready status and uploadedAt<=registeredAt are checked at commit. Membership becomes
sealed when its registration receipt exists; later evidence uploads do not change it.

Insert guard requires a Preparing Order. Deferred checks verify original deadline,
agreement equality, actor/receipt/audit/outbox IDs, timestamp and current Order/ledger
invariants. Rows reject UPDATE/DELETE. Future carrier state transitions must extend
this guard with append-only events and explicit state rules in a new migration;
do not bypass or rewrite applied migrations. No old rows are backfilled or changed.

`GET /me/orders/{orderId}/shipment` permits verified MEMBER participants including
LOCKED, returning404 for absent/unrelated shipments. Seller sees origin+destination;
Buyer sees only their destination, with origin=null. No generic operations-role
access, public carrier link or storage URL. Evidence preview continues through the
audited participant endpoint from0.17. Registration stays readable after pickup review.

Order `shipmentRegistrationEnabled` now reflects Seller/Preparing/before deadline,
Ready evidence, full hold and no label. It is advisory; registration rechecks all
conditions. Consumers must not equate it with checkout readiness or pickup authority.

## Limits and next gate

There is no edit/replacement/cancellation API for mistyped labels. Do not work around
that by SQL edits. An incorrect simulated code can be used consistently by the future
simulator; an actual correction needs a separate, audited disposition preserving the
original identity. At/after pickup deadline, a new label is refused; existing evidence
can still be submitted to ResolutionPending for future independent review.

Carrier simulator/event ingestion, pickup confirmation, late-event decisions, delivery
timeout, review resolution, returns, settlement and RN shipment/checkout UI remain
planned. Label registration cannot suppress timeout, refund, reopen a book or bypass
that gate. Member checkout remains closed. This increment adds no paid provider or
credentials, and does not claim an end-to-end shipping workflow.
