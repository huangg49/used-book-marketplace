---
version: 1
slug: "apps-user-web-src-pages-auctionlistpage-tsx"
primary_target: "apps/user-web/src/pages/AuctionListPage.tsx"
related_targets: ["apps/user-web/src/pages/AuctionListPage.module.css", "apps/user-web/src/components/AuctionCard/index.tsx", "apps/user-web/src/components/AuctionCard/AuctionCard.module.css", "apps/user-web/src/components/AuctionGallery.tsx", "apps/user-web/src/components/AuctionGrid.tsx", "apps/user-web/src/components/AuctionPrice.tsx", "apps/user-web/src/hooks/useAuctionMotion.ts", "apps/user-web/src/lib/auction-motion.ts"]
---

# Đấu giá — danh sách phiên, cập nhật12/10/2026

Mode: Operate. Inherited direction seed: `20e973c0`; established wine/cream
penguin world, code-led extension; no new world or composition workshop.
THESIS: Explain participation briefly, then let actual books, prices and end times
lead browsing. The compact introduction supports the task rather than delaying it.
OWN-WORLD: Existing wine/cream bookshop; Anton introduction, Be Vietnam Pro book
facts, quiet dividing rules and the existing static transparent auction penguin.
No new visual world, approved image comp, generated book cover or trust claim.
STORY: Read the optional three-step guide; filter by collection point or buy-now
availability; sort the loaded sessions; open one book's auction or the personal view.
FIRST VIEWPORT: Bounded 1248px page, 20–40px responsive gutters. Introduction places
prose beside 200px art with 32px gap; title 32–44px/1.3, body 15px/1.8. Below 700px art
is 108px with 12px gap; below 400px it disappears. Guide is a native closed details
disclosure, opening three columns on desktop and one below 700px.

## Current behavior and constraints

- Horizontal criteria preserve `point`, `buyNow` and `sort` in the URL. The shared
  FilterSelect provides a searchable desktop combobox and native select at 900px
  and below. Below 700px criteria stack at full width, followed by the checkbox;
  scoped native-select appearance removes the duplicate chevron.
- Four/three/two book columns at desktop/1000px/700px. Contained actual revision
  photos sit on sand grounds; unboxed metadata distinguishes starting/current
  price, bidder count, end time, point and optional buy-now price. Card titles
  clamp visually to two lines; the detail contains the complete wrapping title.
- The public query returns up to 50 sessions. Point/buy-now criteria and all sorts
  operate on this loaded set; the limit notice appears when 50 are returned. No
  private participation read per card, invented totals or public auto ceilings.
- Live updates have a 30-second REST fallback. Countdown uses server time; client
  time never establishes the winner. Intro art is decorative, empty-alt,
  pointer-inert, async-decoded and intrinsically sized; it proves no book custody.
- Initial loading has four skeletons. Initial/known read failure offers retry and
  keeps URL choices. Transient network/server refresh failure retains cached
  cards with an explicit stale-price warning and retry. Empty matching results
  clear filters; an empty unfiltered shelf links to book search.
- Labelled filter group/controls, native checkbox/disclosure, result status and
  error alerts retain keyboard access. Links/actions are at least 44px tall;
  shared focus-visible treatment applies. Simulation and TP.HCM scope stay visible.

## Motion and interaction

- Actual prices appear immediately. A changed price for the same auction gets
  finite paper-yellow emphasis and a 3px arrival over 500ms; initial values,
  unchanged snapshots and a different auction identity establish a baseline.
- Filtering/sorting moves retained keyed cards between their measured positions
  over 220ms. A rapid reversal starts from the currently displayed position and
  cancels the preceding motion. Links/focus stay attached to the same cards;
  new cards are immediately readable and removed cards leave no delayed copies.
- Fine-pointer hover or keyboard focus lifts the cover 3px over 220ms and moves
  the action arrow 2px right/up over 170ms. Touch browsing needs no hover state.
  Countdown updates have no per-second animation or client-side winner feedback.
- Local motion retains the owner's11/10 policy even when the browser reports
  reduced motion. WAAPI skips hidden/offscreen targets, cancels when the document
  hides and cleans up on interruption/unmount; returning does not replay a backlog.
  Without WAAPI, current content and actions remain immediately usable.

## Comparison and verification limits

Source/CSS plus `list-desktop.jpg`, `list-mobile.jpg` and `list-refresh-error.jpg`
in [auction evidence](../../../../.impeccable/review/auctions/README.md) support the
current recipe. The list retains the incumbent palette/type/material hierarchy;
these page-specific sizes are not new global tokens. DESIGN.md's older
introduction-only dimensions and statement that the rest of Auction is legacy
are stale, as is its older reduced-motion guidance for this scoped policy.
DESIGN.md and its sidecar remain unchanged by this ordinary extension.
The page now binds the incumbent shelf, wine-hover and exchange-ink roles locally;
this resolves missing inherited role definitions without changing global tokens.

Evidence uses isolated QA Mongo/fake storage and labelled fixture covers, not
live listings or Supabase. Browser QA reports 1366×900/390×844 and filter/guide
checks; the finish verdict resolved three scoped fixes, not whole-product or human
acceptance. Native, physical phone, Safari, speech screen reader, full 125%/200%
zoom, remote CI and release gates remain unverified. See evidence for test counts.

[Motion evidence](../../../../.impeccable/review/auction-motion/README.md) and its
`runtime.json` add desktop/mobile list captures, native/custom sorting, buy-now
filtering, interrupted position changes and keyboard cover/action checks.
Chromium actually reported reduced motion enabled; DOM samples captured nonzero
card offsets during interrupted motion. The independent finish disposition was
ship with no material fixes. The evidence records 109 unit tests, build/TypeScript
PASS and lint with zero errors/five existing Exchange warnings. Hidden-tab and
missing-WAAPI behavior have unit coverage, not browser proof; captures/samples
provide no continuous FPS/CPU trace or physical-phone acceptance. No API, auth,
session, database, dependency or release-gate change is implied.
