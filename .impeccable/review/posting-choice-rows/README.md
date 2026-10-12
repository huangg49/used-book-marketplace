# Posting choice rows —12/10/2026

Scope: `codex/posting-choice-rows`, base `dfe5f57`. The owner rejected sparse
native Yes/No controls. This local refinement gives the eligibility questions
compact ruled rows and visible choice faces, shared with Sale/Exchange/Both.
Existing paper desk, labels, values, validation, API and submission logic remain.
No new token, dependency, raster or motion.

## Evidence

CUA Chromium on actual React/Vite and isolated Nest/Mongo `*_test` fixture at
Vite5191/API3009; fake storage. Full-page images extend beyond the logical viewport.

| File | Logical viewport / state |
| --- | --- |
| desktop.png |1440×900, condition answers Yes/No/No, full page |
| mobile.png |390×844, condition answers, full page |
| user-320.png |320×740, condition answers, full page |
| mode-desktop.png |1440×900, Both selected, full page |
| mode-mobile.png |320×740, Both selected, full page |
| error.png |1280×900, invalid readability answer after Continue |
| focus.png |320×740, focused mode radio, viewport |
| questions-focus.png |1440×900, last question radio focused, viewport |
| detail.png |886×336 intentional DOM-derived crop, all three questions and focus |

Initial detail capture incorrectly used viewport coordinates as document
coordinates and showed the sheet header. Independent review requested recapture.
The exact file was replaced using document bounds; no shipping verdict was inferred
from the invalid image. Final independent full review returns **ship**, with no
material fixes for these choice groups: [finish-review](finish-review.md).

## Checks and limits

- PASS:78web tests/11files, TypeScript+Vite build, lint with five existing Exchange
  warnings and existing bundle-size advisory. `docs:check` PASS (325Markdown files,
  2203relative links); `git diff --check` PASS.
- PASS: Native ArrowRight/Space changes answers/mode; visible focus follows the
  real radio. Clicking an error-summary link focuses its question radio; selecting
  the valid answer recovers. Invalid readability retains values and blocks Continue.
- PASS: Eligible Yes/No/No advances to prices. Sale/Exchange/Both retain existing
  field visibility; Back retains answers, text and Both.320px has no horizontal
  overflow (document width305px). No automatic answering was added.
- Prior once-only detector on the blended posting source in this logical session
  returned `[]`; no repeat scan or current-extension detector result is claimed.
- NOT RUN: Full submission/network-loss replay for this presentation-only change,
  live storage, Safari, screen-reader speech, physical mobile, actual125%OS zoom,
  native, human acceptance and remote CI. READINESS remains unchanged.

See [documentation comparison](documentation.md). AI review does not replace human
acceptance. QA database/users/roles were removed by fixture cleanup; task API/fake
storage/Vite stopped, QA Mongo57017 stopped, viewport reset and task tab closed.
Main API3000/Vite5186/Mongo remain available. No push/PR/merge.
