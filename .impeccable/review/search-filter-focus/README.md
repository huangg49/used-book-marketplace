# Search filter focus — 12/10/2026

Branch `codex/search-filter-focus`, base `2672532`; checkpoint subject
`refactor(web): simplify search filter field focus`. Owner requests the approved
Sell focus treatment for Search's filter fields. Product diff is CSS-only in
BookSearchPage.module.css; taxonomy, JSX, global CSS and shared consumers stay intact.

Existing boundaries turn wine without an outer ring. Native selects keep their
bottom rule; the series input retains its incumbent frame and gets a keyboard
bottom inset. Price bounds use the existing wrapper border plus contiguous 1px
keyboard inset, with wine prefix; invalid bounds use rust. Associated classification
labels turn wine. Transitions are 170ms ease-out, retained under owner policy.
Radio/checkbox, buttons/disclosure, main search and sorting keep their focus.

## Evidence and checks

All PNGs are intentionally scrolled **viewport captures**, not full-page images:

| Capture | Browser viewport and state |
| --- | --- |
| [desktop](desktop.png) | 1280×720 valid price focus |
| [category](category.png) | 1280×720 native category keyboard focus |
| [series](series.png) | 1280×720 Manga series focus |
| [error](error.png) | 1280×720 invalid 200000–100000 price focus |
| [mobile](mobile.png) | 390×844 dialog valid price focus |
| [mobile series](mobile-series.png) | 390×844 dialog series focus |
| [320px](320.png) | 320×740 dialog valid price focus |

- Build (TypeScript/Vite) PASS; existing bundle-size advisory remains.
- Chromium CUA preview: native category/series/price keyboard focus, no outer
  outline, associated label/prefix wine, price wrapper inset1px PASS. Existing
  reduced-motion preference=true; computed duration0.17s confirms scoped override.
- Invalid price shows explicit alert, rust boundary/inset and disabled Apply;
  correcting to10000–100000 enables Apply. Applied URL carries Manga/Naruto and
  that range; two preview results. No live API/DB mutation or account login.
- Mobile Escape/reopen retains draft. 320px document305/dialog267px, no horizontal
  overflow. Exchange-value wrapper and language native select keyboard focus also
  checked through computed styles; language keeps zero top border and bottom inset.
- One detector pass:9 advisory findings in incumbent radius/colors outside diff;
  no rescan or unrelated drift repair. CSS formatting and diff checks PASS.
- Unit/lint not rerun for CSS-only change. Forced-colors fallback is source-reviewed
  only; Safari, screen-reader speech, physical mobile/native, actual125%zoom,
  full live API filtering, human acceptance and CI NOT RUN.

Independent [finish review](finish-review.md) and [documentation comparison](documentation.md)
cover this focus extension only: disposition **ship**, no material fixes. Docs
link checks PASS. AI review does not replace human acceptance.

QA tab closed, viewport reset; Vite5186 was restarted and retained for owner
inspection. No disposable backend or database was needed. Teammate WIP and
READINESS preserved; local checkpoint only, no push/PR/merge.
