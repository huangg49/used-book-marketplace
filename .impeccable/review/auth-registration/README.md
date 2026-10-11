# Account Auth verification — 11/10/2026

Branch `codex/auth-registration-recovery`, base `a300397`; checkpoint subject
`feat(auth): implement registration and password recovery`. API + Mongo + Vite
Member web; related Chat/Notifications/MainLayout WIP preserved and excluded.
[Feature/setup](../../../docs/features/ACCOUNT_AUTH.md).

## Executed checks

- Contract generate/check PASS; route coverage119 operations /22 controllers.
- API typecheck/lint/build PASS; unit124 tests /19 files PASS.
- Auth E2E32 tests /2 files PASS, isolated QA replica set57017 and
  `latlai_account_recovery_test`. Registration validation/role injection,
  duplicate/race/email normalization, verification/cooldown/token supersession,
  wrong purpose/expiry/replay, API clock skew vs database expiry, reset vs
  reset/login/refresh, all-session revocation,
  disabled/locked states, mail enqueue rollback, retry/lease/exhausted final lease,
  stale-mail cancellation and append-only audit covered. Deliberate enqueue failures
  produce expected500 logs with synthetic stack/request IDs, not test failures.
- Mongo suite39 PASS /4 SKIP; import/failover prerequisites absent, not claimed.
  Validator/index/current collection coverage includes migration0017; historical
  PostgreSQL model count explicitly excludes the three new Mongo-native collections.
- Shared session-client21 tests /2 files PASS; public POST/204 never enters the
  authenticated refresh/replay path. Web62 tests /9 files PASS.
- Web typecheck/build PASS; lint0 errors /5 existing Exchange warnings. Existing
  bundle warning above500KB remains; no added library.
- Impeccable detector once,3 modified UI targets: exit0 /0 findings. Source and
  CUA inspection by implementer; no independent or human review claimed.

## Browser

CUA in-app browser against actual localhost5186 and API3000. Corrected ignored
local CORS config and restarted owned API. Unknown synthetic email request reaches
202, shows the generic acknowledgement and disables resend for60 seconds. It
does not create an account or mail. Invalid dummy verification fragment reaches
400, readable alert and resend form. Reload keeps the fragment and verification
screen. Reset-link form exposes two new-password inputs, minLength10/autocomplete.

Laptop1536×700 Register: document700px, no horizontal overflow; prior1366×768
check passed. Mobile390×844 and320×740: no horizontal overflow, natural scrolling
on tall Register. Required-empty submit focuses name; paper route changes lock
both sheets and focus the destination heading. Actual OS reduction=true still
runs850ms shuffle. Runtime real credential entry/change through browser NOT RUN;
full credential flows are covered by the Nest/Mongo E2E suite instead.

Captures (synthetic/blank inputs, no private links):

- [Register laptop](register-laptop.png)
- [Register mobile](register-mobile.png)
- [Recovery acknowledgement](forgot-feedback.png)
- [Verification error mobile](verify-error-mobile.png)
- [Reset form mobile](reset-mobile.png)

Mailbox server3186 responds200; Host rebinding, cross-origin and POST blocked;
invalid file path404. Mail service writes real UTF-8 HTML in a temporary isolated
unit-test directory; token encrypted at rest, corruption/wrong key rejected. Main
DB receives only forward migration0017 and role bootstrap with existing private
configuration, no reset/seed/password overwrite. New user-generated local mail
is private ignored data and is not an evidence artifact.

## Remaining limits / handoff

Resend/domain/real Internet inbox, complete cross-client E2E, RN/Flutter UI,
NVDA/physical mobile/200% zoom/human sign-off NOT RUN; Mongo import/failover SKIP.
API security source review by owner before integration remains required. No
push/PR/deploy, READINESS unchanged. Local web/API/mailbox remain available.
Demo: register → mailbox3186 → verify → login; forgot → mailbox → reset → login.
