# Continuous login paper flow — 11/10/2026

`codex/auth-paper-flow`, base `8f02bdf`, checkpoint subject
`feat(web): carry login paper flow continuously through navigation`.
Owner approved the researched plan: fix the freeze first, then soften the paper
material and let large pages conceal/reveal the actual destination. Motion stays
enabled under either OS preference; no OS settings changed.

## Change and invariants

- rAF continues while navigation awaits. Absolute motion time never pauses;
  independent release time starts after the actual destination React DOM commit
  and two paint boundaries. First opaque draw precedes route mutation.
- Three curved pages travel diagonally. The primary page contains a guaranteed
  rectangular opaque core through bounded drift; geometry tests cover 5 viewport
  shapes through 10s waits. Other page edges/creases move over it. Release is
  spatial departure, not a full-viewport alpha fade.
- Desktop 1600ms / 30 fragments; mobile 1500ms / 18, plus actual readiness latency. Four
  cached scraps/ribbons/corners, cream/ivory/sparse yellow, faint ink and softer
  shadows. Existing ivory-paper.webp reused; no new artwork/dependency.
- Printed halves separate slightly, get covered, then display:none. This fixes
  the inherited visibility bug that let their visible child survive on Home.
  Copies still clear passwords including revealed passwords and remain inert.
- API/session/validation/LoginPage unchanged. Safe returnUrl, focus restoration,
  body scroll/gutter restoration and Back cancellation remain. Abort resolves
  pending route acknowledgement; texture callback detached on cleanup.
- Technical no-Canvas 440ms fallback retained; it is not an OS preference path.

## Verification

Final web build/TypeScript and 45 tests in 8 files PASS. New scheduler checks prove
ongoing draw/time advancement during a deliberately slow commit, no release
before readiness, opaque-paint-before-navigation, interruption before/after
commit, rejection cleanup and geometry coverage across viewport sizes.
Lint 0 errors / five known Exchange warnings; Vite >500kB bundle advisory remains.
One detector pass on scoped rendering files: 0 findings. No duplicate scan.

CUA isolated localhost:5187 returns synthetic 401/200; no DB/storage connection.
QA-only source transform adds 700ms after destination paint for `qaHold`; not
shipped. No matchMedia override used: actual OS reduced motion=true throughout.

- Desktop 1280×720: during extra 700ms wait, motionTime advanced 957→1068ms with
  coverage=true. `covered-a-desktop.jpg`/`covered-b-desktop.jpg` show different
  moving edge positions. Final destination DOM acknowledgement: Home H1 present,
  no data-auth-paper, routeReady=true, release .30. `reveal-desktop.jpg`.
- Mobile 390×844: 18 fragments, safe `/books?data=preview`, destination H1 TÌM SÁCH,
  no Auth paper, then H1 focus / no inert / restored scroll. `reveal-mobile.jpg`.
- Synthetic 401: alert, no storm, input fields still populated (AX redacts values).
  No credential values were captured/logged. Final Back check: fresh Home → Login
  via SPA navbar, Back during tear returns to Home with H1 present and no
  overlay/inert/scroll lock; stable on follow-up, no new console errors.
  Earlier cross-document Back during development produced an invalid-hook error
  with mismatched Vite optimized-dependency versions after concurrent HMR/build.
  A fresh document and SPA retest resolved that development-only observation;
  no unrelated React configuration was changed.
- `storm-desktop.jpg` captures initial split/scraps. Initial visual pass prompted
  foreground page angles/positions refinement; confirmation exposed inherited
  copy visibility and route-paint readiness weaknesses. Both fixed and targeted
  destination DOM/capture confirmation completed. No further aesthetic iteration.

## Limits

Physical phone frame-rate/performance, screen-reader speech, 200% zoom/text, native,
main-DB login, hidden-tab completion, no-Canvas runtime and human acceptance NOT RUN.
This is functional/visual browser evidence, not a 60fps benchmark. READINESS gates
unchanged. Earlier `.impeccable/review/auth-storm` captures are historical.
Owned 5187 fixture stopped; production 5186 preserved, browser reset to normal
viewport/Login. Unrelated Chat/Notifications/MainLayout WIP stays outside commit.
