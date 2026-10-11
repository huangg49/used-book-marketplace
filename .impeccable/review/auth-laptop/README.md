# Auth shared laptop paper — 11/10/2026

Branch `codex/auth-laptop-layout`, base `3a25036`; narrow CSS refinement.
Three Auth forms share a viewport-aware paper minimum on desktop. At height
800px or less, spacing becomes denser without scaling text or controls. Status
stays mounted/live but leaves layout flow. The note stays beside the stack from
1000px; mobile and very short screens retain natural page scrolling. No fixed
paper height, content clipping, nested scroll container or auth logic changes.

## Browser evidence

CUA in-app Chromium, production preview localhost5186 rebuilt from this tree.
All saved JPEGs opened and inspected:

- `register-laptop.jpg`, `login-laptop.jpg`, `recovery-laptop.jpg`: 1536×700,
  each paper exactly480×596px at(528,56), document height700px, no vertical or
  horizontal scrolling. Input text16px, input height46px unchanged.
- 1024×700 Register:480×596px at(272,56), document1024×700, no overflow.
- 1366×600 Register: paper590px minimum, document694px high; natural scroll
  remains available. Keyboard navigation scrolls the lower content into view.
- `register-mobile.jpg`:320×740, four vertically stacked fields, full-page
  document977px, width320px and input16px; no horizontal overflow.
- Enter on Register's Login link and click Login's recovery link still complete
  the850ms shuffle; destination heading focus and polite change status verified.

Viewport resizing models available CSS space, not actual125% browser zoom.
Actual zoom/text enlargement, physical mobile/keyboard, screen-reader speech,
API submissions/backend/native tests and human acceptance NOT RUN. No main DB
touched; READINESS unchanged. Existing Register/recovery API-unavailable copy and
disabled submits retained.

## Checks

Web build/TypeScript PASS (3696 modules); existing bundle-size advisory.
Lint zero errors, five existing Exchange warnings. One detector pass reports
only the inherited6px wine top edge/3px corner advisory, retained per paper brief.
Docs and whitespace checks PASS before scoped commit. Other local Chat and
Notifications work excluded from this change.
