# Compact Search filter dropdowns — 12/10/2026

Branch `codex/search-compact-dropdowns`, base `66a79bb`; checkpoint subject
`feat(web): add compact searchable filter dropdowns`. Owner asks for prettier
filter dropdowns while keeping many categories visible in a compact area.

Search opts into `FilterSelect` for category, subgroup and edition language.
Above900px, the existing44px bottom-rule field becomes an editable combobox;
typing matches case/diacritic/đ-insensitive labels without committing a filter.
The fixed portal listbox uses the field width,36px rows and maximum288px height.
All12 main choices including All remain available; roughly7.5 rows fit at once.
Selected choices have wine text/check, keyboard active choices have an inset
edge. Placement flips above when needed. At900px and below real native selects
retain44px height and a visible chevron inside the existing filter dialog.

`CatalogClassificationFields` has an optional renderer; default consumers stay
native. Subgroup labels now have an explicit for/id association. Taxonomy,
dependent pruning, native facets, draft/Apply URL, API and session are unchanged.
New SSR regression cases verify posting's default native/selected-child contract
and the injected renderer's parent/child/clear callback behavior.

## Captures

Native JPEG payloads are saved unchanged; screenshots are viewport observations,
not full pages. Desktop rasters1265×712 correspond to configured1280×720;
mobile390×844 and320×740 match their configured sizes. Do not infer actual125% zoom.

| Capture | State |
| --- | --- |
| [desktop](desktop.jpg) | Main list, twelve choices, wine label, compact scroll |
| [search](search.jpg) | `khoa hoc` finds Khoa học / công nghệ |
| [empty](empty.jpg) | No-match message and correction guidance |
| [subgroup](subcategory.jpg) | Foreign-language subgroup list |
| [language](language.jpg) | Edition-language popup opens above its field |
| [mobile](mobile.jpg) | Native category/subgroup with chevrons in390px dialog |
| [320px](320.jpg) | Same compact native controls at320px |
| [Native focus](mobile-focus.jpg) |390px keyboard focus: wine subgroup label and bottom edge |

## Verification

- Build (TypeScript/Vite) PASS; existing chunk-size advisory remains. Final build
  includes removal of an unused selector; this has no runtime consumer.
- 80 unit tests PASS, including two native-consumer/renderer regressions. Lint
  has0errors/5pre-existing Exchange warnings. Formatting/docs/diff checks at handoff.
- Chromium CUA preview: pointer and keyboard choice, no-accent search, Enter,
  Escape restoring selection, End/active-descendant/scroll to final item, outside
  dismissal, Tab closing the current list and opening the next field PASS.
- Category/subgroup selection and clearing preserve existing behavior. Apply URL
  carries `categoryId=languages.ja&language=en`; no query/DB mutation before Apply.
  No-match keeps its typed query and explicit recovery. Popup portal avoids rail
  clipping; language upward bounds94–382px fit the720px viewport.
- Main popup measured248px wide/288px high with36px rows and12 options. Native
  mobile select measured44px; Escape/reopen retains draft.320px document305px,
  no horizontal overflow or custom portal left inside the mobile dialog.
- Actual reduced-motion:true retains140ms entry and scoped170ms focus feedback.
  One detector pass:8incumbent Search radius/color advisories outside this diff;
  no rescan. Unused former language selector removed after captures without
  changing runtime appearance.

No actual authenticated Sell browser flow: default native evidence is SSR/source,
not platform acceptance. Full live API/harness, Safari, screen-reader speech,
physical mobile/native app, forced-colors runtime, human acceptance and CI NOT RUN.
No login, email, backend or DB writes. Independent [finish review](finish-review.md)
and [documentation comparison](documentation.md) cover this selector extension,
not a whole-Search audit. Disposition **ship**, no material fix in the original
slice; [targeted verdict](finish-verdict.md) scores the native-label correction
resolved. Settled390px keyboard focus measured wine label/border,1px bottom inset,
44px field and170ms feedback. Docs/diff/format checks PASS. AI review does not
replace human acceptance.

QA tabs closed and viewport reset; Vite5186 retained. Teammate WIP/READINESS
preserved. Local checkpoint only, no push/PR/merge.
