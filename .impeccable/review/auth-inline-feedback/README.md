# Auth input feedback — 11/10/2026

Source: `codex/auth-inline-feedback`, base `0224170`; checkpoint subject
`feat(web): add accessible inline auth form feedback`.

Shared AuthForm/AuthInput presents the original native constraints plus exact
password confirmation inline. Errors start after blur or submit, then refresh
while corrected. Submit focuses the first invalid field after aria-describedby
and live feedback mount. Password feedback describes length/matching only.
Server OTP errors map by ApiError code; delivery/network/rate failures stay
general alerts. No API/session/request-body/motion changes or new token store.

CUA in-app Chromium, localhost5186, synthetic local input only:

- 1280×720: Login empty submit and invalid-email blur, correction clears error;
  first-invalid focus/aria; Register empty initial page scrollHeight720, errors
  may grow naturally. Short password uses actual keystrokes then blur; mismatch,
  matching confirmation and reediting original password refresh correctly.
- 390×844: Register/recovery errors stay readable with no horizontal overflow.
  Empty recovery email focuses itself. Empty reset-OTP form focuses OTP with all
  required messages. An opaque synthetic UUID opens the existing challenge UI;
  no valid challenge or account command was submitted.
- OTP three digits is rejected locally, formatted six digits normalize while
  preserving initial zero and clear inline errors. Consent remains unchecked;
  registration was never submitted with valid values.
- Tab closed and temporary viewport reset. Main runtime and user tab preserved.

Captures from actual UI: [Login errors](login-errors.png),
[Register desktop errors](register-errors-desktop.png),
[Register mobile errors](register-errors-mobile.png),
[Recovery mobile errors](recovery-errors-mobile.png). Screenshots use blank or
synthetic form data; they are QA evidence, not shipping illustration assets.

Checks: web build including TypeScript PASS;78tests/11files PASS, including eight
new native-feedback cases and one OTP error-target case. Lint exits0 with five
existing Exchange warnings; build retains existing chunk-size warning. One
Impeccable detector pass over six changed UI files returned only three existing
Google vendor-color advisories (#fff/#747775/#1f1f1f), intentionally retained.

NOT RUN: real registration/login/reset/email delivery, browser server-error
responses, screen-reader speech, Safari, physical mobile,200% zoom, human review
and remote CI. Unit tests cover OTP/server-error classification. READINESS does
not change; this evidence is web input feedback only.
