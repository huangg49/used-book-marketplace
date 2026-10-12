# Book-entry slip —12/10/2026

Scope: `codex/posting-book-slip`, base `34f2cc4`. Owner approved a more personal,
usable book-information slip inside the existing archival posting desk. Existing
five-step validation, session, payload, exit guard and submission attempt retained.
No new design token, dependency, shipping raster or backend change.

## Captures

CUA Chromium, actual React/Vite application, synthetic data on isolated Nest/Mongo
`*_test` at API3009 and Vite5191; fake storage. Sizes below are requested logical
viewports; full-page PNGs exclude the scrollbar and extend to the document height.

| File | Viewport / state |
| --- | --- |
| desktop.png |1440×900, manual title/author and paired category/language, full page |
| desktop-viewport.png |1440×900, same first viewport |
| catalog-desktop.png |1440×900, catalog entry mode, retained draft in preview |
| selected-desktop.png |1440×900, confirmed QA catalog title and facts |
| mobile.png |390×844, manual entry, full page |
| user-1280.png |1280×720, laptop manual entry, full page |
| user-320.png |320×740, manual entry, full page |
| selected-mobile.png |320×740, long confirmed title, stacked facts |
| search-shared.png | Shared classification consumer on Search, Văn học facets |

The first selected-desktop capture accidentally retained the320px override after
another tab became selected. Independent review returned **recapture**. That file
was replaced with a genuine desktop capture after checking innerWidth1440 and
scrollY0; no verdict was inferred from the invalid evidence.

## Checks

- PASS: Web78unit tests/11files; TypeScript+Vite production build; lint with five
  existing Exchange warnings and the existing bundle-size advisory.
- PASS: Manual title/author/category/language, long title, switching entry method
  retains values, forward to Photos/back preserves values. No horizontal overflow
  at320px (document width305px) or desktop.
- PASS: Empty title then Continue from catalog mode opens manual fields and focuses
  the existing alert summary; its error button focuses `#title`; correction allows
  forward navigation. No preview price error before reaching the price step.
- PASS: Existing catalog request confirmed using the existing operations decision
  API on the disposable QA fixture; public search/select fills title/author/category/
  language; choose-again opens catalog search. No main database mutation.
- PASS: Final keyboard Enter actions hand focus to `#sell-selected-title` after
  selection, `#sell-catalog-search` after choose-again and `#title` after the manual
  fallback. `focus-selected.png`, `focus-catalog.png`, `focus-manual.png` are viewport
  captures at the resulting focused control, rather than top-of-page views.
- PASS: Search's unpaired classification default still exposes native category,
  literary facets and reset control; secondaryField is opt-in for Sell only.
- One detector invocation earlier in this logical session on the blended posting
  source returned `[]`. No second detector was run and no scan of this extension
  is claimed. Independent review examines the current diff/captures.
- NOT RUN: Full authenticated submission/retry/network-loss replay for this visual
  extension (unchanged logic, previously covered on the blended base); live Supabase,
  Safari, screen-reader speech, physical mobile/keyboard, actual125%OS zoom, native,
  human acceptance and remote CI. READINESS unchanged.

Independent full review found one P2 focus-continuity issue, with no material visual
finding. The correction reused the cleanup-owned post-render focus scheduler;
recaptured evidence and Enter QA corroborated all three targets. The final verdict
is **ship**, scoring this fix resolved; the verdict pass is not a new whole-surface
audit. [Verdict](finish-review.md), [documentation comparison](documentation.md).
AI review does not replace human acceptance. QA disposable database/users/roles,
API3009/fake storage and Vite5191 were cleaned, viewport reset and QA tabs closed;
main API3000/Vite5186 remain running. No push/PR/merge or READINESS gate change.
