# Operations web

Lật lại's Staff/Admin moderation workspace: real catalog/listing queues, private
images, revision history, confirmation/rejection and safe command recovery.
Staff reviews listings; Admin also confirms catalog requests. A Test Operator
role alone does not grant moderation access. The API authorizes every request.

Reviewed Available listings can be removed with a required reason and confirmation.
The same immutable intent/reconciliation flow handles lost acknowledgements.
See [listing lifecycle verification](../../docs/features/LISTING_LIFECYCLE_REPORT.md).

```bash
cp .env.example .env
pnpm dev
```

Use Node >=24.15.0 and the root pnpm version. Set `VITE_API_BASE_URL` to the API
including `/api/v1`; add the exact Vite origin to API `CORS_ORIGINS`. Default Vite
origin is `http://localhost:5173`. Run the API/worker with their documented setup.
Never put storage keys or signing secrets in VITE variables.

Tokens stay in memory. Reload requires sign-in. Decisions keep an immutable
idempotency key/body until the result is reconciled. Native DOM controls use the
shared brand assets/fonts; RN and web share transport through `@used-books/session-client`.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm bundle:check
```

`build` also checks the production manifest with
[`admin-bundle.mjs`](../../scripts/admin-bundle.mjs): all ten page modules must
remain deferred, the complete startup JavaScript graph must stay within500kB,
and no JavaScript chunk may exceed300kB (decimal bytes, before compression).
The report counts shared imports/modulepreloads once and reports CSS, gzip estimates,
total JavaScript and each page's additional assets separately. It does not measure
browser timing or Core Web Vitals. Run the checker tests from the repository root
with `node --test scripts/admin-bundle.test.mjs`.

Page modules load inside the existing authenticated workspace. A local Suspense/
error boundary keeps navigation outside the pending or failed page. Reload is an
explicit action and requires sign-in again; no automatic reload, token persistence,
service worker, command replay or permission change was added.

For the HTTP/MongoDB browser suite, start the QA replica set and set
`MONGO_TEST_URL` as described in [START_HERE](../../docs/handoff/START_HERE.md).
Run from the repository root:

```bash
pnpm infra:mongo:test:up
pnpm --filter @used-books/api build
pnpm --filter @used-books/admin-web exec playwright install chromium
pnpm --filter @used-books/admin-web test:browser
```

The suite creates its own temporary `_test` database and least-privilege users
on the QA replica set, owns servers on ports 3009/3010/5174, uses
local fake storage and real Sharp, and cleans up after itself. Set
`PLAYWRIGHT_CHANNEL=msedge` to use installed Edge instead. Details and limitations:
[verification](../../docs/features/OPERATIONS_REVIEW_REPORT.md),
[ADR 0010](../../docs/adr/0010-operations-review-client.md).

The moderation desk keeps the queue beside the selected dossier at the same
`/review/:kind/:id` routes. Queue links carry the active status; loaded rows and
numeric scroll positions are retained within the current user session. On narrow
screens, **Mở hàng chờ** exposes the queue and **Đi tới phiếu quyết định** moves
focus to the decision sheet without hiding it behind the mobile header.

- In the queue, Up/Down and Home/End move focus between loaded dossiers; Enter
  opens one. Previous/next links use the normal unsent-change guard.
- The photo viewer supports previous/next arrows, zoom from 100–300%, reset with
  `0`, and Escape to close. It identifies the submitted revision, restores focus
  and releases its scroll lock on close/unmount. A signed URL alone never makes
  an image ready for approval.
- Listing revisions can be compared by choosing two loaded submissions. Text,
  prices, condition declarations, ordered media, bundle contents and delivery
  selection are compared; historical photos load only on explicit expansion.
  Catalog requests have no historical metadata API, so the UI does not invent one.
- Switching evidence tabs preserves the decision draft. An explicit dossier
  reload starts a new check; the decision remains bound to the current revision,
  expected version and original retry intent.

Public shelf, disputes, finance, audit search, simulator/point/auction workflows
and production deployment remain future increments. Moderation does not certify
physical authenticity or deliver outbox notifications.
