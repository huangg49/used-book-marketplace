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
search field anchors the hero; a four-column newest shelf starts below. Search
uses a compact wine title/search band,216px left condition/price sidebar and
36px gap to the results (1360px container/40px padding). Its shelf has five
columns from1440px, four by default, three at1150px and two at600px; the
sidebar becomes190px/gap24px at1150px, then hides at900px for a labelled
native filter dialog. Search title is40px Anton/1.2,32px at600px. Search sits
to the right of the title on desktop and below it at900px. Compact complete
cover stages are200px,180px at1100px and160px at600px; Detail's selected complete
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

## Search refinement — approved11/10/2026

The approved remaining-pages plan section1 is implemented for `/books` only.
The shared Header, Home/RN recipes and API/session contract remain authoritative.
Search uses the existing compact BookCard/HomeBookCard rendering: complete contain
images, visible condition, separately labelled prices and truthful image retry.
Compact titles show two lines while full DOM/accessibility/tooltip text remains.
Desktop grid gaps are28px20px; at600px they are24px14px. The short title/search
band uses24px40px28px padding and0.75fr/1.25fr columns with40px gap. At1150px
outer padding is24px; at900px search moves below the heading; at600px the band
uses22px16px24px padding and16px gap, catalog padding12px16px0.

Modes are mutually exclusive pressed buttons with a3px wine selected underline.
Condition and sale-price drafts are committed by **Áp dụng bộ lọc**;
**Đặt lại lựa chọn** clears the draft, then Apply commits that reset. Applied
condition/price chips, presets, fields, search, sort, pagination and retry have
44px minimum targets. Invalid prices retain entered values and a linked message;
Apply is disabled until nonnegative whole-number bounds are ordered correctly.

Below/equal900px, the named native `<dialog>` protects modal focus, closes via
its labelled44px button or Escape, and returns focus through native dialog
behavior. Body scroll locks only while open, with cleanup on close/unmount;
resizing above900px closes it. The paper panel is16px rounded with24px padding
(20px at600px), width `min(460px, calc(100% - 24px))`, max-height
`calc(100dvh - 32px)` and internal vertical scroll. Shadow is
`0 16px 48px #28191440`; backdrop `#28191480`. Search focus is a2px wine outline
at4px offset, yellow inside the wine head.

URL fields remain `q`, `mode`, `condition`, `sort`, `minSalePrice`,
`maxSalePrice`, `cursor`; requests use `limit=20`. Changing a filter/search/sort
clears cursor; typing replaces history, committed changes support browser Back.
Cursor paging focuses the result heading. Counts explicitly cover this page,
not a total; there is no category catalog filter/API. Loading, empty, error,
invalid-price and retry states remain concrete.

DEV preview is explicit `data=preview` or the configured preview flag and uses91
cached Open Library editions; `data=live` selects API behavior and production
preview is disabled. Preview covers/source links and sample prices/conditions
are labelled separately from listings. Preview query/cursors use their own
branch; live errors never become sample success. Search controls use150ms
ease-out color/background feedback and shared card hover follows global motion
reduction. No Home motion exceptions or decorative loops are adopted here.

Desktop/laptop/mobile/320px/filter captures:
`.impeccable/review/web-member/search-shelf-{desktop,laptop,mobile,320,filters}.jpg`.
These record UI composition, not native or human acceptance. Current QA and
remaining gates live in WEB_MEMBER_REDESIGN/SESSION_STATE/READINESS.
