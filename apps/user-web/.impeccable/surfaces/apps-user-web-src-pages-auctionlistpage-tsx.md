---
version: 1
slug: "apps-user-web-src-pages-auctionlistpage-tsx"
primary_target: "apps/user-web/src/pages/AuctionListPage.tsx"
related_targets: ["apps/user-web/src/pages/AuctionListPage.module.css", "apps/user-web/src/components/AuctionCard/index.tsx", "apps/user-web/src/components/AuctionCard/AuctionCard.module.css", "apps/user-web/src/components/AuctionGallery.tsx"]
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

## Comparison and verification limits

Source/CSS plus `list-desktop.jpg`, `list-mobile.jpg` and `list-refresh-error.jpg`
in [auction evidence](../../../../.impeccable/review/auctions/README.md) support the
current recipe. The list retains the incumbent palette/type/material hierarchy;
these page-specific sizes are not new global tokens. DESIGN.md's older
introduction-only dimensions and statement that the rest of Auction is legacy
are stale; DESIGN.md and its sidecar remain unchanged by this scoped pass.
The page now binds the incumbent shelf, wine-hover and exchange-ink roles locally;
this resolves missing inherited role definitions without changing global tokens.

Evidence uses isolated QA Mongo/fake storage and labelled fixture covers, not
live listings or Supabase. Browser QA reports 1366×900/390×844 and filter/guide
checks; the finish verdict resolved three scoped fixes, not whole-product or human
acceptance. Native, physical phone, Safari, speech screen reader, full 125%/200%
zoom, remote CI and release gates remain unverified. See evidence for test counts.
