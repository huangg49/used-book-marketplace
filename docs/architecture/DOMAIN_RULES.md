# Quy tắc theo miền nghiệp vụ

Tách từ AGENTS.md tại 19ffb84 ngày 30/09/2026 để chỉ đọc khi sửa miền liên quan.
Các phiên bản OpenAPI dưới đây là mốc từng tính năng, không là phiên bản runtime
hiện hành. Tra [contract](../../packages/api-contract/openapi.yaml), [code map](../handoff/START_HERE.md)
và [READINESS](../handoff/READINESS.md) để đối chiếu implementation/evidence hiện tại.
Đường dẫn trong backtick tính từ root repository. ADR 0027/model map MongoDB thay
cơ chế persistence PostgreSQL trong báo cáo cũ; vẫn giữ invariant nghiệp vụ.
Đọc các phần liên quan nhiệm vụ và ADR/feature được dẫn, không tải cả lịch sử.

Trước mở rộng giao dịch, đọc [ADR 0007](../adr/0007-hcm-handover-auction-scope.md),
[local transaction design](../features/LOCAL_TRANSACTION_DESIGN.md) và
[acceptance](../features/LOCAL_TRANSACTION_ACCEPTANCE.md). Auction intake/bidding/close
đã có (ADR 0030); ViaPoint Order, thanh toán người thắng, real-carrier và
completed-purchase vẫn là yêu cầu/kế hoạch.

## Đấu giá và điểm mô phỏng

Bounded auctions are implemented in OpenAPI 0.24.0 (migration 0008); read ADR 0030 and
`docs/features/AUCTION_BACKEND_REPORT.md`. Intake shares the exclusive commitment with
Orders, plus one point slot and the `Reserved` projection; release only on cancel
before drop-off, drop-off expiry or Staff reclaim. Staff steps need STAFF + current
point assignment and independence; ADMIN alone cannot receive/inspect/open/reclaim.
Proxy rules live in the pure `auction-engine.ts`; keep ceilings out of public reads,
receipts, audit and outbox. Every auction command locks the auction document and
decides with server time after locks; `endAt` is final (no extension). Winner Order
creation/payment remain planned, so do not treat `AwaitingWinnerPayment` as funded.

## Commitment và unpaid Order

For commitment/checkout work, also read ADR 0013, `docs/features/COMMITMENT_DESIGN.md`,
`docs/features/COMMITMENT_ACCEPTANCE.md` and `docs/features/TRANSACTION_FOUNDATION_PLAN.md`.
These define the target architecture. Unpaid DirectDelivery Order backend is implemented
in OpenAPI 0.12.0; read ADR 0017 and `docs/features/UNPAID_ORDER_REPORT.md`.
Create/read/cancel, private pinned media and an explicit expiry worker use the shared
command executor and Order-only exclusive commitments. The DB rejects Reserved without
a real workflow. Checkout UI remains planned.

## Funding và refund trước acceptance

Order wallet funding and pre-confirmation full refunds are implemented in OpenAPI
0.15.0; read ADR 0020 and `docs/features/ORDER_PAYMENT_REPORT.md`. Payment holds the
frozen P+S once, cancellation/rejection/48h expiry records SettlementPending, then
the internal refund worker posts and releases atomically. Keep money/book held on
refund failure. This funding increment adds no dispatch/strike/settlement-to-seller; later shipment increments are described below.
Order version differs from ownership/commitment version after funding. Reconciliation
includes holds; history uses immutable posting sequence. Restart API and worker together.

## Seller acceptance và pickup review

Seller acceptance and overdue pickup review are implemented in OpenAPI 0.16.0;
read ADR 0021 and `docs/features/ORDER_PREPARATION_REPORT.md`. Only the Seller can
accept paid obligations, including LOCKED/RESTRICTED. Preparing has an immutable
48h pickup deadline; worker opens a durable PickupReview/ResolutionPending once.
That is an unresolved verification task, not proof of custody, a strike or refund.
Keep hold/commitment and never use pre-confirmation refund after acceptance.
Shipping destination is shared only with the accepted Seller. Later pickup/delivery-overdue increments are described below;
review resolution and post-acceptance cancellation remain planned.

## Shipment label

DirectDelivery outbound shipment registration/read is implemented in OpenAPI 0.18.0;
read ADR 0023 and `docs/features/DIRECT_SHIPMENT_REPORT.md`. Seller registers before
pickup deadline with 1-8 Ready packaging images, one label per Order, global unique
LatLaiSimulator/tracking. Snapshot contacts/fee from agreement; LabelCreated does not
confirm pickup, extend deadline or move money/book. Reuse OrdersService fulfillment
locks. Images are sealed at registration; no tracking edit/replacement API exists.

## Carrier pickup

Independent carrier pickup simulation is implemented in OpenAPI 0.19.0; read ADR0024
and `docs/features/CARRIER_PICKUP_REPORT.md`. ACTIVE verified TEST_OPERATOR must be
neither participant. Global eventId/key dedupe spans operators, with current auth
before replay and domain-separated signatures. First timely receipt moves InTransit;
late/conflicting events open sticky carrier review/ResolutionPending, preserving
hold/commitment/canonical pickup. Original label remains immutable; read derives
PickedUp from the Applied event. Pin the 240h delivery deadline/policy in that event.
Do not use pre-confirmation refund or restock from carrier evidence. Max128 retained
events per shipment; replay works at cap. Worker counts openCarrierReviews separately.

## Delivery overdue

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

## Packaging media

Private packaging image intents/upload/participant previews are implemented in
OpenAPI 0.17.0; read ADR 0022 and `docs/features/PACKAGING_EVIDENCE_REPORT.md`.
Only accepted Seller uploads, including LOCKED/RESTRICTED; late evidence does not
prove pickup or resolve a review. Retain originals/previews outside listing cleanup.
Both pipelines share storage budget, hourly admission and per-process upload slots.
Packaging normalizes synchronously, retries create-only keys, rechecks auth after I/O.
No original-download, Staff assignment, claim files or packaging UI yet.

## LOCKED và existing obligations

OpenAPI 0.14.0 implements LOCKED access to profile, participant unpaid Order
list/read/media/cancel and owned wallet/topup history. Read ADR 0019 and
`docs/features/LOCKED_OBLIGATIONS_REPORT.md`. Every other authenticated handler
denies LOCKED by default. Use method-only ExistingObligation plus service checks;
never treat login, roles or a client capability as permission for new transactions.
0.15.0 allows LOCKED paid cancellation/rejection; 0.16.0 adds Seller acceptance.
New payment remains denied for LOCKED.
Chat/claim-evidence/real-carrier and Admin lock/unlock workflows remain planned.

## Ví mô phỏng

Simulated wallet/topup backend is implemented in OpenAPI 0.13.0; read ADR 0018 and
`docs/features/SIMULATED_WALLET_REPORT.md`. The finite 100M VND source is journalled;
it is not the POL-42 incident fund. Only independent TEST_OPERATOR events may credit
an intent through the signed simulator adapter. Balance comes from immutable entries.
No withdrawal/adjustment handlers exist. RN/Expo web now has an opt-in internal
read-only wallet/history screen; see [C01 evidence](../handoff/C01_WALLET_2026_09_30.md).
It does not enable topup/checkout or close release gates. ReviewRequired
is sticky; daily reconciliation and resolution remain planned. Use `wallet:check`
after API build for read-only source/ledger reconciliation. Never refill by editing SQL.

## Địa chỉ, fulfillment và quote

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
Member checkout UI and ViaPoint remain planned. Native address/fulfillment has
scoped evidence in handoff; use READINESS for the remaining acceptance, not this historical feature summary.

## Client, catalog, listing và media

React Native is the first member client. Keep the shared NestJS API compatible with
Flutter and the operations web. The implemented reference slice is auth/profile;
read `docs/REACT_NATIVE_START.md` and ADR 0003 before adding a feature.
Catalog requests/review/public reads and owner listing drafts have real API handlers.
Owner media handlers, Supabase adapter, Sharp worker and RN private drafts are implemented;
live Supabase verification passed; Android debug build/UI emulator checks passed.
Native picker cancel and JPEG upload/Ready/preview/save/reopen passed on Android 15;
PNG/WebP and scoped upload failure/retry/background checks were added on MongoDB;
read `docs/handoff/READINESS.md` for evidence and remaining full native acceptance.
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
