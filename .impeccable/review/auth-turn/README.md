# Auth paper turns — 11 October 2026

Branch `codex/auth-paper-turn`, base `fd05a77`. Checkpoint subject:
`feat(web): clarify auth paper turns and remove visible photo credit`.

Latest owner instruction removes visible credit; photographer/source provenance
remains in public/photography/README.md. No image or auth API changes.
Departure320ms to±96°, arrival380ms from±82°, left hinge/perspective2200px and
changing cast shadow. Returning to Login reverses direction. No load entrance.
Reduced motion:140/160ms opacity feedback, no spatial movement; static success
stamp500ms remains. Departure cleanup owns only its own handle, preserving entry.
Root clips transformed overflow without imposing a viewport height/scroll lock.

Codex IAB checks:

- Production5186 actual reduced-motion: Login→Register→Login→Recovery works;
  query retained, destination heading focused, outgoing sheet inert, Enter works.
- Laptop1366×768 and mobile320×900: no credit, readable sheets/no horizontal
  overflow. `login-laptop.jpg`, `recovery-mobile.jpg` opened and checked.
- Isolated5187 normal-motion UI fixture overrides reduced preference only inside
  that development server (including the scoped CSS media rule). No API/DB.
  Forward/back and recovery turns exercised, live computed3D matrices confirmed
  opposite signs and outgoing inert state. `turn-recovery.jpg` records the exposed
  backing leaves at the end of departure. Final projection clip removes transient
  scrollbar. This verifies normal-motion rendering through a QA preference
  override, not an OS setting change. Fixture code is ignored and not shipped.
- Production viewport reset and login restored at finish.

TypeScript/build PASS; existing34 tests/7 files PASS. Lint0errors/5pre-existing
Exchange warnings. One detector scan flags the pre-existing6px wine paper edge
with3px corner; retained user-approved paper-file recipe, not detector PASS.
No new API/native/success-login/full screen-reader/human review; READINESS unchanged.
