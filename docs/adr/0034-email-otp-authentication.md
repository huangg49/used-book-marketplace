# ADR 0034: Email OTP for account verification and recovery

Date: 2026-10-11. Status: implemented locally on codex/auth-brevo-otp;
owner-approved scope, human review pending. Base79f006d.

## Context

The owner approved six-digit email OTP for both registration and password
recovery, using Brevo; the existing link contract and clients must remain valid.
SRS1.1 FR-A01/A02/A04 remains the business scope. This ADR records the approved
web delivery choice, not a change to session or account eligibility rules.

## Decision

- OpenAPI0.33.0 adds four public /auth/otp commands. Existing link registration,
  resend, verification, forgot and reset remain, with their30/15-minute tokens.
  Member Vite web defaults to five-minute OTP; RN/Flutter can adopt the shared
  contract later without adding a second session/token store.
- crypto.randomInt generates padded six digits. New Mongo migration0018 stores
  keyed HMAC-SHA256 of challenge+purpose+code and a separate email HMAC. Unknown,
  duplicate, ineligible and cooldown requests get independent decoy challenges
  with identical202 shape, expiry and attempt policy; they do not send mail or
  reveal/invalidate the active challenge. Same normalized email/IP rate limits
  and60-second cross-channel cooldown protect issuance.
- A challenge permits five wrong guesses. Lock user then challenge, reread with
  Mongo $$NOW; commit attempts before returning an error. Issuance/consumption
  invalidates both OTP and link credentials of the same purpose. Registration,
  audit, challenge and encrypted mail job share a transaction; reset also changes
  hash and revokes every session atomically. Disabled stays denied; restricted
  and locked status remain. No verification/reset auto-login.
- Reuse encrypted durable auth_mail_jobs and lease/backoff. Worker cancels stale
  OTP jobs before send, wipes completed/failed payload. Brevo HTTPS native fetch
  has8-second timeout and JSON headers.idempotencyKey=jobUUID. Duplicate provider
  acknowledgement succeeds; its30-minute window is not indefinite exactly-once.
- Backend-only private env chooses local/Brevo/Resend/disabled. Validate sender
  and credentials, preserve IP restriction and verified sender. QA forces local
  on a separate replica set and *_test DB; no automated tests email real users.
- Web keeps only opaque challenge UUID in a fragment, never email/code/password
  or session credential. It survives reload; email is reentered for resend. One
  labelled numeric/one-time-code input supports paste and leading zeros. Recovery
  password fields share a desktop row and stack on mobile; active heading focus,
  pending/error, keyboard semantics and authored paper motion remain.

## Consequences and evidence

[Setup and behavior](../features/ACCOUNT_AUTH.md),
[scoped evidence](../../.impeccable/review/auth-otp/README.md).
The encryption/HMAC key must remain stable while challenges/jobs exist; rotating
requires an explicit queue/challenge invalidation procedure. Provider acceptance
only proves submission; inbox delivery is separate. Human/native/full business
acceptance and READINESS gates are unchanged. Local commit only; no deploy.
