# Architecture

The platform is a modular monolith. This keeps deployment and transactions simple while enforcing module boundaries that can be split later if needed.

## Boundaries

Business target: [SRS1.1](../SRS_V1_1.md) and [ADR0007](../adr/0007-hcm-handover-auction-scope.md).
The [new logical model](../features/LOCAL_TRANSACTION_DESIGN.md) adds service areas,
point assignment/capacity, custody/inspection and auctions. These are planned domains,
not existing modules; real catalog/draft APIs remain described separately.
The [exclusive commitment design](../features/COMMITMENT_DESIGN.md) and
[ADR 0013](../adr/0013-exclusive-commitment-foundation.md) refine the shared
reservation authority, snapshots, safe closure and worker/HTTP lock order.
See the [implementation sequence](../features/TRANSACTION_FOUNDATION_PLAN.md)
before adding checkout; these are design decisions, not deployed modules.
F0 has implemented member addresses, demo service-area directory, revision-bound
delivery origins and [DirectDelivery sale quotes](../features/DIRECT_SALE_QUOTE_REPORT.md).
The quotes module uses the shared command executor; it writes no reservations,
orders or ledger entries. Point/custody/auction workflows remain planned.
F1 now has [unpaid direct Orders](../features/UNPAID_ORDER_REPORT.md), typed workflow
contexts, exclusive commitments and an explicit expiry worker. OrdersService uses
ReservationsService and ListingCommitmentPolicy inside the shared command transaction.
Worker receipts have an allowlisted system principal; no synthetic Member account.
F2a adds [simulated wallet/topups](../features/SIMULATED_WALLET_REPORT.md).
WalletService orchestrates the existing command transaction; LedgerService posts
typed journals in its caller Tx. Signed simulator events require an independent
TEST_OPERATOR. Withdrawals and automated reconciliation remain planned.
F2b adds [explicit LOCKED obligation access](../features/LOCKED_OBLIGATIONS_REPORT.md).
Login identifies the account; handler allowlist and service checks grant only
existing participant/owner actions. All other authenticated operations default-deny
LOCKED, including accounts with operations roles. No new session/token store exists.
F2c–g add wallet funding/refund before acceptance, Seller acceptance, private packaging
evidence, label registration and [independent simulated pickup](../features/CARRIER_PICKUP_REPORT.md).
ShipmentsService reuses fulfillment locks and asks OrdersService to change Order state.
Global carrier event replay runs through the shared command executor; money stays held
through InTransit and sticky carrier review. F2h adds
[delivery-overdue review and Buyer reporting](../features/DELIVERY_OVERDUE_REPORT.md)
inside OrdersService, sharing its command/lock protocol with the expiry worker.
Delivered/inspection, dispute resolution and settlement remain planned.

- Mobile apps serve Member workflows.
- The web console serves Staff, Admin, and authorized Test Operator workflows.
- The API owns authorization, business state, transaction integrity, and audit records.
- MongoDB is the source of truth ([ADR0027](../adr/0027-mongodb-persistence-protocol.md));
  PostgreSQL is retained only as read-only import history/source.
- Implemented media/Order queues and leases are in MongoDB. Redis/BullMQ remain
  available dependencies, not the execution engine or source of balances.
- Supabase Storage Free stores private images; MongoDB stores metadata and access rules.
  Listing Sharp runs in a separate worker; Order packaging evidence is normalized
  synchronously and retained separately. Claim evidence workflows remain planned. Read
  [ADR 0008](../adr/0008-free-private-media-storage.md) and [setup](../features/SUPABASE_MEDIA_SETUP.md).
- Payment and carrier simulators implement adapters behind the same boundaries expected for external providers.

## Backend modules

```text
addresses auth catalog commands listings media orders quotes
reservations shipments users wallet
```

These are the current directories under apps/api/src/modules. Exchanges, disputes,
community, managed points, custody/inspection and auctions remain target domains.
Modules use explicit services for cross-module mutations and MongoDB transactions
with the shared locking/commit-check protocol; see ADR0027 and the model map.

## Client architecture

Flutter currently has only a scaffold; its proposed architecture follows View,
ViewModel, Repository, and Service separation. React Native groups routes in
`src/app` and feature code outside the route directory, with shared session transport
and TanStack Query for server state. Flutter has not implemented equivalent flows yet.

Operations review uses feature modules, TanStack Query and shared session transport
with RN. See [ADR 0010](../adr/0010-operations-review-client.md); other operations
workflows listed above remain target scope.
