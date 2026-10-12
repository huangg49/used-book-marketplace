# Search sorting dropdown — 12/10/2026

Branch `codex/search-sort-dropdown`, base `a3f4d13`; checkpoint subject
`feat(web): refine catalog sorting dropdown`. Owner rejects the detached focus
outline and gray native popup in the supplied desktop screenshot.

`CatalogSort` is a controlled Search component with the same five sort values,
preview/live first labels and existing `update` callback. Above600px, a labelled
button opens a paper menu with checked radio-menu items, wine check,44px targets
and one continuous inset keyboard-focus boundary. At600px and below the native
select remains, with its own single-boundary focus and untouched picker keyboard.
No library, API, sorting algorithm, filter or session change. The unused legacy
BookSearch/SortDropdown is not adopted. The integration harness now targets the
desktop menu rather than its replaced select; the whole old harness was not run.

## Evidence

All files are native **viewport captures**, not full pages. JPEG payloads are saved
unchanged as `.jpg`. Native raster sizes differ from the configured CSS viewports:
desktop1265×712, tablet753×882, mobile375×812,320305×705. The DOM check at320px
reports inner320×740/client305×740/document305px; do not infer exact raster/viewport
height matching. Native phone picker appearance is browser/OS-owned.

| Capture | Viewport and state |
| --- | --- |
| [desktop](desktop.jpg) | 1280×720, open default menu |
| [selected](selected.jpg) | 1280×720, chosen sale descending item checked |
| [closed](closed.jpg) | 1280×720, menu closed after Back restores URL |
| [tablet](tablet.jpg) | 768×900, custom menu open |
| [mobile](mobile.jpg) | 390×844, native select |
| [320px](320.jpg) | 320×740, native select |

## Checks

- Final build (TypeScript/Vite) PASS; existing bundle-size advisory retained.
- Existing unit suite78/78 PASS during implementation; final lint0errors with5
  pre-existing Exchange warnings. No implementation-mirroring unit tests added.
- Chromium CUA preview: checked/current state, ArrowUp/Down, Home/End, Enter,
  Escape/trigger focus, typed-prefix navigation, pointer outside and Tab dismissal
  PASS. Existing URL callback commits sale ascending/descending and exchange sort;
  Back restores earlier criteria and closes menu. No backend/data mutation.
- Native select on390px commits values; ArrowUp changes native selection without
  opening hidden custom UI. Resize from open768px menu to390px closes it and
  transfers focus to native select. 320px document305px, no horizontal overflow.
- Actual prefers-reduced-motion:true retains140ms menu opening; menu bounds at
  desktop x973–1225/y354.8–586.8 fit1280×720. Scoped motion cleanup stays finite.
- Single detector:9advisories,8 incumbent Search radius/colors and one initial
  shadow literal equivalent to canonical ink. The latter was changed to token
  color-mix; no second detector. Final source/build/lint confirms the correction.
- Forced-colors has system-color menu boundary and inset Highlight focus, source
  reviewed only. Safari, screen-reader speech, physical mobile/native app,
  forced-colors runtime, full live API/browser harness, human acceptance and CI
  NOT RUN. No main DB writes, login or email.

Independent [finish review](finish-review.md) and [documentation comparison](documentation.md)
cover only this sorting control: disposition **ship**, no material fixes. AI
disposition does not replace human acceptance. Docs/diff/format checks PASS.
QA tab closed and viewport reset; Vite5186
kept running. Teammate WIP/READINESS preserved. Local checkpoint; no push/PR/merge.
