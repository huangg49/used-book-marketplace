# Reversible condition answers —12/10/2026

Branch `codex/posting-choice-clear`, base `7675dec`. Owner follow-up requests
repeat activation to unselect condition answers and removal of the extra rule
above the action buttons. Only condition answers acquire the clear action;
Sale/Exchange/Both remains exclusive. Existing null state and validation are reused.

## Captures

CUA Chromium, React/Vite5191 and isolated Nest3009/Mongo57017 `*_test` fixture,
synthetic account and fake storage. Full-page images extend past the viewport.

| File | Viewport / state |
| --- | --- |
| desktop.png |1440×900, valid Yes/No/No, full page |
| mobile.png |390×844, valid Yes/No/No, full page |
| user-320.png |320×740, valid Yes/No/No, full page |
| error.png |1440×900, last answer cleared, Continue blocked, full page |
| detail.png |886×470 DOM document crop, all questions and single action separator |

## Verification

- PASS: Repeat clicks clear both True and False to unanswered. Repeat selected
  Space initially did not fire a native click; a checked-radio key handler fixes
  it. Final Space clears/reselects; ArrowLeft/Right selects the adjacent answer.
- PASS: Clear last answer then Continue stays on condition, focuses the existing
  error summary and says Chọn Có hoặc Không. The summary link focuses its native
  radio; answering correctly advances. Back preserves text and answers. Clicking
  the selected Sale mode does not clear it.
- PASS: Mobile repeat activation clears;320px has document width305px and no
  horizontal overflow. Last question computed border-bottom0px; action separator
  retained. No API/session/payload/eligibility rule changed.
- PASS: Final source TypeScript/Vite build;78tests/11files; lint with five existing
  Exchange warnings, existing bundle-size advisory. `docs:check` and
  `git diff --check` PASS. Independent full finish review: **ship**, no material
  fixes in this scoped refinement; documentation comparison agrees with source.
- One detector invocation on the earlier blended base in this logical session
  returned `[]`; no current-extension scan or second detector claimed.
- NOT RUN: Full submission/retry/network-loss replay, live storage, native,
  Safari, screen-reader speech, physical mobile, actual125%OS zoom, human and CI.

Independent [finish review](finish-review.md) and [documentation comparison](documentation.md)
cover the scoped change. AI review is not human acceptance. QA fixture database,
users and roles cleaned; task API/Vite/fake storage and Mongo57017 stopped,
viewport reset and tab closed. Main API3000/Vite5186/Mongo retained. No push/PR/merge
or READINESS change; unrelated teammate work preserved.
