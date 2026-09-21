# Lật lại — Used-Book Marketplace

**Sách cũ. Chương mới.**

![Lật lại brand](packages/brand/applications/github-banner.png)

One API-first platform shared by the graduation project and two mobile-development courses. Members use the Flutter or React Native application. Staff, administrators, and authorized test operators use the web operations console.

## Project documents and brand

- [Documentation index](docs/README.md)
- [Detailed SRS](docs/deliverables/SRS_Nen_tang_sach_cu.md)
- [Business comparison report](docs/deliverables/Bao_cao_so_sanh_nghiep_vu.md)
- [Use cases and traceability](docs/deliverables/Use_Case_Diagrams/Ma_tran_truy_vet.md)
- [Review 1 presentation](docs/deliverables/Review_1_Solution.pptx)
- [Brand assets and integration notes](packages/brand/README.md)
- [Brand guidelines PDF](packages/brand/guidelines/Lat_Lai_Brand_Guidelines.pdf)

Current implementation is a tested project scaffold. The documents describe the target product; purchasing, exchange, wallet, and moderation workflows are not implemented yet.

## Architecture

```text
Flutter app ──────────────┐
React Native app ─────────┼── NestJS REST API ── PostgreSQL
Staff/Admin web ──────────┘          │
                                     ├── Redis + BullMQ
                                     ├── MinIO object storage
                                     └── Mailpit development email
```

The backend is the authority for permissions, state transitions, reservations, wallet holds, settlement, disputes, and audit records. Client-side validation improves usability but never replaces server checks.

## Applications

| Path | Purpose | Main technology |
|---|---|---|
| `apps/api` | Shared business API and workers | NestJS, TypeScript, Prisma, PostgreSQL |
| `apps/admin-web` | Staff/Admin/Test Operator console | React, Vite, Ant Design |
| `apps/mobile-flutter` | Flutter course and member app | Flutter, Riverpod, Dio, GoRouter |
| `apps/mobile-react-native` | React Native course and member app | Expo, Expo Router, TanStack Query |
| `packages/api-contract` | API source of truth | OpenAPI 3.1 |
| `infra` | Local dependencies | Docker Compose |

## Prerequisites

- Node.js 24.15 or newer
- pnpm 11
- Flutter stable with Dart 3.13 or newer
- Docker Desktop with Docker Compose

## First run

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/admin-web/.env.example apps/admin-web/.env
cp apps/mobile-react-native/.env.example apps/mobile-react-native/.env
pnpm install
pnpm infra:up
pnpm dev:api
```

In separate terminals:

```bash
pnpm dev:admin
pnpm dev:rn
cd apps/mobile-flutter && flutter pub get && flutter run
```

Local services:

| Service | URL |
|---|---|
| API | `http://localhost:3000/api/v1` |
| Swagger | `http://localhost:3000/docs` |
| Admin web | `http://localhost:5173` |
| Mailpit | `http://localhost:8025` |
| MinIO console | `http://localhost:9001` |

## Team workflow

Use a protected `main` branch and short-lived branches named `feat/<issue>-<topic>`, `fix/<issue>-<topic>`, or `docs/<topic>`. Every merge goes through a pull request with at least one reviewer. See [Team workflow](docs/TEAMWORK.md) and [Contributing](CONTRIBUTING.md).

## Delivery order

1. API contract, data model, authentication, catalog, and listings.
2. One complete purchase path across the API and both mobile clients.
3. Exchange funding, delivery simulation, wallet, and settlement.
4. Disputes, returns, reviews, moderation, and administration.
5. Chat, forum, notification, reconciliation, and audit reporting.

The detailed SRS, use cases, state machines, ERD, API contract, and test evidence belong under `docs/` and must remain synchronized with implementation changes.
