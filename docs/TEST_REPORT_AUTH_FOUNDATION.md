# Authentication foundation verification — 2026-09-24

Scope: the React Native login/profile/refresh/logout reference slice and the shared API foundation.

## Automated results

| Check | Result |
|---|---|
| Frozen lockfile install (offline cache) | Passed |
| `pnpm contract:check` | Passed: YAML parsed and committed generated types match |
| `pnpm lint` | Passed for API, admin and React Native |
| `pnpm typecheck` | Passed for API, admin and React Native |
| `pnpm test` | Passed: 2 API unit tests + 10 React Native session tests |
| `pnpm test:api:e2e` | Passed: 9 tests against a dedicated PostgreSQL database |
| Prisma migration on empty databases | Passed for separate test and demo databases |
| Development seed | Passed: member/staff/admin/test-operator accounts created |
| `pnpm build` | Passed for API and admin |
| React Native `export:all` | Passed: Android/iOS Hermes bundles and web export |
| `git diff --check` | Passed |

The auth E2E suite exercises contract response validation, database readiness,
email normalization, hash-only refresh-token storage, default endpoint protection,
current role enforcement, account locking, session expiry, JWT expiry/audience checks,
immediate logout revocation, invalid bodies, eight concurrent refresh attempts with
one winner, and concurrent login rate limiting.

Client tests cover secure-storage failure, single refresh across concurrent 401s,
offline recovery, invalid-session clearing, logout during refresh, failed logout retry,
response-body timeout, late responses after logout, and the browser `fetch` receiver regression.

## UI verification

Verified the Expo web preview against the running API and seeded demo database:

- Empty form shows validation feedback.
- Wrong password shows the API authentication error.
- Correct login displays the real member name, email and role from `/auth/me`.
- Logout returns to login; reload remains signed out.
- Login and profile layouts inspected at a 390 × 844 viewport; no horizontal overflow.
- Browser console inspection after login/logout found no warning/error entries at that point.

The first browser smoke test exposed an illegal `fetch` receiver caused by invoking
a stored browser function as an object method. The default transport now calls
`fetch` through a wrapper, and a regression test covers this behavior.

## Environment and limits

Local checks used Windows, Node 24.12.0 and pnpm 11.25.0. The repository/CI specifies
Node 24.15.0 and pnpm 11.19.0; those exact runtime versions were not exercised locally.
Docker Desktop was unavailable during database setup, so the database checks used
an isolated PostgreSQL 17 process on loopback port 55432, with distinct demo and test
databases. The temporary binary/data files are ignored under `.tmp/`, not project dependencies.

No Android device/emulator was attached during the check. JavaScript/Hermes bundling
does **not** establish a native Gradle/Xcode build or real-device SecureStore behavior.
Follow the device smoke checklist in [the team guide](REACT_NATIVE_START.md).
GitHub CI workflows were updated but were not dispatched or claimed to have passed remotely.
Admin build retains its existing bundle-size warning; its code was not changed in this slice.

Registration, email verification, password reset, full audit workflows and business
transactions are outside this implemented slice. See ADR 0003 for current login-limit
policy and other deliberate boundaries.
