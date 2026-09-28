# ADR 0020: Order wallet holds and pre-confirmation refunds

Date: 2026-09-28. Status: implemented backend increment F2c, OpenAPI 0.15.0.
Extends ADRs 0013, 0017–0019; business rules remain SRS 1.1 FR-O03–05,
BR-11/27, POL-01/02. Evidence: [payment report](../features/ORDER_PAYMENT_REPORT.md).
Follow-up [ADR 0021](0021-order-preparation.md) implements seller acceptance and
overdue pickup review while preserving holds. Its post-acceptance stages cannot use
this pre-confirmation refund path. The limits below describe the original F2c slice.

## Decision

Fund an existing ordinary DirectDelivery Order from its buyer's simulated available
account. Accept only expectedVersion and Idempotency-Key, never client amounts.
Move the frozen quote buyerTotal (P+S) atomically to one typed OrderHold account;
Order becomes PendingSellerConfirmation with paidAt and a fixed 48-hour deadline.
No seller credit, fee recognition or new simulator capital is created by payment.
An insufficient balance rolls back the account creation and every other write.

The buyer and seller must still be verified MEMBER ACTIVE/RESTRICTED for a new
payment. RESTRICTED can fund this existing commitment; LOCKED cannot authorize a
new purchase debit. A successful payment's same-key receipt remains replayable
after later cancellation, subject to current buyer permission. Seller eligibility
is a condition of new funding, not of retrieving an already committed receipt.
LOCKED participants can still read and request cancellation/rejection of their
existing paid Order. DISABLED/revoked/unverified/lost-role actors have no HTTP
shortcut; system workers process obligations without borrowing a member session.

Buyer cancellation and seller rejection before confirmation deadline record a
durable SettlementPending decision with reason and time. Confirmation expiry
records the same decision at or after the deadline. Neither decision releases
the book or reports a completed refund. An internal worker posts the full P+S
refund, closes Order as Cancelled and releases the commitment in one transaction.
Failure leaves the decision, money and book held for a retry. Fees are zero for
these pre-confirmation cancellations. Refund always goes back to the original
buyer's available account, including when that account becomes disabled.

The existing unpaid cancellation endpoint keeps its strict behavior. New routes
are `/orders/{orderId}/pay`, `/cancel-paid` and `/reject`. No client or operations
route can invoke expiry/refund or choose its principal. The shared command executor
allowlists OrderConfirmationExpiry/expireSellerConfirmation and OrderRefund/refundOrder.
Keys are the immutable Order ID per operation; each supported deadline/refund can
occur once. Immutable receipts, audit before/after and outbox remain atomic.

## Invariants and concurrency

Keep actor/system command lock → sorted participants → session → catalog/listing →
context/Order → revision/media/commitment → sorted ledger account locks. Take the
database decision clock after all relevant locks; recheck session expiration at
that time. Payment at the deadline is rejected even if the request arrived earlier.
Payment/expiry/cancel and cancellation/rejection compete under the same locks.

Order versions now advance 1 (unpaid), 2 (paid), 3 (refund requested), 4 (refunded).
Context/commitment versions reflect ownership: 1 while active, 2 at closure. Payment
does not reacquire the book or bump listing version. SQL no longer assumes these
independent versions equal. Commitment release receipt refers to Order version 4
for a paid cancellation, and 2 for an unpaid cancellation.

One OrderHold wallet account has a typed, unique Order FK and no user owner field;
the buyer is derived through that immutable Order. A user still owns exactly one
available account. Unique `(order_id,type)` journals prevent duplicate payment or
refund. Deferred checks verify full amount, original buyer, hold projection,
authorized receipt/audit/outbox and nonnegative balances. Append-only rules remain.
Migration is additive; old migrations/checksums are preserved. Replacing the journal
checker uses CREATE OR REPLACE to retain the function identity used by existing triggers.

Wallet total is available + transactionHeld; a pending refund is still held.
Reconciliation checks Order/hold/journal consistency and conserves exactly 100M:
clearing + member available + Order holds. Posting sequence orders running balances
and cursors, so identical millisecond timestamps/random UUIDs cannot place a debit
before its credit. Upgrade backfills sequence in the old timestamp/ID order without
changing any historical economic field. The account lock serializes new postings.

## Limits and deployment

This increment deliberately has no seller acceptance, dispatch, custody, dispute,
successful-sale settlement or withdrawal. SellerConfirmationExpired records a
reason, not an automatic strike: fault/system-incident verification and violation
handling are still planned (AC-12 is only partially implemented). Paid money always
has cancellation/rejection/timeout refund paths, but the purchase UI release gate
stays closed until the full delivery/claim/settlement chain exists.

Apply the migration, rebuild and restart both API and Order worker together. The
existing worker now processes separate bounded batches (100 each) of unpaid
expiry, confirmation expiry and requested refund; run every minute. It reports
per-phase backlog and oldest lag, retries persisted decisions after restart and
never scans with Order locks before acquiring users. Monitor failures/backlog;
there is no deployed scheduler/alert delivery or automatic ledger repair.

PrivateUnpaidOrder's historical schema name remains wire-compatible but now covers
funded states. New fields distinguish held/refunded amounts and cancellation reason.
`canCancel` is unpaid-only; `canRequestRefund` and `canReject` are separate. A payment
capability means this API is supported, not that the Member checkout UI is released.
Counterparty contacts remain hidden until an acceptance/fulfillment increment
explicitly implements BR-46. No new provider, credential or paid service is needed.
