# Auth OTP / Brevo — scoped verification

2026-10-11 · codex/auth-brevo-otp · base79f006d.
Checkpoint subject: feat(auth): add email OTP verification and Brevo delivery.
OpenAPI0.33.0, migration0018; source on this branch, not merged/deployed.

## Executed checks

- API unit127 tests /19files PASS; typecheck/lint/build PASS.
- Account/session/OTP E2E51 tests /3files PASS, QA replica set57017 and
  latlai_otp_final_test only; main DB never reset or seeded. Includes generic
  decoys/cooldown, leading zeros, malformed/expired/purpose/replay rejection,
  fifth wrong attempt under race, successful consumption race, reset versus
  refresh/login, legacy/OTP invalidation, stale queue cancellation, DB clock
  skew, locked/disabled status and durable queue rollback.
- Mongo39PASS/4SKIP (import/failover not run); new validator/index/schema covered.
- Member web65 tests /9files PASS; typecheck/build PASS. Lint0error, five existing
  Exchange warnings; Vite large-chunk warning remains. Final label/boolean cleanup
  lint PASS. Session-client semantics unchanged.
- Contract generated check and routes PASS,123operations/22controllers.
- Impeccable detector one scoped run:0findings. No rerun.

## Browser evidence

CUA real local Vite5186 and API3000, backend local during UI QA. Only unknown
synthetic email/decoy codes used; no new credential entered through browser.
Full successful credential changes were tested through QA API on isolated DB.

- verification-laptop.jpg:1536×700, actual generic request response, code input,
  resend countdown and clear email summary; document1536×700.
- verification-error-320.jpg:320×740; formatted paste/leading0 accepted, actual
  invalid-code API400 recovery alert; reload retains opaque challenge, heading
  focus. No horizontal overflow (clientWidth305 with vertical scrollbar).
- recovery-laptop.jpg:1536×700; OTP and two password fields in desktop columns,
  document1536×700 and recovery H1focus, no unnecessary laptop scroll.
- recovery-mobile.jpg:390×844; stacked passwords and natural vertical scroll,
  no horizontal overflow.

Keyboard/focus, resend-email return to OTP, pending,60-second resend, reload
without email memory and six-digit native pattern were exercised. Auth paper
shuffle/login storm unchanged; no claim of new GPU/native motion testing.

## Real provider and runtime

Brevo sender lookup HTTP200 and configured sender active. Initial test rejected
HTTP401 due to caller egress IP differing from the user browser IP; owner added
Brevo-recorded IP. One explicitly authorized sample email (nonfunctional code,
no account created/reset) then returned HTTP201 through AuthMailService.deliver.
Do not resend this sample. Owner confirmed receipt in their inbox on2026-10-11.
This confirms the sample delivery, not production deliverability or the complete
registration/reset flow through a real inbox. Private
backend env/key/sender never committed, output includes only statuses.

Main DB forward-migrated0018/bootstrap; zero Pending/Sending jobs before
restarting API with Brevo. QA provider pinned local regardless of private env.
After restart API health200 and Register web200 PASS. docs:check310Markdown/
2150links PASS; git diff --check PASS. Scoped source review checked contract,
new migration, user→challenge locking, post-commit wrong-attempt errors,
password/session rollback, stale job cancellation and private data boundaries;
no material scoped finding, not independent human acceptance.

## Limits and next action

Physical mobile, screen-reader speech/NVDA, RN/Flutter UI adoption, human review,
production sender/domain reputation and full business E2E NOT RUN. Provider
acceptance is separate from actual inbox delivery. READINESS unchanged; unrelated
Chat/Notifications/MainLayout WIP preserved. Local commit only, no push.
Owner should try registration/OTP/Login and forgot/OTP/reset using their inbox;
human review before integration. Legacy email links remain supported.
