---
version: 1
slug: "apps-user-web-src-pages-booksearchpage-tsx"
primary_target: "apps/user-web/src/pages/BookSearchPage.tsx"
related_targets: ["apps/user-web/src/pages/HomePage.tsx","apps/user-web/src/pages/BookDetailPage.tsx","apps/user-web/src/pages/LoginPage.tsx","apps/user-web/src/components/BookCard.tsx","apps/user-web/src/components/Header.tsx"]
---

# Member web — logo mới và tiệm sách nhiều màu

Mode: operate. Target: apps/user-web/src/pages/BookSearchPage.tsx; related Home,
BookDetail, Login and shared Header/BookCard. Scope: browse, filter, inspect a used
copy, sign in and return to the book before explicitly reserving it.

User explicitly replaces the old green archival direction on 10/10/2026 with
their Logo.png and https://dribbble.com/shots/26947471-Bookstore-Landing-Page.
The three earlier sketches are superseded, not approved. Existing API, session,
purchase permissions and receipt/retry behavior remain authoritative.

## Direction contract

THESIS: A lively Vietnamese secondhand bookshop: covers invite exploration and
plain labels make finding and understanding a particular copy easy.

OWN-WORLD: Logo wine red and warm cream, with orange, yellow and mint display
grounds; tall Anton display headings, Be Vietnam Pro task text, full book covers,
quiet unboxed metadata and solid, generous controls.

STORY: Discover the shelves, search/filter real listings, inspect condition and
both prices, then understand that reserving opens a 24-hour chat without payment.

FIRST VIEWPORT: Wine header with the user's own owl and lettering; centered
three-line cream/yellow owner-supplied headline artwork between eight decorative cover positions: the
four existing positions and four owner-supplied images added on10/10. Desktop
uses two varied-size, lightly overlapping clusters, led by Alice on the left and Dược sư on the right (third cover of each group). The176px unit/432px stage keeps the established hero footprint; focal heights1.36/1.38 units sit at z2, companions0.88–1 unit at auto/z1. Each cover has its own offset, rotation and contained asset ratio. <=1100px all eight return to relative flow below search in eight columns; <=800px four columns. Focals scale1.08 in that flow without growing its layout footprint. Fine-pointer hover raises any cover to z3. A wide light
search field anchors the hero; a four-column newest shelf starts below. Search uses the compact wine title/search band,264px transparent borderless rail and28px gutter in its1360px container/40px outer padding. Its shelf has five columns from1440px,four by default,three at1150px and two at600px;at1150px the rail remains264px with24px gutter/padding. The rail hides only at900px and below for a named native filter dialog. It pins only when its complete height plus108px fits;long grouped filters scroll with the page. Search title is40px Anton/1.2,32px at600px;search sits right of the title on desktop and below at900px. Compact complete cover stages are200px,180px at1100px and160px at600px; Detail's selected complete
photograph, thumbnails, protected viewer and factual columns now follow its
dedicated `apps-user-web-src-pages-bookdetailpage-tsx.md` surface contract.

FORM: User-pinned bookstore reference overrides direction roll 20e973c0,
assigned index 5. Code-led; no new choice round. Signature: a single cover-fan
settle on Home; fine-pointer hover scales1.12 and lifts8px with deeper shadow,
restoring on exit. Owner explicitly requests hero motion regardless of OS
reduced-motion preference: sway and hover keep their duration. Owner subsequently
requested removal of manual pause and continuous sway during hover. Offscreen/
hidden guards remain. Visitors currently cannot stop the visible loop; this is
a known accessibility limitation, not acceptance PASS. Touch has sway but no hover zoom.
Actual listing photos never replaced
with stock. Illustration source caption stays visible.

Owner-approved Home refinement: original cream SVG page curls at the two outer
cover clusters and a small open-book drawing at the lower right. Static artwork
is aria-hidden/pointer-inert; smaller edge curls below1100, open book hidden
below600. The headline/search stay clear. Cover depth combines a thin cream
paper edge, contact shadow and a softer offset cast shadow, expanded on hover.

Laptop-height correction: above1100px wide and up to850px high, Home uses a
shorter stage with viewport-height-aware headline and a book unit clamp(116px,18vh,152px); each cluster stage is two units plus36px. The current cluster geometry is recorded in HomePage.module.css and .impeccable/design.json. The later owner request
adds20px breathing room before description/search and removes the control row:
at1536x730 hero469px, search y460px, first shelf heading finishes at646px.
Keep natural document growth at enlarged text sizes; no fixed-height cropping
or page scale. Header untouched; mobile description top margin increases8px.

Latest owner-pinned headline is Hero text final.png: SÁCH MỚI. CHƯƠNG MỚI.
CÙNG LẬT LẠI. Use the supplied pixels including illustrations/ornaments, never
retype/recreate the lettering. Transparent margins only removed,16px retained;
lossless1313x655 delivery. H1 equivalent text remains available to assistive
technology, image has empty alt/aria-hidden. Desktop cap36rem, below850px28rem;
short desktop cap uses min(100%,clamp(20rem,66vh,32.5rem)). Ratio preserved, no
cropping content. Existing used-book description distinguishes copy from listings.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Owner-approved BeeWise-style navigation refinement: use the existing shared
Header across Member web layouts and posting. Full-width76px at top; beyond48px
scroll,64px rounded floating bar at top16px/width min(1248px,calc(100% - 64px)),
at least32px on each side,32px corners and
soft offset shadow; return at<=16px to avoid threshold flicker. Stable76px slot
prevents document jumps. <=1000px uses logo/menu,72px slot,top10px/width calc(100% - 28px)/14px each side;
original logo windows shrink to82% at<=420px, all controls retain44px height.
Scrollable mobile menu, Escape/route/desktop-resize closure and narrow notification
popup verified. Owner then requests a more legible560ms inward morph with a transient
1.5px yellow outline, opacity0→80%→45%→0 over680ms, and a2.5px cream dash
travelling one perimeter lap over680ms before fading fully. Both accents are
pointer-inert,invisible at rest and appear during actual collapse only. State clears on animationend
or expansion and replays on the next collapse, not every scroll event. The finite
560ms morph/680ms one-shot accents remain visible on the owner's reduced-motion laptop; separate
scoped exception, no global preference change. Passive threshold-only updates;
no new library, copy, session or API changes.

Open dependency: Dribbble supplies a composite preview, no separate cover assets;
use existing public-domain covers and the four images the owner supplied directly
for decorative imagery. Caption distinguishes them from listing photographs.

## Contextual Search extension — approved11/10/2026

Operate; code-led ordinary extension after `aadbd88`. Preserve the incumbent
wine/cream world, Anton/Be Vietnam Pro, shared Header, compact whole-cover cards,
Home composition/motion and all session, eligibility and retry semantics. This
section supersedes earlier Search-only preview categories, condition controls and
“every control fits one laptop viewport” rules. Canonical source-derived visual
rules and the matching sidecar recipe are in root DESIGN.md and
`.impeccable/design.json` (`search-catalog-sidebar`).

Shared `CatalogClassificationFields` drives live and DEV preview: native category
and optional subcategory selects, contextual facet disclosures, optional Manga/LN
series, then native single-choice condition radios, mode-appropriate sale/exchange ranges and edition
language. `catalog-v1` has11 roots/29 nodes/16 controlled facet types. The first
two groups and selected groups start open. Initially show five options plus
selected values; Xem thêm/Thu gọn exposes the rest. Summaries, checkbox labels,
fields, preset buttons and actions retain44px targets;17px wine-accent checkboxes
sit beside readable Be Vietnam Pro labels. Multiple values in a group are OR;
groups/common criteria are AND; parent categories include children. Exam levels
depend on target language+purpose and grades on school stage; context/chip changes
prune incompatible selections. Edition language is separate from study language.
Series requires its full name and matches NFC/case-insensitively.

The264px/28px rail is transparent and borderless,with no outer panel radius and
padding0 16px 0 0;1150px uses24px gap/outer padding. Its wine18px/1.5 heading has
16px bottom padding,shop-line underline and24px bottom margin. Filter-body groups
have24px gap. Edition-language selects use shelf ground,a1px
shop-control bottom edge and6px upper corners. A Search-only classification wrapper
applies that field treatment,10px inner gap and12px margin before disclosures;
the shared Sell component keeps its own styling. Four condition states and an all-condition option are visible as native radios with44px label targets and17px wine controls. Selected category/facet/series/condition/range/language groups expose a44px underlined Xóa action; each updates only its draft, prunes incompatible dependent classification values and moves focus to its remaining input/select/summary. Facet choice counts use a separate12px muted regular line; condition/language show1 đã chọn and ranges show Đã chọn khoảng. These are selection counts, not result counts. Classification clearable defaults false outside Search. ResizeObserver
and viewport resize allow sticky only when complete panel height+108px fits;
top92px,88px at901–1000px. A longer panel scrolls with the document, without a
height clamp or nested rail scroll. Desktop retains the rail at heights<=700px;
the short-desktop8px head padding/32px title/16px catalog inset remain. Search
band otherwise uses16px40px20px;900px stacks title/search with18px gap;600px uses
22px16px24px/16px gap. Grid gaps28px20px,24px14px at600px;existing compact covers
and two-line titles keep their full DOM/accessibility/tooltip text.

Sale mode shows sale bounds; Exchange shows exchange bounds; all/Both show sale
bounds plus the optional Khoảng giá trị đổi disclosure. Both ranges require both
criteria. Currency legends precede two full-width stacked44px price fields with
8px gap,inline28px Từ/Đến labels and14px tabular inputs. One1px shop-control/6px
wrapper owns focus;the12/10 follow-up below replaces its former outer outline
with a contiguous boundary/inset;the input has no second ring.
Three equal preset columns retain8px gap,12px top margin and44px targets. Visible
≤ 50k/≤ 100k/≤ 200k labels have full-currency maximum accessible names;idle shelf
ground turns wine/cream on hover or selection. Bounds are whole numbers
10.000–1.000.000₫,ordered;invalid input retains its value and linked message,with
Apply disabled. Draft fields commit only on Áp dụng;Xóa lựa chọn clears the
draft and Apply commits that reset. A shop-line divider/16px top padding precedes
the helper,full-width wine Apply and borderless underlined reset in one column
with4px gap;both actions retain44px targets. Desktop footer stays transparent.

<=900px uses a named native dialog: protected focus,labelled44px close,Escape
and native focus return. Body locks only while open and restores on close/unmount;
resize>=901px closes regardless of height. The mounted mobile form retains drafts
across dismiss/reopen until applied URL state changes. Only its body scrolls;
Apply/Reset stay outside that region. Paper16px radius,24px padding (20px at600px),
width min(460px,calc(100% - 24px)),max-height calc(100dvh - 32px),
shadow0 16px 48px #28191440 and backdrop#28191480 remain Search-scoped.

URL carries q/mode/condition/categoryId/language/series/JSON facets/sort,
minSalePrice/maxSalePrice/minExchangeValue/maxExchangeValue/cursor;limit20.
Known old category links map to categoryId;live strips old category without
mutating caller query. Criteria changes clear cursor;mode clears both ranges
and sort. Typing replaces history;committed changes support Back. Removable
chips preserve dependency pruning. Clear keeps q and explicit data selector.
Apply focuses/scrolls result heading;cursor navigation focuses it. Malformed
facet JSON or scalar/array values show Bộ lọc chưa hợp lệ with clear recovery
and no query. Keep loading,empty,error,retry and page-only counts.

DEV preview97 Open Library editions is explicit/labelled;prices,conditions and
classification enrichment are sample data. data=live uses API;production has no
preview and live failures never fall back. Filtering precedes pagination;
live cursor scope uses normalized criteria,preview keeps a separate branch.
Shared classification is also used for new posting proposals or immutable
confirmed-book metadata,and Admin reads labels in the existing review workflow;
no Admin vocabulary CRUD. API/Mongo/contract changes are documented in
`docs/design/CATALOG_CONTEXTUAL_FILTERS.md` and ADR0033. Search150ms control
button feedback retains its existing global reduction;filter focus follows the
12/10 owner policy below. Shared card hover is governed by the later scoped
catalog-card-depth recipe in DESIGN.md;no Home autoplay is adopted.

The owner rejected the dense boxed form and cramped price pair after the
contextual extension. This11/10 Search-only visual refinement keeps classification,
query/URL,API,native controls and dialog behavior;it makes no DB changes.
Evidence: all seven `.impeccable/review/web-member/filter-refine-*.png` captures
were opened by this documenter: desktop,laptop,390px/320px mobile,price focus and
contextual desktop/mobile. Appearance is observed;interaction/test results are
implementer-reported. Independent reviewer SHIP is scoped to five resolved
material fixes,with no material regression observed in that batch;no full-surface
or human acceptance claim. Reported Web34unit/typecheck/build PASS,lint0errors/
5known warnings,one detector[];CUA1535/1366/390/320 without overflow,invalid
1.000.001/valid1.000.000,draft Escape/reopen,Apply URL/body unlock PASS. This
documentation pass ran no new product tests/browser interaction. Main DB/new
Mongo QA,native,200% zoom,OS keyboard,live Supabase,full integration and human
review remain NOT RUN;READINESS unchanged. Earlier API/Mongo evidence remains
at its recorded source in `docs/design/CATALOG_CONTEXTUAL_FILTERS.md`.

## Filter focus follow-up — owner-approved12/10/2026

User direction: apply the same clean focus as Sell to the filters. This is a
narrow Operate extension on `codex/search-filter-focus`, base `2672532`; the
only product diff is BookSearchPage.module.css. The transparent264px rail,
wine/cream/ink world, Anton/Be Vietnam Pro pairing, named mobile dialog and
classification/draft/URL/API semantics remain. Shared CatalogClassificationFields
and global CSS are unchanged.

Filter text inputs and native selects remove the outer outline. Focus colors
their existing boundary wine; keyboard focus adds an inset1px wine bottom edge
touching that boundary. Native category/subcategory/edition-language selects
keep their shelf-ground bottom rule; series retains the incumbent full frame
visible in source cascade and captures. Associated classification labels turn
wine. Stacked price bounds retain their full wrapper frame: focus changes its
existing1px edge to wine; keyboard focus adds a contiguous inset1px frame on all
sides. Từ/Đến turns wine; the price input has no second ring. Aria-invalid price
wrappers use the existing rust error role for boundary/inset/focused prefix.
Transitions are170ms ease-out for boundary/inset and label/prefix color, with
local important duration overrides retaining motion under either OS preference.
Forced-colors source replaces the inset shadow with a2px Highlight outline at
−2px offset, on the wrapper for price; this fallback has no runtime evidence.
Radios, checkboxes, buttons, disclosures, heading search and sort keep their
existing focus treatments.

Documenter opened all seven viewport captures in
`.impeccable/review/search-filter-focus/`: desktop, category, series, error,
mobile, mobile-series and320. These are scrolled viewport crops, not full-page
acceptance. Images show the contiguous wine category/price boundaries and rust
invalid price boundary; the desktop series crop does not alone establish its
focused computed style. Reported CUA1280×720/390×844/320×740 checked native
category/series/price/error focus, Apply URL, draft Escape/reopen and320px
overflow; actual reduced-motion:true retains170ms feedback. Build(TS/Vite) PASS.
Nine detector advisories concern incumbent radius/colors outside the product
diff. This documentation pass runs no new tests, browser interaction or
detector. Unit/lint, forced-colors runtime, Safari, speech, physical mobile/native,
full API/integration, human review and CI are NOT RUN for this extension;
READINESS remains unchanged. Source comparison and inherited artifact drift:
`.impeccable/review/search-filter-focus/documentation.md`.

## Sort dropdown follow-up — owner-approved12/10/2026

Operate; narrow extension on `codex/search-sort-dropdown`, base `a3f4d13`.
The owner rejected the detached double outline and gray browser popup in the
supplied sort screenshot. Preserve the existing wine/cream/ink world,
Anton/Be Vietnam Pro,264px rail, search band, compact cards, five sort values
and existing URL/API behavior. Active BookSearchPage now composes controlled
CatalogSort; its former native-sort CSS is removed. Legacy BookSearch and
SortDropdown remain outside this route and unchanged.

Above600px a labelled paper button opens a right-aligned252px paper menu with
6px padding,8px corners and soft ink18% shadow,8px below the trigger. Trigger
min194px width/min44px height,6px corners,13px/1.5 Be Vietnam Pro and16px wine
chevron. Options retain44px targets,10px12px padding,4px corners and13px task
text; current selection is600-weight wine with a16px check. Hover/keyboard
focus uses shelf ground; focus has an inset1px wine stroke. Trigger/native
focus colors the existing frame wine and adds that contiguous inset stroke,
with no detached outline. At<=600px the custom menu/visible label hide and a
native select retains44px height,12px text and190px maximum width.

The expanded/controls/label-bound trigger and menu-radio items focus the current
item on open. Arrows wrap, Home/End move, Enter/Space select, Escape closes and
returns trigger focus. Open typeahead uses accent-normalized case-insensitive
prefixes and a600ms event-timestamp window. Outside pointer, focus departure,
resize and browser Back close it; while open, resize/Back transfers owned focus
to the visible native picker or trigger. Listeners clean up on close/unmount.
Native-select keyboard handling passes directly to the browser. Existing
onChange updates sort and clears cursor through the route's update function.
Preview uses Thứ tự mặc định; live uses Mới đăng for newest.

Trigger border/inset feedback is170ms ease-out; menu settles from translateY4px
to0 over140ms cubic-bezier(.16,1,.3,1). Scoped important durations retain both
under either OS motion preference. Forced-colors source supplies a CanvasText
menu border and inset Highlight focus outline; runtime NOT RUN.

Documenter reopened corrected native JPEG desktop/selected/closed/tablet/mobile/
320.jpg plus the owner's rejected screenshot. Captures show the scoped popup,
checked wine selection,closed trigger and native narrow fit;320.jpg now shows
loaded first-row covers and no stale blank right band. Actual JPEG rasters are
1265×712 desktop/selected/closed,753×882 tablet,375×812 mobile and305×705 at320;
configured browser viewports were1280×720/768×900/390×844/320×740. Reported320
DOM inner320×740/client305×740/document width305px; screenshot backend heights
differ, so raster dimensions do not establish matching DOM height or actual125%
zoom. Reported TS/Vite build,78existing unit tests and
lint0errors/5old Exchange warnings PASS. Reported CUA1280×720/768×900/390×844/
320×740 open/selectURL/keyboard/typeahead/outside/Tab/Back/native arrows/resize
focus PASS; actual reduced-motion:true retains140ms,320px document width305px.
One detector pass had9advisories:8incumbent radius/colors and an initial new
shadow RGB replaced by canonical ink color-mix; no rescan. Integration selector
was updated for the actual custom menu; full harness NOT RUN because older
unrelated selectors remain. This documenter ran no tests/browser/detector.
No DB writes,real email,login or backend checks;forced-colors runtime,Safari,
speech,physical mobile,native app,human review and CI NOT RUN. READINESS/WIP
remain unchanged. Source comparison and drift:
`.impeccable/review/search-sort-dropdown/documentation.md`.

## Compact filter-dropdown follow-up — owner-approved12/10/2026

Operate; narrow extension on `codex/search-compact-dropdowns`, base `66a79bb`.
The owner wants nicer filter dropdowns while keeping many categories compact.
Preserve wine/cream/paper/ink/shelf, Anton/Be Vietnam Pro, the264px rail,
search band, cards and draft/Apply URL/API behavior. Search supplies optional
`renderSelect` to shared CatalogClassificationFields and directly composes
FilterSelect for edition language. Default classification rendering remains
native for Sell. The subcategory label uses explicit htmlFor/id inside the
same flex wrapper; source cleanup removes the unused conditionSelect selector.

Above900px, the editable combobox uses the existing44px shelf-ground bottom-rule
field,6px upper corners,13px/1.5 task text and a16px wine chevron/search icon.
Its selected label becomes the placeholder when open; the same input filters
labels by case/accent/đ-insensitive substring. The fixed portal listbox anchors
to the field width with6px gap and opens above when below is short and above
offers more room. Paper,8px corners,6px padding and soft canonical ink18%
shadow extend the existing sort popup recipe. Rows are36px minimum with7px8px
padding/4px corners; the list is capped at288px, adjusted to available room,
showing about7.5 rows with its own thin contained scroll. All12 main options
including Tất cả danh mục remain reachable. Selection uses wine600 text/a15px
SVG check; hover/active uses shelf ground and active has an inset1px wine stroke.
Empty search exposes the recovery status without changing selection.

Focus stays in the expanded/controls/autocomplete-list-labelled input, with
aria-activedescendant on its current option and associated category labels. Both nested desktop combobox and native mobile select focus turn classification labels wine.
Arrows wrap, Home/End move, Enter selects and Tab closes. Escape/outside/blur/
page scroll/resize/Back close; popup scrolling stays open. Listeners clean up
on close/unmount; viewport subscription cleans up and a focused desktop picker
moving below the breakpoint focuses the native replacement. At<=900px,
real native44px selects with16px chevrons fit the scrolling filter dialog.
Taxonomy, compatible-attribute pruning, dependent series cleanup, draft reset
and Apply remain with existing classification/form logic. Filter entry140ms
and boundary/inset170ms remain under either OS motion preference through local
important durations. Forced-colors source supplies CanvasText popup border and
inset Highlight active/focus treatment; runtime NOT RUN.

Documenter reopened all seven native JPEG viewport crops in
`.impeccable/review/search-compact-dropdowns/`: desktop/search/empty/subcategory/
language are1265×712 from configured1280×720; mobile/320 rasters are390×844 and
320×740. Desktop captures show the bounded root list, khoa hoc matching science,
empty recovery, optional language subgroup and edition language opening above.
Mobile/320 show Học ngoại ngữ with native subgroup/chevrons and protected footer.
Raster dimensions are recorded separately from the reported320px document
width305px; no actual zoom or physical-device acceptance is inferred.

Implementer-reported TypeScript/Vite build,80unit tests and lint PASS with5old
Exchange warnings. Two inspected new SSR regressions cover default native
rendering/associated labels/selected child and injected parent/leaf controls/
dependent cleanup; they do not prove an actual Sell browser flow. Reported CUA
preview keyboard/pointer/select/reset, draft Escape/reopen, Apply URL
`categoryId=languages.ja&language=en`, End/active-option scroll, empty Escape
preserving selection, outside/Tab-next-field, narrow44px and320doc305 PASS.
One detector had8old Search radius/color advisories; no rescan. Documenter ran
no product tests/browser/detector. Backend/account/email/DB activity was absent;
Safari/speech/physical mobile/native app/forced-colors runtime/full harness/
live API/human/CI NOT RUN. READINESS and unrelated WIP remain unchanged.
Source comparison and inherited drift:
`.impeccable/review/search-compact-dropdowns/documentation.md`.
