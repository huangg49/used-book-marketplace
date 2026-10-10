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
uses two2x2 flanks; <=1100px all eight move below search, <=800px grid4x2. A wide light
search field anchors the hero; a four-column newest shelf starts below. Search
puts its field above a compact filter rail and four-column covers; detail pairs
one large complete photograph with readable metadata and purchase explanation.

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
shorter stage with viewport-height-aware headline/covers. The later owner request
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

Open dependency: Dribbble supplies a composite preview, no separate cover assets;
use existing public-domain covers and the four images the owner supplied directly
for decorative imagery. Caption distinguishes them from listing photographs.
