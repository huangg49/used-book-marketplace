# ADR 0021: Seller acceptance and pickup verification deadline

2026-09-28 · OpenAPI 0.16.0 · F2d backend increment. Extends ADRs 0013, 0017–0020.
Sources: SRS 1.1 FR-O04–06, FR-S05, BR-11/15/46, POL-02/03; commitment design and
acceptance matrix. See [implementation report](../features/ORDER_PREPARATION_REPORT.md).

Follow-ups: [ADR 0022](0022-order-packaging-evidence.md) implements packaging images;
[ADR 0023](0023-direct-shipment-registration.md) implements outbound label registration.
Neither changes the pickup deadline or proves carrier custody. The original scope
below records0.16.0; authenticated pickup/review resolution remain planned.

## Decision

Add `POST /orders/{orderId}/accept` with expectedVersion and Idempotency-Key. Only
the verified MEMBER seller with an active session can accept their existing paid
Order. RESTRICTED/LOCKED may fulfill this obligation; no generic permission to buy,
review or administer is granted. Buyer account restrictions do not erase a paid
obligation. Seller role removal, disabled/unverified account or revoked/expired
session still prevents the command. Current object/actor permission precedes replay.

From PendingSellerConfirmation, before its original deadline, verify the full
Order hold under account locks and transition to Preparing. Insert an immutable
OrderPreparation with acceptedAt, pickupDeadline=acceptedAt+48h and explicit policy
ORDER-PICKUP-v1. The command creates no journal, seller credit, fee, commitment event
or listing version increment. At the exact confirmation deadline, acceptance loses.
Client timestamps and arrival before a lock wait cannot extend either deadline.

Buyer cancellation/rejection/confirmation expiry and acceptance serialize through
the existing command → users → session → catalog/listing → context/Order →
revision/media/commitment → ledger accounts protocol. If cancellation wins, no
preparation exists. If acceptance wins, pre-confirmation cancellation/refund is
blocked. Replays return the original receipt and never a refreshed deadline.

Only the accepted seller may read the frozen buyer destination via shippingAddress,
as BR-46 requires. The buyer continues to receive their own contact. Outsiders,
operations roles without participant MEMBER authority and public reads receive no
destination. Address-book changes never rewrite the agreement. This increment does
not share the seller's contact with the buyer or add contacts to list/receipt/outbox.

## Missing pickup evidence requires verification

At or after pickupDeadline, an explicit internal OrderPickupExpiry principal uses
operation expireOrderPickup, immutable Order ID key, and the same participant locks.
Preparing becomes ResolutionPending with one append-only PickupReview opening record.
The record says PickupDeadlineExceeded and exposes status Open. It does not assert
that a carrier picked up, that the book is at its seller, or that a member is at fault.

Keep the full hold and Active/Reserved commitment. Do not call the pre-confirmation
refund service, release the book, charge fees, assign a strike or mark a sale complete.
Failure anywhere in review/Order/receipt/audit/outbox rolls back this transition;
the overdue Preparing record remains discoverable after worker restart. A worker
does not need either participant to retain a live session or eligible account.

The existing one-minute worker adds a fourth bounded scan of 100 overdue preparations.
Candidate discovery never locks Orders first. Report pickupRemaining as executable
backlog, and openPickupReviews/oldestPickupReviewAgeSeconds separately as unresolved
work. A zero worker backlog does not mean those cases have been resolved.

## Database and migration

OrderPreparation uses its Order FK as primary key, a unique receipt FK, immutable
acceptedAt/policy/deadline; PickupReview has a unique preparation FK and receipt FK.
Both reject UPDATE/DELETE. Deferred constraints link acceptance to seller, deadline,
Order state/version, receipt, audit and outbox; the pickup review must reference the
allowlisted system principal, receipt and due deadline. Raw state changes without
those records fail at commit. All existing ledger/commitment invariants remain.

Versions: paid Order 2 → Preparing 3 → ResolutionPending 4; context/commitment stay
version 1 and listing stays Reserved. A cancelled pre-confirmation Order still uses
the 0.15.0 version path. No existing table rows are backfilled or rewritten. The
additive migration replaces only the relevant shape/transition/aggregate checker
definitions, keeping previous migration files and function identities unchanged.

## Explicit remaining work

There is no Shipment registration, package-evidence upload, carrier adapter/event,
pickup confirmation, review assignment/decision/closure, post-acceptance mutual
cancellation, return, dispute or seller settlement in this increment. An Open
PickupReview is a durable unresolved task, not a completed investigation workflow.
Do not manually close it by SQL or feed it to the pre-confirmation refund path.

The member purchase UI remains closed. These backend stages support controlled
development and tests; accepted Orders cannot yet complete delivery or cancellation
after acceptance through an end-to-end workflow. The next increment must implement
shipment evidence, authenticated carrier events and independent custody verification,
then permitted continuation/refund with negative/race tests. Extending ResolutionPending
requires decision records and SQL rules, not changing the label alone.

No paid service, new provider credentials, new native UI or claim of production
readiness is introduced. Apply migration, build and restart API plus Order worker
together; use wallet:check for read-only ledger/Order reconciliation afterward.
