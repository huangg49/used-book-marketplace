# ADR 0013: Shared exclusive commitments before transaction workflows

Date: 2026-09-27. Status: target design, with F0 and unpaid Order-only F1 implemented;
F2a wallet/topup is implemented; paid transactions and F3–F5 remain planned.
Product authority: SRS 1.1 and ADR 0007. No new scope or
instructor approval is implied.

Implementation follow-up: F0 address/origin/DirectDelivery quote prerequisites are
implemented through [ADR 0016](0016-direct-sale-quotes.md), OpenAPI 0.11.0.
The Order-only unpaid backend and exclusive commitments are implemented through
[ADR 0017](0017-unpaid-direct-orders.md). The separate wallet/topup foundation is
implemented through [ADR 0018](0018-simulated-wallet-ledger.md). Order funding, transfer, Exchange/auction and
client workflows specified here remain planned. The original design text below
records the baseline before those increments.

## Problem

The API currently has listing lifecycle commands but no orders, exchange proposals,
auction intakes or transaction reservations. `Listing.trade = Reserved` is an enum
value, not evidence that a reservation service exists. Separate reservation tables
per feature would allow the same physical copy to be sold and exchanged concurrently.
Expiry alone is insufficient to release a copy already with a carrier or at a point.

## Decision

Use one PostgreSQL `ExclusiveCommitment` authority shared by Order, Exchange and
AuctionIntake. One partial unique index protects an Active commitment per listing.
`Listing.trade` is a projection updated in the same transaction, with commit-time
consistency constraints. Do not use Redis TTLs, frontend countdowns or scheduled
deletion as ownership of a reservation.

Acquire one item for an Order/intake and both items for Exchange atomically.
Proposed exchanges do not reserve anything. Snapshot the accepted listing/catalog
revisions, fulfillment, addresses, prices and policy. Recheck versions and eligibility
under locks; a quote is not a reservation or permission to use a stale price.

WorkflowContext has real typed foreign keys, not a free-form `(type, id)` reference.
An auction outcome creates an Order context and transfers the existing commitment
and point slot in one transaction. Commitment identity remains stable; append an
immutable transfer event and retain the intake context. Never release/reacquire.

Business deadlines stop commands, not physical obligations. Payment/cancellation
workers use the same locking protocol as HTTP commands. Expired or cancelled
workflows can retain Active commitments while custody, refunds or incidents remain
unresolved. Release requires an explicit, versioned disposition from the owning
workflow; only that workflow can release. Closing Exchange commitments waits for
both items' dispositions and financial obligations, then applies both together.

Extend the existing command orchestrator rather than introducing a second receipt
store. Preserve authorization-before-replay, canonical hashes, bounded retry and
atomic receipt/audit/outbox. Add a separate transaction receipt schema so existing
listing clients keep their current closed discriminators. Worker identities must
be explicit system principals with an allowlist, never synthetic Member sessions.

Use a fixed lock hierarchy and discover the full resource set before taking locks.
Re-discover by rollback/retry when the set changed; never append a smaller UUID user
lock after locking a listing. Take the database decision timestamp after contention
has resolved; operations at the exact deadline lose eligibility even if HTTP
arrived earlier. This defines “valid server acceptance” for SRS §3.2, not a grace period.

## Boundaries and implementation gates

The [design](../features/COMMITMENT_DESIGN.md) specifies models, transitions, locks,
snapshots, private data and integration seams. The [acceptance plan](../features/COMMITMENT_ACCEPTANCE.md)
requires PostgreSQL races, raw constraint tests, lost acknowledgements and worker
restarts. The [implementation plan](../features/TRANSACTION_FOUNDATION_PLAN.md)
separates the first unpaid DirectDelivery Order slice from funding/Exchange/points/auction.

No generic public reserve/release endpoint, API placeholder, fake payment or user
control over trade/custody is introduced. OpenAPI and Prisma stay unchanged in this
design increment. Routes and exact wire errors must be added to OpenAPI first in
their implementation increment, with generated types and real handlers.

Address/service-area/fulfillment support precedes real checkout. Funding cannot
open until ledger and the SRS access path for locked participants' existing
obligations are implemented and tested. Follow-up [ADR 0019](0019-locked-existing-obligations.md)
implements explicit LOCKED access for existing unpaid Orders and wallet reads;
future paid/chat/evidence/custody obligations still require their own checks.
Native listing acceptance is still pending.

## Consequences

The conservative user locks may serialize popular sellers; test the 100-request
case without claiming production throughput. A delayed expiry worker can temporarily
retain stock; safety wins over stealing another context's commitment. Monitor and
recover the worker. Point slots remain occupied through outbound inspection and return.
Snapshots and event history use more storage but preserve evidence without changing
listing ownership. Future returns that require renewed review need an explicit
listing-domain transition; current owner edit endpoints cannot perform it.
