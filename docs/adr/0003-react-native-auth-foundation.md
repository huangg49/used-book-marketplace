# ADR 0003: React Native first and shared authentication foundation

**Status:** Accepted for this implementation increment

## Scope

React Native is the first member client. Flutter and the operations web remain in
the repository, sharing the API contract, but are not prerequisites for this increment.
The first complete slice is sign-in, current profile, token rotation and sign-out.
Registration, email verification, password reset and transaction workflows remain future work.

## Boundaries and contracts

- Keep feature endpoints, DTOs, services and tests together in `api/src/modules/<feature>`.
- Database access is explicit through `DatabaseModule`; cross-feature mutations go through services.
- `packages/api-contract/openapi.yaml` is the reviewed source for Swagger and generated TypeScript types.
- Update the YAML, run `pnpm contract:generate`, then implement and test both sides.
- E2E tests validate real response schemas against the contract. CI rejects stale generated types.
- React Native routes compose screens; `features` owns UI and queries; `core` owns transport, session and secure storage.
- TanStack Query owns fetched data; session state has one owner in `SessionClient`.

## Session decisions

- Access JWTs expire after 15 minutes. Only an opaque random refresh token is persisted on native devices, using SecureStore.
- The database stores SHA-256 hashes of refresh tokens, never the tokens themselves.
- Refresh tokens rotate using a database compare-and-swap. Exactly one concurrent reuse succeeds.
- Sessions expire absolutely after 30 days. Logout revokes the session immediately, including its outstanding access JWTs.
- Every authenticated request reads current account status and roles from PostgreSQL.
- Authentication is required globally. Public routes must explicitly use `@Public()`;
  `@Roles(...)` adds role restrictions through the second global guard.
- Login requires a verified ACTIVE, RESTRICTED or LOCKED account. LOCKED access is
  denied by default except specific existing-obligation handlers in [ADR 0019](0019-locked-existing-obligations.md).
  Feature services additionally enforce transaction eligibility, current roles and ownership.
- Login rechecks account/password under a user lock after password verification;
  refresh locks user then session and rechecks current status/roles/expiry before CAS.
  LOCKED is returned explicitly; 403 does not invalidate the session.
- The client coalesces refresh requests and retries a protected request at most once.
- Offline startup preserves the stored token and offers retry. A rejected refresh clears the local session.
- Logout waits for an in-flight refresh and reports network failures so the user can retry revocation.
- Web is a preview surface using memory-only tokens; a browser reload signs out. Native behavior must also be smoke-tested on a device.

## Login abuse limits

The initial limiter counts **all attempts**, including successful ones, with a cap of
5 per account and per IP per fixed 15-minute window. Counters are atomic PostgreSQL
records shared by API processes. Expired counters are removed on login.
This is deliberately stricter than SRS POL-26's failed-attempt counter and remains
an initial policy to revisit before wider usage (notably shared campus IPs).
The API does not trust forwarded IP headers; configure and test a known reverse proxy
before putting this behind one. No global IP-trust switch is enabled by default.

## Limits and next steps

Local verification now includes a read-only `doctor:local` and a reproducible
`build:android` debug workflow. Windows builds redirect CMake staging away from
deep pnpm paths through a Gradle init script and require Ninja >=1.12. The script
regenerates the ignored native project using Expo prebuild; build configuration
stays in tracked scripts without patching dependency sources. See [Android quality](../ANDROID_QUALITY.md) for evidence
and remaining native checks; a generated APK alone is not a device smoke test.

No claim is made that all SRS authentication requirements are complete. Remaining work:
registration/verification, password reset, session listing and revoke-all, audit events,
expiry cleanup, native device smoke testing, and deployment configuration.
Keep transaction money/reservation logic out of the client.

Follow-up 2026-09-27: transport/auth schemas and 11 lifecycle tests now live in
`packages/session-client`, consumed by RN and operations. Storage remains owned
by each client; RN SecureStore behavior is unchanged. See ADR 0010.

Follow-up 2026-09-28 (F2h handoff audit): the session owner now ignores obsolete
storage failures when a newer login owns the session, skips obsolete queued writes,
and rejects login while sign-out is revoking the current session. Issued obsolete
tokens are still revoked. Transport normalizes every `HeadersInit` representation
case-insensitively and owns the bearer header, preserving upload content type and
idempotency headers through a refresh. Five regression cases failed before the fix
and pass afterward; the shared suite now has 20 tests. This is client hardening,
not a change to API 0.20.0 or server session lifetime.
