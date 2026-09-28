# ADR 0024: Independent simulated carrier pickup and durable exception evidence

Follow-up: [ADR0025](0025-delivery-overdue.md) enforces the pinned delivery deadline
and adds Buyer overdue non-receipt intake in0.20.0. Pickup semantics below are retained.

Accepted 2026-09-28 · OpenAPI 0.19.0. Extends ADRs 0013, 0020–0023;
SRS FR-S01/02, POL-03/07 and the accepted DirectDelivery business baseline.
Evidence: [carrier pickup report](../features/CARRIER_PICKUP_REPORT.md).

## Authority and protocol

`POST /operations/simulator/pickup-events` is an authenticated simulator adapter,
not a public provider webhook or evidence from a real carrier. Require an ACTIVE,
verified TEST_OPERATOR with a valid session who is neither Buyer nor Seller.
Having both MEMBER and TEST_OPERATOR does not waive independence. Restricted or
locked participants can still receive fulfillment, but cannot certify it themselves.

The exact envelope is eventId, shipmentId, orderId, carrier=LatLaiSimulator,
trackingCode, type=PickedUp, occurredAt. Input rejects extra fields and normalizes
UUIDs. Idempotency-Key must equal eventId. Match all shipment/order/tracking fields;
unknown or mismatched references return404 without exposing another Order.
The server adapter signs canonical JSON using HMAC-SHA256 and verifies it before
ingestion. Domain `LatLaiCarrierPickup-v1\n` is separate from payment events.
Local simulators share PAYMENT_SIMULATOR_SECRET configuration; no new credential,
cloud service or cost is added. Empty configuration disables simulation; existing
environment validation forbids enabling the simulator in production. No client
signature or actor override is accepted. Future real carriers need their own adapter.

## Atomic decision and idempotency

The shared command executor takes a global carrier-event advisory lock before
sorted operator/participant rows and session. Unlike actor-scoped commands, this
one command resolves event identity globally across independent operators. Current
role/status/session/independence checks run before accessing any historical receipt.
The original receipt is returned for equal normalized payload; changed authorized
payload returns409. Reference validation still takes precedence over replay.

New events follow the existing fulfillment lock order: listing, context/Order,
revisions/media/commitment, shipment, then sorted ledger accounts. Require full P+S
hold, Active commitment and Preparing/InTransit/ResolutionPending. Read DB decision
time and recheck operator session after all decisive locks. No external I/O occurs
inside this transaction. Evidence, state transition, review, receipt, audit and
outbox commit together; the Orders service owns Order mutations.

Registration rows and selected packaging membership remain immutable. The private
Shipment view derives PickedUp/version2 from its single Applied event; label-only
views remain LabelCreated/version1. This keeps registration receipts historical.
Money, listing, ownership phase and commitment version never change at pickup.

| Event | Outcome and Order |
|---|---|
| occurredAt before registration or after DB receive time |422, no write |
| First accepted event received strictly before original pickup deadline | Applied; Preparing3 → InTransit4 |
| First event at/after deadline, including after old PickupReview | ReviewRequired; ResolutionPending4, retain both review histories |
| New event ID with same occurredAt as first accepted event | Duplicate; append evidence, preserve current Order/review |
| New event ID with different occurredAt | ReviewRequired; InTransit4 → ResolutionPending5, or retain ResolutionPending4 |

Received time controls the pickup deadline. A late report claiming an earlier
pickup cannot suppress verification. A review is sticky: original canonical pickup
is never overwritten, and a later duplicate cannot clear the review. A conflicting
report about a previously conflicting time also remains ReviewRequired. These are
unresolved tasks, not verified custody decisions, strikes, refunds or restocking.

An Applied event pins deliveryDeadline=occurredAt+240 hours (POL-07), with immutable
policyCode=CARRIER-PICKUP-v1. This increment exposes the deadline; it does not implement
the delivery timeout or receipt/claim/settlement workflows. They are the next gate.

## Database and operational boundaries

Migration16 adds append-only carrier_pickup_events and carrier_pickup_reviews.
Composite FKs bind all references to the same Order/Shipment. Exactly one Applied
event per shipment; bounded consecutive sequences1–128, chronological receipt
times, a first review anchor and receipt/audit/outbox checks are enforced at commit.
Order transition/shape checks are extended in a new migration; the15 existing
migrations remain unchanged. A direct state update cannot create an InTransit Order
without its event. Receipt versions are event sequences, not Order versions.

Maximum128 retained events per shipment bounds processing and history reads; replay
still works at capacity. This is a demo operational cap: it is not a replacement
for provider queue retention or an incident-resolution tool. Worker logs expose
openCarrierReviews separately from deadline PickupReviews (a single Order may have
both); counters count records, not distinct Orders. No automatic review resolution.

`GET /me/orders/{orderId}/shipment/pickup-events` exposes chronological IDs/times/
outcomes only to verified MEMBER participants, including LOCKED. No operator ID,
signature, payload hash, extra contact or general Staff access. Existing Shipment
and Order reads include nullable carrierReview. Ordinary list filters admit InTransit.

Delivery events, delivery-overdue investigation, review assignment/resolution,
post-acceptance cancellation, returns, payout and member shipment/checkout UI remain
planned. Keep checkout closed until a complete safe lifecycle exists.
