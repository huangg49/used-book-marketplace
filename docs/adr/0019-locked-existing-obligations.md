# ADR 0019: Explicit existing-obligation access for locked accounts

2026-09-28 · OpenAPI 0.14.0 · F2b backend. Implements the access prerequisite in
SRS §4/FR-A07 and the implemented portion of CM-AC16. Read
[verification and limits](../features/LOCKED_OBLIGATIONS_REPORT.md). No paid Order,
shipment, dispute/evidence or account-administration workflow is introduced here.
Follow-up [ADR 0020](0020-order-wallet-payment.md): LOCKED may request paid cancellation
or rejection as the matching participant; payment remains denied by default. The
method allowlist and command-level authorization explicitly cover these two additions.
[ADR 0021](0021-order-preparation.md) adds acceptance by the LOCKED Seller of an
existing paid Order. It does not grant general transaction or operations permissions.

## Authentication is separate from permission to perform an action

Verified ACTIVE, RESTRICTED and LOCKED users may authenticate and rotate sessions.
CurrentUser now returns LOCKED explicitly; it must never serialize a locked user
as ACTIVE. Unverified/PENDING_VERIFICATION/DISABLED accounts cannot authenticate.
JWTs identify user/session only. Current status and roles come from PostgreSQL on
every protected request; forged role/status/capability claims cannot grant access.

No new token type, token store, database field or client-selected scope is needed.
A locked user's existing session remains usable within the same restricted scope.
If a session was separately revoked, locking does not undo revocation; fresh login
with valid credentials is necessary. Unlocking restores ordinary feature checks
without requiring a new session; disabling rejects all protected access. This is
account restriction, not a substitute for password/session compromise handling.

## Default-deny allowlist

AuthGuard denies LOCKED with 403 AccountIneligible on every authenticated route
unless that exact handler opts in using `@ExistingObligation()`. It reads handler
metadata only, not controller-wide grants. `@Roles` and service ownership checks
still apply. Public discovery is unchanged. All-role locked accounts cannot review,
moderate, issue simulator events, create listings/quotes/Orders/topups or use the
address book. 403 is intentional: the session is still valid for obligations.

The only supported opt-ins are:

- GET /auth/me: current profile, including a locked non-Member account.
- GET /me/orders and /me/orders/{orderId}: MEMBER participant history/details.
- GET /me/orders/{orderId}/media/{mediaId}/read: pinned participant media, including
  a second authorization check after external storage signing.
- POST /orders/{orderId}/cancel: MEMBER buyer only, AwaitingPayment before the
  original deadline. This closes a pre-existing unpaid obligation without money.
- GET /me/wallet, /me/wallet/history, /me/topups, /me/topups/{topupId}: MEMBER-owned
  wallet/history only. topupEnabled=false for LOCKED; no new funding intent.

Missing MEMBER role still means 403; operations roles are not substitutes. Foreign
private records/cursors return 404. Locking does not change ownership, contacts,
snapshots, commitment/deadline or ledger balances. The existing public predicate
still hides listings whose owners are not ACTIVE; this increment does not loosen it.

GET /me/orders is a new bounded descending createdAt/ID keyset list with optional
state filter. It exposes only Order ID, state/version, participant role and dates;
no counterparty contact or guessed payment capability. It lets a client recover
existing Orders after reinstall/login without knowing IDs retained in local memory.
Checkout and Order inbox UI remain separate work.

## Service and session race protection

HTTP metadata is not sufficient authority. CommandService.actor remains Standard
by default and rejects LOCKED after taking user/session locks. Only the internal
`readObligation` path and the hardcoded cancelUnpaidOrder operation allow LOCKED.
No request body/header/JWT can select these paths. Each feature still validates
role, ownership and state; readObligation rechecks session expiry with DB time
before returning. New-action replay is denied while locked before reading its old
receipt. Authorized cancellation replay returns its immutable receipt as before.

Login verifies the password first, then locks the user and rechecks status,
verification, password hash and roles before creating a session. No Argon2 work
runs while the user lock is held. Refresh locks user then session, rechecks current
account/roles, samples clock_timestamp after waits and performs token-hash CAS.
Exactly one concurrent refresh succeeds; revoke/expiry that wins first prevents
rotation. Existing expiration and absolute session lifetime remain unchanged.

The lock protocol makes the decision occur at the serialized operation. A command
that commits before a later lock decision was valid at its decision point. A lock
that wins before a new command prevents mutation/replay. DISABLED/revoked/no-role
outcomes still fail even on an obligation endpoint. Provider callbacks remain
independent of a recipient's session and never reopen an expired Order.

## Clients and gates

Shared session parsing accepts LOCKED. A forbidden new action does not discard the
refresh token or trigger a refresh loop. Operations UI already gates review on
ACTIVE; tests include LOCKED with review roles. RN account shows a locked notice
and hides address/listing navigation; server enforcement is still authoritative.
No native build/visual approval or complete locked-workflow UX is claimed.

Future shipment, chat, evidence, return and payment handlers must opt in only after
their obligation/state/object authorization is designed and tested. This ADR does
not grant arbitrary new endpoints. Admin lock/unlock APIs with reason/audit are
still planned; tests change status only in dedicated `_test` fixtures. F2 remains
incomplete until funding/hold/fulfillment/dispute and native client gates pass.
