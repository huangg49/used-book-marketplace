# API

NestJS modular monolith shared by every client. The API owns permissions, state transitions, reservations, wallet holds, settlement, dispute decisions, idempotency, and audit records.

```bash
# From repository root:
pnpm setup:local
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/v1/health`

Add modules under `src/modules/<business-area>`. Keep cross-module changes behind explicit services or events and use database transactions for business operations that must commit atomically.

See [team setup and E2E instructions](../../docs/REACT_NATIVE_START.md). PostgreSQL must
be running before migration or API startup. Environment variables are validated at startup.
`AuthModule` installs global authentication and role guards. Endpoints require login
unless explicitly marked `@Public()`. Use `@Roles(...)` for role restrictions. Feature endpoints must
also check object ownership and account eligibility for their business action.

## Catalog, media and listing moderation (2026-09-27)

OpenAPI 0.8.0 retains 14 catalog/draft operations implemented: search/read confirmed
books, request/resubmit/review catalog, create/save/read/list drafts and revision
history. Seven owner media operations now have handlers (including binary upload);
Six submission/review/reviewer-media and three public listing/media operations
plus four listing lifecycle operations are implemented, for 34 total. Read [ADR 0012](../../docs/adr/0012-listing-lifecycle.md) for replacement, visibility, archive and removal.
Public eligibility, snapshot reads and image authorization are described in
[ADR 0011](../../docs/adr/0011-public-shelf.md). See the
[catalog report](../../docs/features/CATALOG_DRAFT_API_REPORT.md) and
[review report](../../docs/features/LISTING_REVIEW_API_REPORT.md) for evidence and limits.
Prisma now includes the listing schema and a reviewed migration with PostgreSQL
checks/triggers. Use `prisma migrate deploy`, never `db push`, to retain those
constraints. No listing seed data is added and existing accounts are unchanged.

Read [data/transaction design and verification](../../docs/features/LISTING_DATA_CONTRACT.md)
and [ADRs 0005](../../docs/adr/0005-listing-contract-and-storage.md)/
[0006](../../docs/adr/0006-catalog-draft-commands.md) before implementation.
[ADR 0009](../../docs/adr/0009-listing-submission-moderation.md) extends the locking
protocol to both reviewer and owner; do not remove these locks based on an earlier guard result.
`pnpm test:api:e2e` also verifies the migration in a temporary schema inside the
dedicated `_test` database; its test role needs CREATE SCHEMA and DROP on that schema.

## Private media

Follow [Supabase Free setup](../../docs/features/SUPABASE_MEDIA_SETUP.md), then run
`pnpm dev:media` from the root in a separate process. No worker runs inside HTTP API.
Missing storage credentials do not affect auth/catalog; uploads fail closed.
Read [ADR 0008](../../docs/adr/0008-free-private-media-storage.md) and
[verification/limits](../../docs/features/MEDIA_UPLOAD_REPORT.md).

## Member address book

Apply migration 20260927000000_member_address_book with pnpm db:migrate. OpenAPI 0.9.0 adds six authenticated Member address/directory operations. No new API environment variables. Compose supports optional POSTGRES_PORT in the root .env; match the API DATABASE_URL port and use --env-file .env when starting Compose. See [address report](../../docs/features/ADDRESS_BOOK_REPORT.md) for version/default/privacy rules and demo geography limitations.

OpenAPI 0.10.0 adds revision-bound delivery origins on existing listing routes.
Apply `20260927010000_listing_fulfillment` and restart the API after building;
old running processes do not load the new projection automatically. No cloud
configuration or reseed is required. See [fulfillment report](../../docs/features/LISTING_FULFILLMENT_REPORT.md).

## DirectDelivery sale quotes

OpenAPI 0.11.0 adds Member `POST /listings/{listingId}/quotes` (Idempotency-Key)
and buyer-only `GET /me/quotes/{quoteId}`. They compute/read immutable estimates,
not orders or reservations. See [ADR 0016](../../docs/adr/0016-direct-sale-quotes.md)
and [verification](../../docs/features/DIRECT_SALE_QUOTE_REPORT.md).

Run `pnpm db:generate` and `pnpm db:migrate` for
`20260927020000_direct_sale_quotes` (nine migrations total), then build/start the API.
No new environment variables, workers, cloud services or reseeding are required.
Policy HCM-DIRECT-v1 is seeded by the migration: simulated shipping 30,000 VND,
commission 500 basis points, quote TTL 300 seconds. Existing policies/quotes cannot
be edited; future policy versions and selection changes need a reviewed migration.
The active-quote cap is 20 per buyer. An old running API must be restarted to serve
these handlers; migration success alone is not proof it is serving the new code.

## Unpaid direct Orders and expiry

OpenAPI 0.12.0 adds create/read/cancel Order and participant-only pinned media reads.
Read [ADR 0017](../../docs/adr/0017-unpaid-direct-orders.md) and
[evidence/limits](../../docs/features/UNPAID_ORDER_REPORT.md). Orders hold stock for
15 minutes, at most two unpaid Orders per buyer. No Order payment or shipping yet;
the separate wallet/topup foundation is described below.

Apply `20260927030000_unpaid_direct_orders` with `pnpm db:migrate` (ten migrations).
The migration aborts on legacy Reserved listings; reconcile reported IDs instead
of resetting the database or manufacturing contexts. No env changes or reseed.
Restart the built API to load handlers; migration does not update a running process.

Run `pnpm dev:orders` from root in a separate terminal. This uses the Nest compiler
to preserve dependency-injection metadata. Production: build, then
`pnpm --filter @used-books/api worker:orders:prod`. For one sweep run
`node dist/order-worker.js --once` from `apps/api`; failures return a nonzero exit.
The HTTP API never starts the worker implicitly. Supervise the worker for a demo;
each minute it scans up to 100 candidates, retries durable pending work and logs
failed/remaining/oldestLagSeconds. A lag over 120 seconds needs attention.
Outbox writes are implemented; notification consumption and a monitoring UI are not.

E2E compiles a worker test harness into ignored `.tmp/order-worker-test`, starts
fresh Node processes against a dedicated schema, and checks expiry/dedupe.
Never supply a real application database to this harness.

## Simulated wallet and topups

OpenAPI 0.13.0 adds six wallet/topup operations, immutable double-entry VND journals,
and independent TEST_OPERATOR events. Read [ADR 0018](../../docs/adr/0018-simulated-wallet-ledger.md)
and [verification/limits](../../docs/features/SIMULATED_WALLET_REPORT.md).
Migration `20260928010000_simulated_wallet` is migration 11; `pnpm db:migrate` posts
one finite 100M VND simulated capital journal. It never credits Member balances or
reseeds accounts. No refill, direct balance edits, withdrawal or Order payment API.

Set server-only `PAYMENT_SIMULATOR_SECRET` to >=32 random characters in local
development; unset disables funding. `pnpm setup:local` generates it only for new
env files, preserving existing files. Do not put it in Expo/Vite variables. Production
refuses a configured simulator. Build/restart API after configuration changes.

After build, `pnpm --filter @used-books/api wallet:check` validates source and journal
invariants in a read-only repeatable snapshot. Nonzero exit means investigate before
financial work; it does not repair posted entries. A daily worker, discrepancy
resolution/settlement block, LOCKED wallet access and wallet/simulator UI are still
planned. This CLI is not evidence of those workflows or of real payment integration.

## Locked accounts and existing obligations

OpenAPI 0.14.0 allows verified LOCKED accounts to login/refresh and GET profile,
participant Order list/detail/media, cancel their unpaid Order before deadline,
and read their wallet/topup history. All other authenticated handlers deny LOCKED
by default, including new-action receipt replay and all operations roles. No new
migration or env. Build/restart the API and reload client bundles for the shared
CurrentUser parser. See [ADR 0019](../../docs/adr/0019-locked-existing-obligations.md)
and [verification](../../docs/features/LOCKED_OBLIGATIONS_REPORT.md).

New handlers must explicitly opt in at method level AND recheck roles, ownership,
state and session in the service. LOCKED topupEnabled=false; DISABLED/unverified
and revoked/expired sessions still fail. Admin status-change APIs, paid obligations,
chat/claim-evidence/shipment and native wallet/Order UI remain planned. Paid obligations
and acceptance subsequently landed in 0.15/0.16; see the root README and their reports.

## Order packaging images (0.17.0)

Read [ADR 0022](../../docs/adr/0022-order-packaging-evidence.md) and
[verification](../../docs/features/PACKAGING_EVIDENCE_REPORT.md). This adds accepted
Seller upload intents/binary uploads and audited participant previews. No new env or
provider: the existing private Supabase bucket/Sharp adapter is reused. Packaging
shares admission budget and process upload slots with listing media, but is retained
in its own table/prefix and must never be removed by listing cleanup.

Back up the current local DB, run `pnpm db:generate`, `pnpm db:migrate` and build the
API. Restart API, media worker (if running) and Order worker together: older API
processes do not count packaging reservations in the global budget. Migration14
`20260928040000_order_packaging_evidence` is additive; no seed/reset is required.
Run `pnpm --filter @used-books/api wallet:check` and `pnpm doctor:local` afterward.

Create intent with `POST /orders/{orderId}/packaging-evidence`, the current Order
expectedVersion, MIME, size, SHA-256 and Idempotency-Key. Save the returned evidence
ID; binary PUT to `.../{evidenceId}/content` uses a separate stable key and the same
exact bytes on retries. Both require the existing bearer session. There is no
upload ticket/finalize/worker job for this bounded synchronous upload. Lost replies
must retry the same key; private list recovers intent IDs by hash. Ready preview is
available at `GET /me/orders/{orderId}/packaging-evidence/{evidenceId}/read`.

The32 retained intent cap includes failures; the20/hour cap combines both pipelines.
No reclamation is implemented, so capacity may remain exhausted. Keep private
object backups with DB metadata. Packaging Ready never means carrier pickup or
verified authenticity. Shipment registration, carrier simulation, assigned Staff
original access, dispute files and React Native packaging UI remain planned.

## DirectDelivery label registration (0.18.0)

[ADR 0023](../../docs/adr/0023-direct-shipment-registration.md) and
[verification](../../docs/features/DIRECT_SHIPMENT_REPORT.md) implement the next
shipment subresource. Back up the DB, generate Prisma, deploy migration15, build,
restart API/Order worker, then run wallet:check. No env, real carrier service or
paid provider is added. Preserve existing accounts/seed passwords and DB volumes.

Seller calls `POST /orders/{orderId}/shipment` with Idempotency-Key,
`expectedOrderVersion`, `carrier: LatLaiSimulator`, `trackingCode: LL-XXXXXXXX`
(8-32uppercase letters/digits after the prefix), and1-8Ready `packagingEvidenceIds`.
Use the current Order version, not an evidence receipt version. Submit before the
pickup deadline. Keep the key/payload on lost acknowledgement; retry returns the
original Shipment receipt. Read with `GET /me/orders/{orderId}/shipment`;404 means
absent or inaccessible. Order detail exposes current `shipmentRegistrationEnabled`.

Exactly one outbound/Order and globally unique normalized carrier/code. The server
pins agreement contacts/fee and the chosen ordered images. It ignores no overrides:
unrecognized body properties fail validation. A label does not call a carrier or
mark Order InTransit; timeout still opens review. No code correction/replacement API
exists. Pickup simulation is implemented below; shipment UI remains planned.

## Independent pickup simulator (0.19.0)

[ADR 0024](../../docs/adr/0024-carrier-pickup.md) and
[verification](../../docs/features/CARRIER_PICKUP_REPORT.md) add pickup events.
Back up the DB, generate Prisma, deploy migration16, build and restart API/Order
worker together, then run `wallet:check`. Keep earlier migrations and seed accounts.
Uses existing `PAYMENT_SIMULATOR_SECRET` with a separate HMAC protocol domain;
no new secret or paid provider. Simulator remains disabled in production.

An ACTIVE verified TEST_OPERATOR who is neither participant calls
`POST /operations/simulator/pickup-events`, with `Idempotency-Key` equal to `eventId`.
Body: `eventId`, `shipmentId`, `orderId`, `carrier: LatLaiSimulator`, exact registered
`trackingCode`, `type: PickedUp`, `occurredAt` (ISO date-time between registration and
server receive time). Retain payload/key on lost acknowledgement. Event IDs are global
across operators; same payload returns the original receipt, subject to current auth.
This authenticated adapter signs/verifies locally; there is no public callback.

First timely receive moves Preparing3 to InTransit4 and pins the240-hour delivery
deadline. At/after pickup deadline, even an earlier occurredAt opens review. Conflicting
times also open a sticky review. Same factual time/new ID is Duplicate. No money or
stock mutation. Shipment GET exposes canonical pickup and review; participant
`GET /me/orders/{orderId}/shipment/pickup-events` exposes bounded private history.
The128-event cap rejects new events with429; existing receipt replay still works.
Worker `openCarrierReviews` counts records separately from deadline reviews.

Delivery timeout, Delivered, review resolution, return and settlement remain planned.
Do not resolve these tasks by editing SQL or call pre-confirmation refund after pickup.

## Delivery overdue and Buyer non-receipt (0.20.0)

[ADR0025](../../docs/adr/0025-delivery-overdue.md) and
[verification](../../docs/features/DELIVERY_OVERDUE_REPORT.md) add durable delivery
review plus Buyer overdue reporting. Back up DB, generate Prisma, deploy migration17,
build and restart API/Order worker together, then run `wallet:check`. No new config,
paid service or seed account change. Preserve prior migrations and storage volumes.

The worker scans up to100 Applied pickups whose pinned delivery deadline has arrived
and whose Order has no delivery review. It records a task once and moves InTransit4
to ResolutionPending5, preserving money and stock. Review creation failures remain
in `deliveryRemaining` and retry next sweep. Watch `failed`, `oldestLagSeconds`,
`openDeliveryReviews` and `oldestDeliveryReviewAgeSeconds`; opened tasks are not scan
backlog. Review counters count records and may overlap for the same Order.

Buyer calls `POST /orders/{orderId}/non-receipt` with `Idempotency-Key`, current
`expectedVersion` (4 or5), and `description` (20–2000characters after outer trim).
No images are required. Before pinned deadline/no Applied pickup returns409.
LOCKED/RESTRICTED Buyer retains access; Seller/outsiders cannot report for Buyer.
If worker already opened the task, GET current Order and submit version5: this adds
the Buyer's report to the same opening record. One report per Order; no edit/remove
API yet. Lost acknowledgement: retry the original key/payload. Changed committed
payload409; a failed command leaves no receipt. Refetch after every successful command
even if Order version stays5 while evidence is added.

`GET /me/orders/{orderId}` returns nullable `deliveryReview` (including immutable
deadline/opening source and nullable `buyerReport`) and `canReportNonReceipt`.
Both participants see the report, private/no-store. Description is excluded from
audit/outbox/logs. No generic operations read is granted. Delivery-overdue intake
cannot decide custody or unlock money/book; current review resolution is still planned.

Delivered, Buyer receipt,72-hour inspection and non-receipt after carrier-reported
delivery are the next lifecycle increment. Do not present this route as the whole
dispute workflow or open member checkout before safe completion paths exist.
