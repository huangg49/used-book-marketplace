# ADR 0017: Unpaid direct Orders and exclusive commitments

2026-09-27. OpenAPI 0.12.0 implements the backend F1 slice from ADR 0013.
Scope: one Sale/Both listing, DirectDelivery, AwaitingPayment → Cancelled or
PaymentExpired. Funding, seller acceptance, shipments, returns, Exchange and auction
are not enabled. Read [the report](../features/UNPAID_ORDER_REPORT.md) for evidence.
Follow-up: [ADR 0019](0019-locked-existing-obligations.md) adds participant Order
listing and LOCKED read/media/cancel access. The original F1 limitations below
describe that increment. [ADR 0020](0020-order-wallet-payment.md) adds funding and
pre-confirmation refunds; seller acceptance/fulfillment remain planned.

## Contract and behavior

POST /orders takes an owned quote ID/version and the expected listing version and
revision. The server revalidates quote policy, addresses, seller eligibility, public
listing eligibility, catalog/media and the quote deadline inside the transaction.
It atomically creates one real Order, typed Order-only WorkflowContext, item and
agreement snapshots, one Active ExclusiveCommitment, event, receipt/audit/outbox,
and changes listing trade to Reserved with one version increment.

The payment deadline is decisionAt + 15 minutes (POL-01). Buyer may have at most
two AwaitingPayment Orders (POL-24). Overdue Orders still count until the worker
closes them. A quote cannot be reused for a second Order. Same-key replay returns
the original receipt after authorization even when the Order is closed. Other
keys cannot replay stale quote/listing versions implicitly.

Buyer cancellation is allowed before the deadline with expected Order version.
At or after the deadline it returns conflict; the worker records PaymentExpired.
Both operations close the context, release its own versioned commitment, preserve
listing visibility/moderation/owner/revision, and increment listing version once.
No ledger write or refund is manufactured for an unpaid Order. The three allowed
states make the scope explicit; adding funding/custody requires reviewing closure
and SQL invariants first, not just extending an enum.

GET /me/orders/{id} and its media read are participant-only. ACTIVE/RESTRICTED
Members can read history; only the buyer can cancel. New creation requires ACTIVE.
LOCKED access remains blocked pending the separate obligations capability design
before F2. Operations roles do not confer participant access. Worker actions do
not require either participant's session, role or account to remain active.

There is no Order list UI, checkout button or payment API in this increment.
Clients retain the receipt ID and GET the private Order. A future client increment
must add the paginated history contract before offering a transaction inbox.

## Snapshots and privacy

Item snapshots pin catalog/listing revisions, full advertised condition/text and
ordered media IDs. Agreement snapshots pin both contacts, participants, amounts,
policy, region, method and deadline. The closed schemas are in OpenAPI; SQL checks
them against source fields on insertion. Snapshots and events are append-only.
Subsequent address deletion does not erase or change an agreement already formed.

The private projection includes only the caller's own address. In this unpaid slice
Seller has not accepted the Order, so Buyer contact stays hidden (BR-46). Neither
participant receives the other contact. Receipt/audit/outbox contain IDs, versions,
state and deadlines only. The API returns no-store; URLs are not stored in snapshots.

Public shelf/detail/media exclude Reserved and Active commitments. Order media
checks participant rights and pinned revision, signs through storage outside a DB
transaction, then rechecks current authorization. Signed URLs retain the existing
120-second lifetime; revocation cannot erase a URL already issued to a client.

## Services, locks and integrity

OrdersService orchestrates. QuotesService prepares current quote sources using the
caller Tx. ReservationsService owns acquire/close; ListingCommitmentPolicy owns
trade/version projection. No nested command transaction or cross-module ad-hoc
mutation is used. Existing listing handlers retain their Available-only restrictions.

Creation: advisory command key → sorted participant users → session → quote policy
and addresses → catalog → listing → pinned revision/media → new commitment.
Reads/closure: sorted participants → session for HTTP → catalog/listing → context
→ Order → revision/media → commitment. New contexts have no existing contender.
Discovery relies on immutable ownership; decisive values are checked under locks.
Database clock_timestamp is sampled after locks; HTTP session expiry is rechecked
with this time. Arrival time, client time and transaction-start now() are not authority.

The shared executor now supports TransactionCommandReceipt and an explicit system
principal. Worker operation is hardcoded to OrderExpiry/expireOrder; no HTTP body
selects a worker. Existing actorId/operation/key uniqueness remains, with a separate
systemActor/operation/key unique index and exactly-one-principal SQL checks. No
synthetic user is created. Expiry key equals Order ID and survives restart/lost ack.

SQL uses a partial unique index for one Active commitment per listing, composite
item/revision/context foreign keys, immutable identities/snapshots/history,
checked transitions, and deferred consistency checks. At commit, Order/context/item/
agreement/commitment/event/receipt/audit/outbox must agree and Reserved must match
an Active commitment. Invalid intermediate state cannot commit. Application locks
and permission/quota checks are still required; SQL is not a replacement for auth.

Migration aborts if any old Reserved listing has no workflow context. It reports
bounded IDs for reconciliation and does not infer a buyer or silently mark it
Available. Old tests that manufactured Reserved by direct SQL are replaced by
real Order-backed lifecycle/public tests and raw-SQL rejection assertions.

## Expiry worker and delivery gate

Explicit entrypoint `pnpm dev:orders` compiles with Nest (constructor metadata is
required). The API does not start a background expiry loop. The worker discovers
up to 100 overdue candidates without row locks, then runs the normal user-first
locking protocol for each. Failures leave durable pending Orders for next sweep.
Two workers serialize/dedupe through the shared executor. Nothing steals an expired
commitment before its owning workflow closes it.

Each cycle reports processed/skipped/failed, remaining and oldestLagSeconds without
contacts. A backlog older than two one-minute cycles emits a warning. This is CLI
observability, not a deployed monitor or a throughput guarantee. `--once` performs
one sweep and exits nonzero on failure. Order outbox rows are durable; no notification
consumer is claimed in F1. Continuous supervision remains an operator setup step.

F2 requires balanced ledger, simulated funding, locked-participant obligations,
payment/timeout races and fulfillment/dispute flows. React Native checkout and native
acceptance remain separate gates. An unpaid Order is not a completed book purchase.
