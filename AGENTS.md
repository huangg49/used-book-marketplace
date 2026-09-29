# Working in Lật lại

Continuation handoff: read `docs/handoff/SESSION_STATE.md` for the latest saved
state and Android startup blocker, `docs/handoff/CONTINUATION_PLAN.md` for ordered
work packages, and `docs/handoff/NEXT_SESSION_PROMPT.md` for the receiving agent.
`CLAUDE.md` is a thin entry point to these same instructions. The plan does not
override the release gates or the business baseline below.

## Current scope

Priority update 2026-09-29: the owner confirmed the instructor accepts NestJS but
requires MongoDB, and authorized starting the database refactor after merging Q01.
Read `docs/refactor/MONGODB_PLAN.md` and the latest SESSION_STATE first. Preserve
F2h/OpenAPI 0.20.0 behavior, PostgreSQL data/migration history and existing clients.
The refactor is authorized before the remaining handoff gates close; this does not
authorize new business scope, weaken invariants, certify release, or merge future
refactor changes automatically. PostgreSQL remains the runtime until an explicitly
verified cutover; MongoDB design/probes are not a completed migration.

Existing handoff baseline: freeze business scope at F2h/OpenAPI
0.20.0. Start at `docs/handoff/START_HERE.md` and track the audit, existing-UI polish
and release gates in `docs/handoff/READINESS.md`. Finish those gates before extending
Delivered/inspection/settlement. A passing backend suite does not close native UI
acceptance. Source checkpoint `checkpoint/f2h-handoff-2026-09-28` has clean-clone
verification in `docs/handoff/REBUILD.md`. Native session and real JPEG upload have
partial acceptance in `docs/handoff/NATIVE_RUN_2026_09_28.md`; full native acceptance
and independent reviews remain open. Do not redo closed gates without a relevant
change. Preserve local work.

Business baseline: `docs/SRS_V1_1.md` plus `docs/features/LOCAL_HANDOVER_AUCTION.md`.
TP.HCM only, direct shipping retained, two simulated managed points, optional
ViaPoint for ordinary sales/exchanges, mandatory intake/inspection before auction.
Read ADR 0007 and the local transaction design/acceptance documents before extending
transaction features. Point/auction/real-carrier and completed-purchase workflows remain planned;
do not confuse accepted requirements with implemented APIs. Preserve v1.0 snapshots.

For commitment/checkout work, also read ADR 0013, `docs/features/COMMITMENT_DESIGN.md`,
`docs/features/COMMITMENT_ACCEPTANCE.md` and `docs/features/TRANSACTION_FOUNDATION_PLAN.md`.
These define the target architecture. Unpaid DirectDelivery Order backend is implemented
in OpenAPI 0.12.0; read ADR 0017 and `docs/features/UNPAID_ORDER_REPORT.md`.
Create/read/cancel, private pinned media and an explicit expiry worker use the shared
command executor and Order-only exclusive commitments. The DB rejects Reserved without
a real workflow. Checkout UI remains planned.
Order wallet funding and pre-confirmation full refunds are implemented in OpenAPI
0.15.0; read ADR 0020 and `docs/features/ORDER_PAYMENT_REPORT.md`. Payment holds the
frozen P+S once, cancellation/rejection/48h expiry records SettlementPending, then
the internal refund worker posts and releases atomically. Keep money/book held on
refund failure. No dispatch/strike/settlement-to-seller yet.
Order version differs from ownership/commitment version after funding. Reconciliation
includes holds; history uses immutable posting sequence. Restart API and worker together.
Seller acceptance and overdue pickup review are implemented in OpenAPI 0.16.0;
read ADR 0021 and `docs/features/ORDER_PREPARATION_REPORT.md`. Only the Seller can
accept paid obligations, including LOCKED/RESTRICTED. Preparing has an immutable
48h pickup deadline; worker opens a durable PickupReview/ResolutionPending once.
That is an unresolved verification task, not proof of custody, a strike or refund.
Keep hold/commitment and never use pre-confirmation refund after acceptance.
Shipping destination is shared only with the accepted Seller. Delivery events,
review resolution and post-acceptance cancellation remain planned.
DirectDelivery outbound shipment registration/read is implemented in OpenAPI 0.18.0;
read ADR 0023 and `docs/features/DIRECT_SHIPMENT_REPORT.md`. Seller registers before
pickup deadline with 1-8 Ready packaging images, one label per Order, global unique
LatLaiSimulator/tracking. Snapshot contacts/fee from agreement; LabelCreated does not
confirm pickup, extend deadline or move money/book. Reuse OrdersService fulfillment
locks. Images are sealed at registration; no tracking edit/replacement API exists.
Independent carrier pickup simulation is implemented in OpenAPI 0.19.0; read ADR0024
and `docs/features/CARRIER_PICKUP_REPORT.md`. ACTIVE verified TEST_OPERATOR must be
neither participant. Global eventId/key dedupe spans operators, with current auth
before replay and domain-separated signatures. First timely receipt moves InTransit;
late/conflicting events open sticky carrier review/ResolutionPending, preserving
hold/commitment/canonical pickup. Original label remains immutable; read derives
PickedUp from the Applied event. Pin the 240h delivery deadline/policy in that event.
Do not use pre-confirmation refund or restock from carrier evidence. Max128 retained
events per shipment; replay works at cap. Worker counts openCarrierReviews separately.
Delivery overdue review and Buyer overdue non-receipt intake are implemented in
OpenAPI 0.20.0; read ADR0025 and `docs/features/DELIVERY_OVERDUE_REPORT.md`.
Use the Applied pickup's pinned deadline, shared command executor and full hold locks.
Worker and Buyer share one delivery review; Buyer adds at most one immutable report.
InTransit4 becomes ResolutionPending5; evidence on an existing review keeps version5.
LOCKED/RESTRICTED Buyer may report; Seller/operations roles cannot report for Buyer.
Worker OrderDeliveryExpiry scans100 without candidate locks, retries failures and logs
deliveryRemaining/openDeliveryReviews/oldestDeliveryReviewAgeSeconds. Keep original
review identity and pickup history; no refund/restock/custody conclusion from a report.
Delivered/Buyer receipt/72h inspection and denial of carrier-reported delivery remain
planned. These review tasks are intake/blockers, not a completed dispute/adjudication
workflow. Review resolution and shipment/report UI remain planned.
Private packaging image intents/upload/participant previews are implemented in
OpenAPI 0.17.0; read ADR 0022 and `docs/features/PACKAGING_EVIDENCE_REPORT.md`.
Only accepted Seller uploads, including LOCKED/RESTRICTED; late evidence does not
prove pickup or resolve a review. Retain originals/previews outside listing cleanup.
Both pipelines share storage budget, hourly admission and per-process upload slots.
Packaging normalizes synchronously, retries create-only keys, rechecks auth after I/O.
No original-download, Staff assignment, claim files or packaging UI yet.
OpenAPI 0.14.0 implements LOCKED access to profile, participant unpaid Order
list/read/media/cancel and owned wallet/topup history. Read ADR 0019 and
`docs/features/LOCKED_OBLIGATIONS_REPORT.md`. Every other authenticated handler
denies LOCKED by default. Use method-only ExistingObligation plus service checks;
never treat login, roles or a client capability as permission for new transactions.
0.15.0 allows LOCKED paid cancellation/rejection; 0.16.0 adds Seller acceptance.
New payment remains denied for LOCKED.
Chat/claim-evidence/real-carrier and Admin lock/unlock workflows remain planned.
Simulated wallet/topup backend is implemented in OpenAPI 0.13.0; read ADR 0018 and
`docs/features/SIMULATED_WALLET_REPORT.md`. The finite 100M VND source is journalled;
it is not the POL-42 incident fund. Only independent TEST_OPERATOR events may credit
an intent through the signed simulator adapter. Balance comes from immutable entries.
No withdrawal/adjustment handlers or wallet UI exist. ReviewRequired
is sticky; daily reconciliation and resolution remain planned. Use `wallet:check`
after API build for read-only source/ledger reconciliation. Never refill by editing SQL.
Member address book and authenticated HCM demo service-area directory are implemented
in OpenAPI 0.9.0. Read ADR 0014 and `docs/features/ADDRESS_BOOK_REPORT.md`.
DEMO-A/B are simulated locality codes, not official wards or handover points.
Listing DirectDelivery origin selection is implemented in OpenAPI 0.10.0; read
ADR 0015 and `docs/features/LISTING_FULFILLMENT_REPORT.md`. Address content versions
and identity-only history protect frozen revisions when a contact is edited/deleted.
Unconfigured listings remain readable/moderatable; no checkout eligibility is implied.
DirectDelivery sale quote create/read APIs are implemented in OpenAPI 0.11.0; read
ADR 0016 and `docs/features/DIRECT_SALE_QUOTE_REPORT.md`. Quotes are immutable estimates,
never reservations or money holds. Use the shared command executor/QuoteReceipt,
DB decision time after locks, and pinned policy/address/listing versions.
Member checkout UI and ViaPoint remain planned. Native address/fulfillment UI QA is pending.

React Native is the first member client. Keep the shared NestJS API compatible with
Flutter and the operations web. The implemented reference slice is auth/profile;
read `docs/REACT_NATIVE_START.md` and ADR 0003 before adding a feature.
Catalog requests/review/public reads and owner listing drafts have real API handlers.
Owner media handlers, Supabase adapter, Sharp worker and RN private drafts are implemented;
live Supabase verification passed; Android debug build/UI emulator checks passed.
Native picker cancel and JPEG upload/Ready/preview/save/reopen passed on Android 15;
other formats, upload failures/background and full listing native acceptance remain pending.
Listing submission/moderation, reviewer media reads and public shelf/detail/media are implemented.
Read ADR 0011 and `docs/features/PUBLIC_SHELF_REPORT.md` before extending public reads.
RN guest shelf is `/`, account is `/account`, book detail is `/book?id=...`.
Approved edits, visibility/archive/removal are implemented; read ADR 0012 and
`docs/features/LISTING_LIFECYCLE_REPORT.md`. Completed paid transactions remain planned.
Read `docs/features/LISTING_ACCEPTANCE_REPORT.md` for the 32-case evidence audit;
listing native acceptance remains pending and browser storage fixtures are not live Supabase evidence.
Operations web catalog/listing review is implemented; read ADR 0010 and
`docs/features/OPERATIONS_REVIEW_REPORT.md` before extending it.
RN and operations share `packages/session-client`; browser tokens remain memory-only.
RN listing form, catalog selection/requests, submit and rejection/resubmission are implemented;
read `docs/features/RN_LISTING_SUBMISSION_REPORT.md` for retry behavior and pending native checks.
Read ADR 0009 and `docs/features/LISTING_REVIEW_API_REPORT.md` before extending review.
Read ADR 0008 and `docs/features/MEDIA_UPLOAD_REPORT.md` for
media limits; never present mocked storage tests as live-provider evidence.
Read `docs/features/LISTING_DATA_CONTRACT.md`, `docs/features/CATALOG_DRAFT_API_REPORT.md`
and ADRs 0005–0006 before extending them. Preserve hand-written SQL checks/triggers
in migration history and the user/role locking protocol.

## Architecture

- Put API business code under `apps/api/src/modules/<feature>`.
- Endpoints require authentication by default. Use `@Public()` only for intentionally
  public routes and `@Roles(...)` for role restrictions. Services still check object ownership,
  account eligibility and state transitions; hiding a button is not authorization.
- Cross-module mutations go through explicit services. Keep database transactions
  around atomic business operations. Never use Redis as the source of money balances.
- React Native routes compose screens in `src/features`; reuse the transport and
  session owner in `src/core`. Use TanStack Query for server data. Do not create
  parallel token stores or put access tokens in persistent storage.
- `packages/api-contract/openapi.yaml` is the contract. Change it first, then run
  `pnpm contract:generate`; commit both YAML and generated types. Do not hand-edit generated types.
- Add reviewed Prisma migrations for schema changes. Do not replace migration history
  with `db push`, reset shared databases, or silently change seed account passwords.

## Verification and handoff

- For React Native UI work, read `docs/design/UI_CODING_RULES.md` and
  `docs/design/UI_COMPONENTS.md`. Reuse `src/core/ui`; update the `/ui` catalog when
  changing shared controls. Keep fixture data outside the UI library. Review
  field errors, loading/empty/error states, long content, large text and keyboard
  behavior; do not use a modal for every error or invent trust signals.

- Run `pnpm contract:check`, relevant lint/typecheck/tests and build for the change.
- Auth, permissions, sessions and transactions require negative-path and race tests.
  API E2E uses a dedicated `TEST_DATABASE_URL` whose database name ends in `_test`.
- An Expo web export is not evidence of a successful native Android/iOS build.
- Update setup instructions and affected ADRs when behavior or configuration changes.
- Keep secrets, local databases and generated Prisma files out of Git. Log request IDs,
  not passwords, tokens or request bodies.
- Keep one feature per branch/PR and preserve unrelated work. Report remaining limitations
  honestly; a stub, mock response or document is not a completed business workflow.
