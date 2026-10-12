# Auth crisp at rest — 11/10/2026

Scoped refinement on `codex/auth-crisp-rest`, base `f63d8b0`.
Foreground text appeared soft under the permanent stack rotation and 3D transforms.
Stack/pages/leaf/front now render flat at rest, without transform, perspective,
backface hiding or will-change promotion. Reverse face is hidden while idle.
Only the finite shuffle enables the existing 2200px perspective and solid faces;
outgoing start/incoming finish use zero Z to avoid settlement scale jumps.
Two decorative rear sheets keep their 2D rotation and shadows.

## Evidence

CUA in-app browser, local Vite `http://127.0.0.1:5186`, 1366×768 and 390×844.
All saved JPEGs inspected at original resolution:

- `login-desktop.jpg`: settled flat foreground, retained rear papers and photo.
- `register-desktop.jpg`: destination after keyboard Enter; focused heading.
- `register-mobile.jpg`: natural vertical flow and full form at mobile width.
- `recovery-mobile.jpg`: settled recovery form with focused heading.
- `shuffle-desktop.jpg`: early transition frame, outgoing form still solid;
  not a midpoint or timing measurement.

Computed style checks: stack/pages/leaf/front transform and perspective `none`,
transform-style `flat`, filter `none`, opacity `1`, backface `visible`, will-change
`auto` at rest. After Login→Register and Login→Recovery, `data-shuffling` clears,
leaf transform/perspective return to `none`, destination H1 receives focus.
Desktop and mobile checks found no horizontal document overflow. Register→Login
also completes. No form submitted and no main database touched.

## Checks and limits

- Web build/TypeScript PASS (3696 modules); existing large-chunk advisory remains.
- Lint PASS: zero errors; five existing Exchange warnings.
- One scoped detector pass: inherited 6px wine edge/3px radius advisory, kept as
  the approved paper material. No detector rerun or clean-pass claim.
- Docs check and whitespace check recorded in the scoped commit handoff.
- API/session/validation, assets, font, 850ms shuffle, 650ms success dwell and
  existing owner-approved finite-motion exception unchanged.
- Backend tests, native, actual reduced-motion-true runtime, screen-reader speech,
  200% zoom and human acceptance NOT RUN for this rendering-only refinement.
  Prior broader Auth evidence remains in `../auth-shuffle/`; READINESS unchanged.
