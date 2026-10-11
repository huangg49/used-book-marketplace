# Auth card shuffle — 11/10/2026

Source: `codex/auth-solid-paper`, base `8ed4b22`; checkpoint subject
`feat(web): shuffle auth cards and build account forms`.

Owner superseded the hinged flip with a pull/lower/tuck sequence. The opaque
top sheet moves fully right before changing depth, then returns beneath the
stack; the actual destination form is already rendered underneath. Both faces
are opaque textured paper. One850ms WAAPI sequence coordinates carrier,
incoming sheet, face light, cast shadow and underlying contact shadow. No
carrier fade/filter, yaw flip, initial entrance or autoplay. The finite Auth
shuffle intentionally runs regardless of OS reduced motion, by explicit owner
request; the stamp still reduces to static. This exception is Auth-only.

Register now has name/email/password/reveal/confirmation. Recovery has email
and a librarian note. Both are frontend-only, with native-disabled submission
and visible availability copy; no account creation/reset request or fabricated
success. Drafts remain only in the mounted Auth context. Login API, validation,
SessionClient and safe-return behavior remain unchanged.

## Evidence

All captures were opened and inspected. Intentional motion captures retain the
outgoing sheet partly outside the viewport; these are not settled-page crops.

| Capture | Surface / viewport |
| --- | --- |
| [Login](login-desktop.jpg) | production5186,1366×768 |
| [Register](register-desktop.jpg) | production5186,1366×768; natural short-height scrolling |
| [Recovery](recovery-desktop.jpg) | production5186,1366×768; keyboard heading focus visible |
| [Pull](pull-register.jpg) | production5186, mid-shuffle; actual Register underneath |
| [Recovery narrow](recovery-mobile.jpg) | production5186,390×844 |
| [Shuffle narrow](shuffle-mobile.jpg) | production5186,390×844, mid-shuffle |
| [Register narrow](register-mobile.jpg) | production5186,320×1100, complete form |
| [Login narrow](login-mobile.jpg) | production5186,320×1100 |
| [Login actual browser](login-user.jpg) | production5186,587×812 after viewport reset |
| [Rejected login](login-error-fixture.jpg) | isolated5187 synthetic401, no DB |
| [Accepted login](login-stamp-fixture.jpg) | isolated5187 synthetic200, no DB |

CUA observed leaf/pages/stack preserve-3d, carrier opacity1/filter none and
opaque `rgb(255,250,240)` paper. Higher ancestors have opacity1/no filter; the
photograph blur is on a sibling image. Incoming and departing forms are inert
and hidden from AX during the change, with a separate polite status. Enter
activates the recovery link and destination heading receives focus. Draft
name/email survive switches. Width320/390 has no horizontal overflow; the
outgoing sheet clips at the screen edge without adding horizontal scrolling.
Back during a pending shuffle cancels its navigation; later inspection still
shows the requested history page. Query strings remain on Auth links.

Synthetic401 keeps fields and shows clear handwritten recovery guidance without
a stamp. Synthetic200 shows the stamp only after response, holds650ms, shuffles,
then actually reaches the supplied safe `/books` returnUrl. Fixture catches all
API traffic, never writes to the main database, and uses synthetic inputs only.

## Checks and limits

- Web TypeScript/build PASS;34 existing tests in7 files PASS; lint0 errors,
  5 existing Exchange warnings. Existing large-chunk build advisory remains.
- Detector ran once: inherited6px wine paper-edge/3px radius warning retained
  for the pinned paper material. Two shade-color advisories were resolved by
  reusing existing cream/wine palette tokens; detector was not rerun, so this
  is not a clean-detector claim.
- Actual OS preference in this inspection was reduced-motion=false. The forced
  shuffle has unconditional source behavior; a new true-preference runtime
  inspection was NOT RUN. Earlier hinged-flip evidence is not this animation.
- No new native, screen-reader speech,200% zoom, main-DB login, backend register/
  reset, live storage, human or release-gate acceptance. READINESS unchanged.
- Independent source/capture finish review: [SHIP](review.md), including the
  supplemental actual-browser viewport; this is not human acceptance.
- Separate documenter updated the current Auth recipes/tokens/sidecar and texture
  provenance notes. Docs link check PASS (301 Markdown files/2121 relative links)
  and git diff whitespace check PASS; these are not business-claim verification.

Existing photograph, paper texture and fonts are reused. Their provenance stays
in public/photography/README.md, public/login-art/README.md and
public/fonts/auth/README.md. Visible photo credit remains removed as requested.
