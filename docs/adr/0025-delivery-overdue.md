# ADR 0025: Durable delivery-overdue review and Buyer non-receipt intake

Accepted 2026-09-28 · OpenAPI 0.20.0. Extends ADRs0013/0020–0024.
Requirements: SRS POL-07, FR-S05, BR-17, EF-11; the overdue branch of FR-D01/02.
Evidence: [delivery-overdue report](../features/DELIVERY_OVERDUE_REPORT.md).

## Decision and boundaries

An Applied carrier pickup already pins its delivery deadline at pickup+240 hours.
The next increment enforces that deadline and accepts the Buyer's overdue report.
At or after the deadline, the explicit Order worker opens an immutable verification
task; Buyer may independently report non-receipt and supply a description. Both
paths share one OrderDeliveryReview. Neither absence of tracking updates nor a
report establishes where the physical book is or who caused the delay.

This is durable intake and a fulfillment blocker, not a completed dispute system.
It provides no Staff assignment, adjudication, appeal, compensation or resolution.
Existing PickupReview/CarrierReview are retained as separate evidence records;
they do not become competing dispute decisions. A future dispute aggregate must
merge relevant evidence into at most one active case per transaction (FR-D01).

Delivered events, Buyer receipt confirmation, the72-hour inspection window and
denial of carrier-reported delivery remain planned. The current non-receipt route
therefore requires the pinned delivery deadline; it cannot yet satisfy the other
BR-17 branch (carrier says Delivered, Buyer denies). Introduce that eligibility
branch together with Delivered/inspection and its claim race tests. Keep checkout
closed and do not expose an unsupported “completed” or “refund approved” action.

## Commands and authorization

`POST /orders/{orderId}/non-receipt` requires verified MEMBER Buyer, current session,
Idempotency-Key, expectedVersion4/5 and description20–2000 Unicode characters after
outer whitespace normalization. NUL is invalid; arbitrary IDs, timestamps, amounts,
worker identity and refund flags fail schema validation. No upload is necessary to
preserve the report. Seller and unrelated Members receive404; generic Staff/Admin/
TEST_OPERATOR has no authority. LOCKED/RESTRICTED Buyer retains this existing-obligation
action via method-only ExistingObligation and service ownership checks.

Use the existing shared Order command executor, canonical body hash, receipt/audit/
outbox and authorization-before-replay. Exact replay returns the original receipt
after restart even when the old expectedVersion is no longer current; altered
payload returns409. A new key cannot add a second Buyer report or overwrite the first.
There is no report-edit/withdrawal API in this increment. Reports are private to
participants; audit/outbox include IDs/state/reason, never the description.

Worker calls the internal `expireDelivery`, with allowlisted system principal
OrderDeliveryExpiry and operation expireOrderDelivery. Its durable key is Order ID
(one immutable delivery deadline per current outbound); no HTTP request may choose
this principal. Worker does not require a participant's session or eligible account.

## State, money and concurrency

Both paths discover and lock participants in sorted order before the existing
Order fulfillment lock protocol. Require Applied pickup, InTransit or
ResolutionPending, Active commitment and the complete frozen P+S hold. Lock Shipment
then the real ledger accounts; read database decision time and recheck Buyer session
after all decisive locks. At exact deadline a new report/review is eligible. Arrival
before the deadline does not prevent eligibility if actual DB acceptance is after it.

| Current state and existing records | New command result |
|---|---|
| InTransit4, no review | Create review, transition ResolutionPending5; Buyer path also creates report |
| ResolutionPending5 due to conflicting pickup, no delivery review | Add overdue review/evidence, preserve state/version and carrier review |
| Existing delivery review, no Buyer report | Buyer with expectedVersion5 attaches one report; preserve original opening record |
| Existing delivery review, worker retry | Own original receipt replay, or409 if Buyer opened it first |
| Existing Buyer report, new key |409; exact original key/payload replays |
| No Applied pickup or before its delivery deadline |409, no writes |

Worker/Buyer concurrent writes serialize. If worker wins, a Buyer request still
expecting version4 returns409; GET current Order and retry version5. Failed commands
commit no receipt, so retain the intent until the user request succeeds. If Buyer
wins, the worker skips the already-open review. Order only transitions once; adding
evidence to an existing review does not increment Order version. Consumers must
refetch Order after commands even when receipt version remains5.

No journal, fee payment, Seller available balance, listing status, context ownership
or commitment version changes. Never call pre-confirmation refund after pickup.
Later duplicate/conflicting pickup events retain ResolutionPending and the existing
delivery review. Historical InTransit pickup receipts are still historical; they
do not resume the Order on replay.

## Database, worker and projection

Migration17 adds immutable order_delivery_reviews (one per Order, same-Order Applied
pickup FK, opening principal/policy/receipt) and order_non_receipt_reports (one per
review's Order, submittedAt, description and Buyer receipt). When Buyer opens the
review, both records share one command receipt. If worker opens first, report has
its own receipt and the opening identity stays unchanged.

Deferred checks validate state/version5, actual Applied pickup, pinned deadline,
chronology and matching receipt/actor/context/audit/outbox. Existing aggregate checks
continue validating full hold and Active commitment. Hand-written SQL extends the
prior pickup/preparation checker to admit a delivery blocker while preserving earlier
event receipts; the16 applied migrations are untouched. Partial index on Applied
delivery_deadline/id supports discovery; rows reject UPDATE/DELETE.

Worker discovers up to100 candidates ordered by immutable deadline/id without row
locks, then submits one transaction per candidate. The delivery pass is separate
from unpaid expiry, seller confirmation, refund and pickup expiry. One failed
delivery review does not stop other candidates. Next sweep retries uncommitted work.
Observe deliveryRemaining, openDeliveryReviews, oldestDeliveryReviewAgeSeconds,
failed and oldestLagSeconds. Backlog excludes tasks already opened; open-task counts
remain until resolution exists. Different review counters count records, not distinct
Orders. There is no automatic task dismissal or financial closure.

Order GET adds nullable deliveryReview with pinned deadline and nullable buyerReport,
plus advisory canReportNonReceipt. Shipment GET preserves its canonical pickup;
read Order for blockers. Participant reads stay private/no-store, including LOCKED.
No operations browsing endpoint or notification consumer is implied by an outbox row.

## Rollout

Back up the local database, generate Prisma and deploy17, build, restart API and
Order worker together, then run wallet:check and authenticated read/negative smoke.
No new environment keys, services, seed passwords or paid provider. Retain volumes
and all old migration checksums. Review and report rows must survive upgrades and
future adjudication; do not resolve or refill anything through SQL edits.
