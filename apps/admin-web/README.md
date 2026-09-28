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
```

For the HTTP/PostgreSQL browser suite, set a dedicated `TEST_DATABASE_URL` ending
in `_test`, then run from the repository root:

```bash
pnpm --filter @used-books/api build
pnpm --filter @used-books/admin-web exec playwright install chromium
pnpm --filter @used-books/admin-web test:browser
```

The suite owns temporary schema/server resources on ports 3009/3010/5174, uses
local fake storage and real Sharp, and cleans up after itself. Set
`PLAYWRIGHT_CHANNEL=msedge` to use installed Edge instead. Details and limitations:
[verification](../../docs/features/OPERATIONS_REVIEW_REPORT.md),
[ADR 0010](../../docs/adr/0010-operations-review-client.md).

Public shelf, disputes, finance, audit search, simulator/point/auction workflows
and production deployment remain future increments. Moderation does not certify
physical authenticity or deliver outbox notifications.
