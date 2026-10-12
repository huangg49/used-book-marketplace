# Search compact filter-dropdown documentation — 12/10/2026

Branch `codex/search-compact-dropdowns`, base `66a79bb`; narrow code-led Operate
extension after the custom sort dropdown. This pass merges the finished source
into the incumbent system; it changes no frontmatter token, other sidecar
recipe, product source, test or release gate.

## Checked ground truth

- `FilterSelect.tsx` / module CSS: desktop editable combobox, normalized
  substring search, fixed portal listbox, field-width positioning, bounded
  own scroll, selection/active states, responsive native select, cleanup,
  keyboard/ARIA links and scoped motion.
- `CatalogClassificationFields.tsx` / module CSS: optional renderer defaults
  native, explicit subcategory label/id and retained flex geometry; existing
  taxonomy/attribute/series cleanup. `CatalogClassificationFields.test.tsx`
  supplies two SSR consumer regressions. Actual Sell browser flow NOT RUN.
- `BookSearchPage.tsx` / module CSS diff: renderer injected only into Search
  classification, direct edition-language FilterSelect, nested desktop
  combobox/native-select label focus and removal of orphan conditionSelect selector. The final nested-control selector includes both desktop combobox inputs and native mobile selects, retaining wine classification labels for either focused renderer.
- Existing DESIGN, search-catalog-sidebar sidecar recipe, Search surface,
  PRODUCT, SESSION_STATE and READINESS establish the incumbent wine/cream
  Operate world and unchanged gates. Vendored documenter instructions and
  `reference/document.md` establish the narrow merge format.

## Recorded extension

Above900px:44px shelf-ground field, bottom rule/6px upper corners,13px/1.5
Be Vietnam Pro, same-input accent/case/đ-insensitive filtering. Current label
is the open placeholder. Paper listbox: field width,6px gap/padding,8px corners,
soft ink18% shadow,36px rows, up to288px height with thin contained scrolling
and above-field placement when useful. Twelve main choices include All; none
are removed to fit the popup. Selected wine600 text/15px check and active
inset wine stroke keep selected versus keyboard-active states distinct.

At<=900px: real44px native selects/16px chevrons inside the existing scrolling
dialog. Shared classification retains native default for Sell. Focus stays
on desktop input with active-option linkage; arrows/Home/End/Enter/Tab and
Escape/outside/blur/page-scroll/resize/Back have scoped close/selection behavior
and cleanup. No taxonomy, pruning, draft, Apply URL or API change. Local140ms
entry and170ms focus durations retain the owner's motion policy under either
OS preference. Forced-colors treatment is source-only, runtime NOT RUN.

## Capture inspection

Documenter reopened all seven local JPEG viewport crops:

| Capture | Actual raster | Observed scope |
| --- | --- | --- |
| [desktop](desktop.jpg) |1265×712| Bounded root list, selected All, scroll, compact field |
| [search](search.jpg) |1265×712| `khoa hoc` matches Khoa học / công nghệ |
| [empty](empty.jpg) |1265×712| Recoverable empty-query status; selected draft preserved |
| [subcategory](subcategory.jpg) |1265×712| Language subgroup uses the same picker recipe |
| [language](language.jpg) |1265×712| Edition-language list opens above with selected English |
| [mobile](mobile.jpg) |390×844| Native category/subcategory, chevrons, scrolling body/footer |
| [320](320.jpg) |320×740| Narrow native fields and footer remain inside dialog |

The five desktop captures use configured1280×720 viewport; mobile configurations
are390×844 and320×740. Reported320document width305px is a separate DOM measure;
JPEG raster size does not imply actual zoom or physical-device behavior.
Images prove appearance; interaction assertions below are implementer-reported.

Narrow final focus follow-up: documenter also reopened
[mobile-focus](mobile-focus.jpg), actual390×844, after the nested-control
selector was extended to native selects. It visibly shows the **Nhóm sách**
label and native bottom edge wine with **Tiếng Nhật** selected. Root reported
settled keyboard focus-visible:true, label/border `rgb(92, 2, 2)`, contiguous
wine1px bottom inset,44px control height and0.17s transition with browser
reduced-motion:true. These runtime measures are implementer-reported; this
documenter performed capture/source comparison only. The original seven
captures remain retained; this focused follow-up is additional evidence.

## Reported verification and limits

TypeScript/Vite build,80unit tests and lint PASS with5old Exchange warnings.
The two source-inspected new SSR tests verify native labels/selected child and
injected renderer parent/leaf/cleanup; documenter ran no product checks.
CUA preview keyboard/pointer selection/reset, draft Escape/reopen, Apply URL
`categoryId=languages.ja&language=en`, End/active-option scroll, empty Escape
preserving selection, outside/Tab-next-field, native44px/narrow fit and320doc305
PASS. One detector returned8old Search radius/color advisories, no rescan.
The unused selector removal after captures has no runtime consumer.

No backend/account/email/DB activity; actual Sell browser flow, Safari,
screen-reader speech, physical mobile, native app, forced-colors runtime,
full integration harness, live API, human review and CI NOT RUN.
This documenter performed source/capture comparison only. READINESS unchanged.

## Documentation boundary and drift

Updated `DESIGN.md` Search prose, only `search-catalog-sidebar` in
`.impeccable/design.json`, and the Search surface follow-up. Preserved all
tokens, other component recipes, historical evidence and unrelated teammate
WIP. Current extension details supersede older native-only Search wording;
the prior filter-focus/sort sections retain their dated evidence.

Not canonized or repaired: eight incumbent detector radius/color advisories,
other historical Auth/motion/compact-card descriptive drift and legacy surface
recipes outside this extension. Compact36px popup rows are a scoped dense list
recipe; closed fields/mobile controls retain44px and no global target rule is
redefined. No new visual world, raster asset, global token or acceptance claim.
