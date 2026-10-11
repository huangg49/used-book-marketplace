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
scroll,64px rounded floating bar at top12px/max1280px/side clearance24px, with
soft offset shadow; return at<=16px to avoid threshold flicker. Stable76px slot
prevents document jumps. <=1000px uses logo/menu,72px slot,top8px/side10px;
original logo windows shrink to82% at<=420px, all controls retain44px height.
Scrollable mobile menu, Escape/route/desktop-resize closure and narrow notification
popup verified. Owner then requests a more legible360ms morph with a transient
1.5px cream edge, opacity0→65%→0 during collapse only. It clears on animationend
or expansion and replays on the next collapse, not every scroll event. The finite
360ms morph/edge remain visible on the owner's reduced-motion laptop; separate
scoped exception, no global preference change. Passive threshold-only updates;
no new library, copy, session or API changes.

Open dependency: Dribbble supplies a composite preview, no separate cover assets;
use existing public-domain covers and the four images the owner supplied directly
for decorative imagery. Caption distinguishes them from listing photographs.

## Contextual Search extension — approved11/10/2026

Operate; code-led ordinary extension after `aadbd88`. Preserve the incumbent
wine/cream world, Anton/Be Vietnam Pro, shared Header, compact whole-cover cards,
Home composition/motion and all session, eligibility and retry semantics. This
section supersedes earlier Search-only preview categories, condition radios and
“every control fits one laptop viewport” rules. Canonical source-derived visual
rules and the matching sidecar recipe are in root DESIGN.md and
`.impeccable/design.json` (`search-catalog-sidebar`).

Shared `CatalogClassificationFields` drives live and DEV preview: native category
and optional subcategory selects, contextual facet disclosures, optional Manga/LN
series, then native condition, mode-appropriate sale/exchange ranges and edition
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
have24px gap. Native condition/edition-language selects use shelf ground,a1px
shop-control bottom edge and6px upper corners. A Search-only classification wrapper
applies that field treatment,10px inner gap and12px margin before disclosures;
the shared Sell component keeps its own styling. ResizeObserver
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
wrapper receives the2px wine focus outline/2px offset;the input has no second ring.
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
feedback/shared card hover follows global motion reduction;no Home exceptions.

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
