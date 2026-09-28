# ADR 0010: Operations review client and shared session transport

Date: 2026-09-27. Status: implemented.

Follow-up: public shelf/media now implemented under [ADR 0011](0011-public-shelf.md).
The remaining-work list below describes the original operations increment.

## Decision

Replace the operations scaffold with the Staff/Admin listing review and Admin
catalog review flows. Consume the implemented OpenAPI 0.6.0 endpoints; no contract,
database schema or authorization policy change is needed.

Extract the existing framework-independent RN `SessionClient` and its runtime
auth schemas into `packages/session-client`. RN retains compatibility exports and
its SecureStore adapter. Operations has one client with memory-only tokens, one
TanStack Query cache, and clears that cache on identity change. Refresh coalescing,
generation checks for late responses, bounded requests and revoke-before-logout
are shared; the 11 transport tests now live with the package. A browser reload
requires sign-in. Production persistent web sessions/cookie BFF are not added.

Operations rereads `/auth/me` on focus and every 30 seconds. A profile error blocks
interaction without discarding unsent review input; loss of review eligibility
removes the workspace. Current authorization always remains server-enforced.
STAFF can review listings; ADMIN can additionally review catalog requests.
TEST_OPERATOR alone has no moderation access. Self-review has no decision form.

Keep domain views under `features/review`; `core` owns session, error presentation,
formatting, reusable DOM controls and the leave guard. Use the existing brand logo,
palette and locally hosted Lora/Be Vietnam Pro fonts. Do not import RN view primitives
into the DOM client or imply authenticity from human moderation.

## Decisions and recovery

Each decision captures an immutable body, expectedVersion, revisionId and UUID
idempotency key. Explicit retry after an ambiguous failure reuses that intent.
After a receipt, retry performs GET only. Definitive 400/403/404/409/422 responses
stop writes; the reviewer must read current state before starting another review.
No automatic mutation retry or silent version advancement is permitted.

Detail does not poll or refetch on focus/reconnect while a human is reviewing it.
Queue refreshes every 30 seconds. An explicit detail reload resets the checklist
and reason after confirmation, and is disabled while a command awaits reconciliation.
Navigation, closing the tab and logout protect unsent input. These guards are
best effort; reload/crash still loses in-memory intent. A subsequent session must
GET current state before making a new decision.

Approval requires all six checks, a Confirmed catalog with loaded metadata, and
every current image successfully loaded. Rejection requires a trimmed 10–1000
Unicode-code-point reason. Signed-image reads refresh every 90 seconds against
the API's 120-second lifetime. Historical images are fetched only when explicitly
opened; signed URLs are not persisted. Existing issued URLs remain usable until
expiry as documented in ADR 0009.

## Evidence and limits

See [operations verification](../features/OPERATIONS_REVIEW_REPORT.md). The browser
suite creates an isolated schema in a dedicated `_test` database, applies the real
migrations, runs Nest HTTP and Sharp, and tears down its schema. Storage is an
explicit in-memory fake; it is not a live Supabase verification. CI runs this suite
with Chromium; the local run used installed Edge. Hosted CI results remain pending
until this work is pushed.

Public shelf/media, approved edits/visibility/removal, notifications, transactions,
point inspection and auctions remain separate work. RN form/picker native checks
remain pending; JS exports are not Android/iOS device evidence.

Handoff addendum (2026-09-28): operations now labels sale and exchange values
separately in the queue. The skip link focuses main; failed decisions focus their
recovery action after the dialog closes. Existing command/replay and permission
semantics are unchanged. See [operations UI QA](../handoff/OPERATIONS_UI_QA.md)
for keyboard, responsive and error-state evidence and the remaining limits.
