# Posting field focus — 12/10/2026

Branch `codex/posting-field-focus`, base `30f6df3`; checkpoint subject
`refactor(web): simplify posting field focus`. Owner approved removing the
separate outer outline in Sell while preserving clear editing and keyboard focus.

## Scope

Product changes are CSS-only in `SellBookPage.module.css`: existing field border
and associated label turn wine, with a contiguous 1px inset stroke on focus-visible.
The ruled title remains bottom-only. Color/stroke transitions are 170ms ease-out
and keep running under the owner's motion policy. Invalid focus uses the existing
rust role `#912b0e`, bound locally because the global role was absent. Buttons,
choices and file controls keep their prior focus; API, values and validation are
unchanged. DESIGN, sidecar and Sell surface document the scoped recipe.

## Captures

Viewport sizes below are logical browser sizes; full-page PNG content widths
exclude the stable scrollbar. All full-page captures begin at scrollY=0.

| Capture | Viewport / state |
| --- | --- |
| [desktop](desktop.png) | 1440×900, condition step, valid Ruột sách focused |
| [mobile](mobile.png) | 390×844, same state, full page |
| [mobile focus](mobile-focus.png) | 390×844, scrolled viewport around focused field |
| [320px](user-320.png) | 320×740, condition step, full page |
| [error](error.png) | 1440×900, Bìa và gáy invalid and focused through summary |
| [detail](detail.png) | 446×169 crop of label, help and valid focused textarea |
| [title](title.png) | 1440×900, manual-entry title focused, bottom rule only |
| [classification](classification.png) | 1440×900, native category keyboard focus |

Browser spelling squiggles on synthetic Vietnamese draft text are native browser
state, not authored validation. No listing was submitted.

## Verification

- Final TypeScript/Vite build PASS; existing bundle-size advisory remains.
- Chromium CUA on disposable Nest/Mongo `*_test`: textarea, ruled title and native
  category keyboard focus PASS; no normal outer outline, wine label and 1px inset
  stroke confirmed by computed styles. Invalid field uses rust border/stroke and
  retains explicit correction text; summary focus and correcting the value PASS.
- Field values retained across steps. 320px document width 305px, no horizontal
  overflow. Browser reports prefers-reduced-motion=true while computed duration
  remains 0.17s, confirming the owner's component motion override.
- CSS formatting, docs and diff checks PASS. No unit/lint rerun for CSS-only scope;
  prior 78-test result belongs to the preceding checkpoint. No second detector:
  the earlier blended task's single `[]` result is historical evidence only.
- Independent [finish review](finish-review.md): **ship**, no material fixes.
  [Documentation comparison](documentation.md) confirms unchanged primitives and
  other recipes. AI disposition does not replace human review.

Safari, screen-reader speech, physical mobile/native, forced-colors runtime, actual
125% zoom, full submission/replay, human acceptance and CI NOT RUN. Forced-colors
has a scoped system Highlight inset-outline fallback, excluding checkbox, radio,
range and file inputs, but that branch is source-reviewed only.

## Cleanup / next action

QA tab closed and viewport reset. Disposable database/users/roles cleaned by the
fixture; API3009/image3010/Vite5191 stopped and test Mongo57017 stopped. Main
API3000/Vite5186/Mongo were retained. Unrelated teammate work and READINESS remain
unchanged. Local checkpoint only; no push/PR/merge. Owner can inspect `/sell` on
the running web before human review/integration.
