# React Native first: team starting point

The first working slice is **login → current profile → refresh → logout**.
The API owns authorization; React Native owns presentation and session recovery.
Flutter and admin work can follow the same contract later.

Current listing increment: **Account → Sách của tôi** creates/opens listings,
selects/requests catalog books, uploads photos, edits condition/prices and submits
for review. Pending listings are read-only; rejected listings show the reason and
can be edited/resubmitted. Follow [Supabase Free setup](features/SUPABASE_MEDIA_SETUP.md)
and configure the media worker included by `pnpm dev:api`. Provider credentials are server-only. Read
[the media report](features/MEDIA_UPLOAD_REPORT.md) for passed live-storage and pending native checks.

The shared API also supports [listing submission/moderation](features/LISTING_REVIEW_API_REPORT.md).
The RN form and submit/rejection flow now use those operations; see
[the RN report](features/RN_LISTING_SUBMISSION_REPORT.md) for evidence and native limits.
The [public shelf](features/PUBLIC_SHELF_REPORT.md) is implemented at `/`, with
`/book?id=...` detail and separate signed photo reads. [Operations review UI](features/OPERATIONS_REVIEW_REPORT.md)
now consumes the real review APIs. Session transport is shared in `packages/session-client`.
OpenAPI 0.14.0 returns LOCKED profiles for restricted existing-obligation access.
The shared parser accepts this status, and Account shows the lock notice while
hiding address/listing navigation. Wallet/Order inbox UI is still pending; see
[the backend access report](features/LOCKED_OBLIGATIONS_REPORT.md). A 403 preserves
the session; authorization is enforced again by the API, not by hidden buttons.

## Run from a clean clone

Install the Node/pnpm versions specified in `.nvmrc` and `package.json`, and start Docker Desktop.
Check `node --version` in the terminal that runs pnpm (minimum 24.15.0); merely
installing a newer Node elsewhere does not change that terminal's PATH.
Run these commands from the repository root (PowerShell, bash and zsh):

```sh
pnpm install --frozen-lockfile
pnpm setup:local
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait mongo
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

`setup:local` generates a random signing secret and the MongoDB root/app/migrator
passwords, and never overwrites an existing env file. `db:bootstrap` creates the
least-privilege app and migrator users; the API refuses to start with pending migrations.
If you previously copied the placeholder secret, replace it with a random value of at least
32 characters in `apps/api/.env`. The API deliberately refuses placeholder secrets.

In another terminal:

```sh
pnpm dev:rn
```

This launcher supports A for the installed Android development APK and W for
Member web, selecting the public API URL by platform. Follow
[DEVELOPMENT](DEVELOPMENT.md) for one-time APK setup. `dev:api` starts both workers;
do not start duplicate media/order workers in extra terminals.

Use the member account `member@latlai.local`. The local seed password is the value
of `DEV_SEED_PASSWORD` in `apps/api/.env` (the development example is `LatLai-Local-2026!`).
The seed also creates `staff@latlai.local`, `admin@latlai.local` and
`test_operator@latlai.local`. Rerunning the seed does not reset existing credentials or roles.
The seed refuses production mode. These accounts are for local demo only.

Run `pnpm doctor:local` before starting the clients. MongoDB must match the
host/port/database in `apps/api/.env`; an isolated `_test` database passing E2E
does not prove the demo database is running. Keep test and demo configuration separate.

If port 27017 belongs to another project, set `MONGO_PORT=27018` (or another free
port) in the root `.env`, and change only the port in the `MONGODB_*` URLs in
`apps/api/.env` to match. Run Compose from the repository root with `--env-file .env`
as above. A new Docker volume starts empty; existing PostgreSQL data is moved once
with the [cutover runbook](refactor/MIG06_CUTOVER_RUNBOOK.md).

## Reach the API from your device

Edit `apps/mobile-react-native/.env`, then restart Expo:

| Device | `EXPO_PUBLIC_API_BASE_URL` |
|---|---|
| Browser on the development computer | `http://localhost:3000/api/v1` |
| Android Studio emulator | `http://10.0.2.2:3000/api/v1` |
| iOS simulator on the API computer | `http://localhost:3000/api/v1` |
| Physical phone on the same Wi-Fi | `http://<computer-LAN-IP>:3000/api/v1` |

The API listens on all interfaces for local device testing. Allow port 3000 only on
the trusted development network. Production requires HTTPS and deployment configuration.
If Docker cannot run on a developer's machine, an existing MongoDB 8 replica set
(transactions need one) also works: point the `MONGODB_*` values in `apps/api/.env`
at its development database, then run the same bootstrap/migrate/seed commands.
Keep the test database separate.
For browser preview, `pnpm --filter @used-books/mobile-react-native web`; browser
refresh signs out because web tokens are deliberately memory-only.

Swagger: `http://localhost:3000/docs`. Liveness: `/api/v1/health`.
Database readiness: `/api/v1/health/ready`.

## Verify the foundation

```sh
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @used-books/mobile-react-native export:all
```

The root build covers API/admin. The explicit export checks JavaScript bundling for
Android, iOS and web; it is not a native Android/iOS build. Complete the device
checklist below before claiming native readiness.

API E2E and the MongoDB suites use the dedicated QA replica set; follow the exact
commands in [START_HERE §5](handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app):

```sh
pnpm infra:mongo:test:up
```

bash/zsh:

```sh
export MONGO_TEST_URL='mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_probe_test?replicaSet=rs-test&authSource=admin'
pnpm test:api:mongo && pnpm test:api:e2e
```

The E2E global setup drops, bootstraps and migrates its own database
(`MONGO_E2E_DATABASE`, default `latlai_e2e_test`; the name must end in `_test`).
The QA replica set keeps data in memory and is never the development database.
CI provisions it and runs the suites automatically. Never point tests at a shared
development or production database.

## Device smoke test

Use `pnpm doctor:local` to diagnose readiness. The daily API/worker and RN bundles
use two terminals. For a
local debug APK, run `pnpm build:android --emulator` (x86_64 AVD). Read the
[Android quality guide](ANDROID_QUALITY.md) for prerequisites, Windows path handling,
the device matrix and the distinction between automated and device evidence.

- Incorrect credentials produce a readable error; valid credentials show the profile from `/auth/me`.
- Close and reopen the native app: SecureStore restores the session through refresh.
- Restart while offline: show connection recovery and retain the refresh token; retry after reconnecting.
- Logout: return to login; reopening stays signed out.
- After five login attempts in one 15-minute window, the API returns 429 (including attempts sharing an IP).

## How five people extend this

The accepted business target is [SRS1.1](SRS_V1_1.md): TP.HCM, retained direct shipping,
two simulated managed points and bounded auctions. Read [ADR0007](adr/0007-hcm-handover-auction-scope.md)
and [the new behavior rules](features/LOCAL_HANDOVER_AUCTION.md). This documentation
update alone did not add API routes or migrations. Points/auctions remain planned;
Order funding is now implemented in 0.15.0 and fulfillment extends through 0.20.0.
Checkout UI and completed purchases remain planned; see the
[current handoff status](handoff/START_HERE.md).

Take one feature per branch/PR. Before UI and API implementation diverge, agree on
the feature contract and acceptance criteria, update `openapi.yaml`, and run
`pnpm contract:generate`. Use the auth slice as the example for folder structure,
API errors, session handling and tests. Do not build a second API client or token store.

Catalog requests/review/public reads and owner listing drafts now have real APIs.
The next slice now has a [behavior specification](features/LISTING_SLICE.md),
[acceptance cases](features/LISTING_ACCEPTANCE.md) and
[implementation sequence](features/LISTING_IMPLEMENTATION_PLAN.md).
The [listing contract and schema increment](features/LISTING_DATA_CONTRACT.md) now
includes migrations and generated types. OpenAPI 0.8.0 marks 34 catalog/draft/media/review/public/lifecycle operations
implemented. Read the [lifecycle report](features/LISTING_LIFECYCLE_REPORT.md) and the
[catalog/draft API report](features/CATALOG_DRAFT_API_REPORT.md) and
[command protocol](adr/0006-catalog-draft-commands.md) before extending them.
Run `pnpm db:migrate` to apply the MongoDB migrations (validators, indexes and reference data
for every collection, including delivery origins, the address book, ISBN checks and media reservations). No catalog/listing seed is required; create and review books through the APIs.
Owner media handlers, the Sharp worker and RN private draft persistence are implemented;
live Supabase checks passed; native form/picker checks are pending. Listing
submit/moderation and operations catalog/listing review are implemented. The public
shelf, detail and separate signed image reads are implemented. Read the
[public shelf report](features/PUBLIC_SHELF_REPORT.md) and [media report](features/MEDIA_UPLOAD_REPORT.md).
The guest entry route is `/`; login/profile moved to `/account`; `/book?id=<uuid>`
shows eligible public content. `/drafts`, `/ui` and `/design` retain their purposes.
In Sách của tôi, Approved supports explicit edit/resubmit and hide/reopen;
Available nonremoved listings support soft archive. RESTRICTED members can hide
and archive, but cannot reopen or submit replacements. The approved replacement
is only local until submitted; it is not a durable server draft.
Agree on the data model and reservation invariants before checkout or wallet work.
That next design is specified in [ADR 0013](adr/0013-exclusive-commitment-foundation.md)
and the [transaction foundation plan](features/TRANSACTION_FOUNDATION_PLAN.md).
Address/service-area and fulfillment support precede the first unpaid DirectDelivery
Order slice; payment, Exchange, ViaPoint and auction follow their own gates.
Address maintenance now runs at `/addresses`, reached from Account. OpenAPI0.9.0
adds six address/directory operations; apply migration `20260927000000_member_address_book`.
See [address evidence and demo limitations](features/ADDRESS_BOOK_REPORT.md).
OpenAPI0.10.0 adds revision-bound DirectDelivery origins to listing forms and safe
public summaries; apply `20260927010000_listing_fulfillment`. Address versions are
content-specific; changing or deleting a chosen address requires an explicit update
to the listing. Read [fulfillment evidence](features/LISTING_FULFILLMENT_REPORT.md).
Quotes and unpaid/funded DirectDelivery Orders now have backend APIs (through
OpenAPI 0.20.0); their member checkout UI and ViaPoint remain planned. Use the
[handoff scope matrix](handoff/START_HERE.md) for the current implementation boundary.
DEMO-A/B are not official locality records.
Read the [listing acceptance audit](features/LISTING_ACCEPTANCE_REPORT.md) for
current automated evidence and the remaining native gates. Browser verification
includes the web file chooser and real image processing, not the native picker.
Registration, verification emails and password reset are not implemented by this increment.
See [ADR 0003](adr/0003-react-native-auth-foundation.md) for current policies and limits.
