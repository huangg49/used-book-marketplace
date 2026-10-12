# Search sort dropdown — documentation comparison12/10/2026

Branch `codex/search-sort-dropdown`, base `a3f4d13`. The owner rejected a
detached double focus outline and gray browser popup around **Sắp xếp**.
This narrow Operate extension preserves PRODUCT.md's Search task and the
incumbent wine/cream/ink world, Anton/Be Vietnam Pro,264px rail, compact cards
and search band. It changes the active route's sort control only.

## Source and recorded system

Compared `CatalogSort.tsx`, `CatalogSort.module.css` and the BookSearchPage
TSX/CSS diff with DESIGN.md, its sidecar and the Search surface brief. Wrote
the narrow Search sort paragraph, the `search-catalog-sidebar` recipe and
surface follow-up. Frontmatter primitives, other recipes and teammate WIP are
preserved. The shipped recipe is:

- Above600px: controlled paper trigger,1px control frame,6px corners,min194px
  width/min44px height,13px/1.5 Be Vietnam Pro,16px wine chevron; muted12px
  visible label. Below or at600px: native picker,min44px/max190px,12px text.
- Right-aligned252px paper menu,8px below trigger,6px padding,8px corners,
  `0 8px 28px color-mix(in srgb, var(--shop-ink) 18%, transparent)` shadow.
  This soft popup depth is scoped to sort and does not establish a card rule.
- Options are44px targets with10px12px padding,4px corners and13px task text.
  Checked value is wine600 with16px SVG check. Hover/keyboard focus uses shelf
  ground; keyboard focus adds an inset1px wine stroke. Trigger/native focus
  colors the existing frame wine with the same contiguous inset, no second
  detached outline.
- Trigger border/inset170ms ease-out; menu4px upward settle140ms
  cubic-bezier(.16,1,.3,1). Scoped important durations preserve owner motion
  policy under either OS preference. Forced-colors menu border/focus fallback
  exists in source; runtime is NOT RUN.
- Label-bound expanded/controls trigger, menu-radio selection, roving tabindex,
  current-item focus, arrows/Home/End, Enter/Space, Escape with trigger return
  and accent-normalized prefix search with600ms event timestamp window.
  Outside pointer/blur departure/resize/Back close it; open-menu resize/Back
  transfers owned focus to the visible control; effect listeners clean up.
  Native keyboard events pass directly to the browser.
- Five existing sort values remain; preview newest says **Thứ tự mặc định**,
  live says **Mới đăng**. Selection calls existing `update("sort", value)`;
  no query/API logic change. Legacy BookSearch/SortDropdown are unchanged and
  unused by the active route.

## Evidence comparison

Reopened all six corrected native JPEG captures: [desktop](desktop.jpg),
[selected](selected.jpg), [closed](closed.jpg), [tablet](tablet.jpg),
[mobile](mobile.jpg), [320](320.jpg). Also opened the supplied owner screenshot
from the local clipboard path. Desktop shows the paper menu aligned with the
trigger and selected row's wine check; selected shows **Giá bán giảm dần**
checked, with matching trigger text and reordered sample covers. Closed shows
the resting single frame. Tablet retains the custom menu beside the filter
button; mobile and320 show the native picker fitting the toolbar, selected
descending price and loaded first-row covers. The replacement320.jpg has no
stale blank right band or pending-result content from the superseded PNG.

Actual JPEG raster sizes are1265×712 for desktop/selected/closed,753×882 for
tablet,375×812 for mobile and305×705 for320. Configured browser viewports were
1280×720,768×900,390×844 and320×740 respectively. At320 the implementer measured
DOM inner320×740,client305×740 and document width305px. The screenshot backend
returns different raster heights; these sizes do not establish matching DOM
height or actual125% zoom. These are viewport captures; images substantiate
appearance, not behavior or full-page acceptance.

Implementer-reported TS/Vite build PASS,78existing unit tests PASS and lint
0errors/5old Exchange warnings. CUA1280×720/768×900/390×844/320×740 PASS for
open/select URL,keyboard/typeahead,outside pointer,Tab/Back,native arrows and
resize focus; actual reduced-motion:true retained140ms entry,320px document
width305px. One detector pass yielded9advisories:8incumbent Search radius/color
findings plus initial new shadow RGB; source now uses canonical ink color-mix.
No rescan occurred. Integration selector now follows the actual custom menu;
the full harness was NOT RUN because older unrelated selectors remain.

This documenter ran no product tests, browser interactions or detector. No DB
writes,real email,login or backend checks. Forced-colors runtime,Safari,speech,
physical mobile,native app,human review and CI are NOT RUN. READINESS remains
unchanged; this documentation makes no release/native/human acceptance claim.

## Drift not canonized or repaired

Older sidecar static Search snippets retain former outer price focus and do
not fully model later condition/reset controls; the broad narrative retains
stale Auth availability/global-motion text. PRODUCT.md also contains historical
scaffold statements. These inherited artifacts are outside the recipe-only
boundary and preserved. The current Search sort paragraph, recipe and surface
follow-up agree with shipped source. Existing radius/color advisories are not
new primitives; no forbidden hard shadow, glyph icon or display face is
canonized. Teammate Chat/Home/layout/notification WIP is untouched.
