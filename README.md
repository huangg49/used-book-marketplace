# Lật lại — Used-Book Marketplace

**Sách cũ. Chương mới.**

**Tiếp nhận project:** đọc [Bắt đầu ở đây — F2h](docs/handoff/START_HERE.md).
Tiếp tục bằng Claude/agent khác: [điểm lưu](docs/handoff/SESSION_STATE.md),
[kế hoạch triển khai](docs/handoff/CONTINUATION_PLAN.md),
[prompt và cách clone](docs/handoff/NEXT_SESSION_PROMPT.md).
Đang củng cố mốc **OpenAPI 0.20.0**, rà soát chất lượng và hoàn thiện giao diện hiện có
trước khi mở nghiệp vụ mới. [Tiến độ bàn giao](docs/handoff/READINESS.md) phân biệt
phần đã kiểm chứng, phần đang làm và điều kiện tạo commit/tag cuối cùng.

![Lật lại brand](packages/brand/applications/github-banner.png)

One API-first platform shared by the graduation project and two mobile-development courses. Members use the Flutter or React Native application. Staff, administrators, and authorized test operators use the web operations console.

## Project documents and brand

- [Documentation index](docs/README.md)
- [Current SRS 1.1 — TP.HCM, shipping, managed points and auctions](docs/SRS_V1_1.md)
- [SRS 1.1 offline reader](docs/SRS_V1_1.html)
- [Business comparison report](docs/deliverables/Bao_cao_so_sanh_nghiep_vu.md)
- [Current use cases, traceability and demo scenarios](docs/features/LOCAL_TRANSACTION_ACCEPTANCE.md)
- [Historical v1.0 diagrams and traceability](docs/deliverables/Use_Case_Diagrams/Ma_tran_truy_vet.md)
- [Review 1 presentation](docs/deliverables/Review_1_Solution.pptx)
- [Brand assets and integration notes](packages/brand/README.md)
- [React Native UI rules and reusable components](docs/design/UI_COMPONENTS.md)
- [Brand guidelines PDF](packages/brand/guidelines/Lat_Lai_Brand_Guidelines.pdf)

Current implementation includes React Native auth/profile/listing submission and real
catalog/draft/media and listing submission/moderation APIs backed by MongoDB
([ADR 0027](docs/adr/0027-mongodb-persistence-protocol.md); migrated from PostgreSQL, see
[MongoDB plan](docs/refactor/MONGODB_PLAN.md)),
with a Supabase Storage adapter and Sharp worker. Live Supabase and Android debug/UI
emulator checks passed; native picker/upload still needs verification. See the
[media report](docs/features/MEDIA_UPLOAD_REPORT.md) and [review API report](docs/features/LISTING_REVIEW_API_REPORT.md).
Start with [the team guide](docs/REACT_NATIVE_START.md).
SRS 1.1 adds TP.HCM, two simulated managed points and bounded auctions to the target
scope; direct shipping remains. Completed purchases, exchange, points and auctions
remain planned; Order reservations/funding/refunds and simulated topups are implemented below.
The [public shelf](docs/features/PUBLIC_SHELF_REPORT.md) now has real anonymous
API reads and RN search/filter/detail screens. `/` opens the shelf; `/account`
opens login/profile. [Listing lifecycle](docs/features/LISTING_LIFECYCLE_REPORT.md)
supports approved replacement, hide/reopen, archive and independent staff removal.
Catalog and listing review are implemented in the shared API and the
[operations web](docs/features/OPERATIONS_REVIEW_REPORT.md), with real queues, private
images, decisions, conflict/retry handling and a reproducible browser suite.
The [RN listing form](docs/features/RN_LISTING_SUBMISSION_REPORT.md) supports catalog,
photos, condition, prices, submit and rejection/resubmission; native workflow QA remains pending.
The [DirectDelivery quote API](docs/features/DIRECT_SALE_QUOTE_REPORT.md) now computes
private, versioned estimates from listing origins and member addresses. OpenAPI
0.11.0 includes create/read quote handlers; quotes do not reserve books or move money.
OpenAPI 0.12.0 adds [unpaid Orders and exclusive reservations](docs/features/UNPAID_ORDER_REPORT.md):
create/read/cancel, private pinned images and a separate expiry worker. Funding and
seller acceptance are added in 0.15.0/0.16.0 below; checkout UI remains planned.
Shipment registration and pickup are implemented in 0.18.0/0.19.0 below.
OpenAPI 0.13.0 adds [simulated wallet and topups](docs/features/SIMULATED_WALLET_REPORT.md):
immutable balanced journals, finite demo funding, private history and independent
TEST_OPERATOR events. Wallet UI and withdrawal remain planned.
OpenAPI 0.14.0 adds [locked account access to existing obligations](docs/features/LOCKED_OBLIGATIONS_REPORT.md):
profile, private wallet/history, participant Order list/details/media and unpaid
buyer cancellation. Other authenticated operations reject locked accounts by default.
OpenAPI 0.15.0 adds [Order payment and pre-confirmation refunds](docs/features/ORDER_PAYMENT_REPORT.md):
atomic P+S hold, buyer cancellation/seller rejection, 48-hour expiry and durable full
refund worker. Locked participants may request a refund, but cannot pay. Seller
acceptance is added in 0.16.0 below; disputes, settlement to seller and purchase UI remain planned.
OpenAPI 0.16.0 adds [seller acceptance and pickup verification deadlines](docs/features/ORDER_PREPARATION_REPORT.md):
Preparing, frozen 48-hour deadline, destination shared with the accepted Seller, and
an overdue task that preserves money/book holds. This task has no resolution handler yet;
OpenAPI 0.17.0 adds [private packaging evidence](docs/features/PACKAGING_EVIDENCE_REPORT.md):
accepted Seller image uploads, immutable originals, normalized participant previews,
audited access and shared storage limits. OpenAPI 0.18.0 adds
[DirectDelivery shipment registration](docs/features/DIRECT_SHIPMENT_REPORT.md):
one simulated label per Order, globally unique tracking, pinned Ready packaging photos
and frozen contacts/fee. Neither labels nor packaging photos prove pickup. OpenAPI
0.19.0 adds [independent simulated carrier pickup](docs/features/CARRIER_PICKUP_REPORT.md):
timely events move InTransit, late/conflicting reports open review, global replay
prevents double processing. Money and stock remain held. Delivery, review resolution,
settlement and shipment UI remain planned. OpenAPI0.20.0 adds
[delivery-overdue review and Buyer non-receipt intake](docs/features/DELIVERY_OVERDUE_REPORT.md):
worker and Buyer share one durable overdue record, retain money/book holds and preserve
the delivery deadline pinned at pickup. Delivered, inspection and dispute resolution remain planned.

## Architecture

```text
Flutter app ──────────────┐
React Native app ─────────┼── NestJS REST API ── MongoDB 8 (replica set)
Staff/Admin web ──────────┘          │
                                     ├── MongoDB-backed media / Order workers
                                     ├── Supabase Storage (private images, Free)
                                     └── Mailpit development email
```

The backend is the authority for permissions, state transitions, reservations, wallet holds, settlement, disputes, and audit records. Client-side validation improves usability but never replaces server checks.

Redis/BullMQ are available infrastructure/dependencies, not the execution engine of
the implemented media and Order workers. Settlement/dispute decisions remain target
responsibilities; their completion APIs are not implemented at F2h.

## Applications

| Path | Purpose | Main technology |
|---|---|---|
| `apps/api` | Shared business API and workers | NestJS, TypeScript, MongoDB Node driver |
| `apps/admin-web` | Staff/Admin/Test Operator console | React, Vite, Ant Design |
| `apps/mobile-flutter` | Flutter course and member app | Flutter, Riverpod, Dio, GoRouter |
| `apps/mobile-react-native` | React Native course and member app | Expo, Expo Router, TanStack Query |
| `packages/api-contract` | API source of truth | OpenAPI 3.1 |
| `infra` | Local dependencies | Docker Compose |

## Prerequisites

- Node.js 24.15 or newer
- pnpm 11
- Flutter stable with Dart 3.13 or newer (only when working in the Flutter lane)
- Docker Desktop with Docker Compose

## First run

```bash
pnpm install
pnpm setup:local
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait mongo
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

In separate terminals:

```bash
pnpm dev:admin
pnpm dev:rn
pnpm dev:media
pnpm dev:orders
cd apps/mobile-flutter && flutter pub get && flutter run
```

Local services:

`db:bootstrap` creates the least-privilege app and migrator users (idempotent);
`db:migrate` applies the MongoDB migrations; the API refuses to start while any are
pending. Existing PostgreSQL data is moved once with the
[cutover runbook](docs/refactor/MIG06_CUTOVER_RUNBOOK.md); PostgreSQL stays only as
the legacy import source (`legacy-postgres` compose profile).

Apply migrations and rebuild/restart both API and Order worker for payment changes.
The worker processes expiry and refund every minute; the API alone does not run it.
Use `pnpm --filter @used-books/api wallet:check` after API build for read-only reconciliation.

| Service | URL |
|---|---|
| API | `http://localhost:3000/api/v1` |
| Swagger | `http://localhost:3000/docs` |
| Admin web | `http://localhost:5173` |
| Mailpit | `http://localhost:8025` |
| Media storage | Supabase Free; [setup](docs/features/SUPABASE_MEDIA_SETUP.md) |

## Team workflow

Use a protected `main` branch and short-lived branches named `feat/<issue>-<topic>`, `fix/<issue>-<topic>`, or `docs/<topic>`. Every merge goes through a pull request with at least one reviewer. See [Team workflow](docs/TEAMWORK.md) and [Contributing](CONTRIBUTING.md).

## Delivery order

Current priority is the [F2h handoff preparation](docs/handoff/READINESS.md), with
React Native first. After its gates close, resume the
[transaction foundation plan](docs/features/TRANSACTION_FOUNDATION_PLAN.md):
finish F2 DirectDelivery receipt/inspection/claims/settlement/client, then F3 Exchange,
F4 ViaPoint and F5 auctions. Do not infer that checkout is complete from funded Orders.

The detailed SRS, use cases, state machines, ERD, API contract, and test evidence belong under `docs/` and must remain synchronized with implementation changes.
