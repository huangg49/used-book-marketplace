---
version: 1
slug: "apps-user-web-src-pages-myauctionspage-tsx"
primary_target: "apps/user-web/src/pages/MyAuctionsPage.tsx"
related_targets: ["apps/user-web/src/pages/MyAuctionsPage.module.css", "apps/user-web/src/components/AuctionGallery.tsx", "apps/user-web/src/lib/account-navigation.ts", "apps/user-web/src/layouts/MainLayout.tsx"]
---

# Đấu giá của tôi — cập nhật12/10/2026

Mode: Operate. Inherited direction seed: `20e973c0`; code-led account extension
of the established wine/cream bookshop, no approved comp or new visual world.
THESIS: Show the member's relevant auctions and the next truthful action, with
payment urgency readable beside the book rather than invented dashboard metrics.
OWN-WORLD: Existing account shell/sidebar; Anton page title, Be Vietnam Pro row
facts, actual contained photos, wine selection/prices and quiet horizontal rules.
STORY: Choose all/active/payment/selling, scan standing and time, open the detail
to bid or pay, and page forward through the caller's own results.
FIRST VIEWPORT: Heading/explanation and discovery link, four wrapping view buttons,
then rows with 88px cover, flexible title/state and 180px price/action column.

## Current behavior and constraints

- `/my-auctions` is member-only within existing account navigation/session guards.
  Reads use the personal auction endpoint, with caller identity in the query key,
  URL `view` and opaque `cursor`. The cursor is server-bound to caller/view;
  switching view resets pagination. Next-page and return-to-first actions use
  server cursors, not fabricated counts, page totals or client-side public filtering.
- Views are “Tất cả”, “Đang diễn ra”, “Cần thanh toán”, “Phiên của tôi”. Reads
  refresh every 20 seconds and on mount. Rows show actual book/point, starting or
  current/final price, seller/bidder standing, remaining time and payment deadline.
  Payable rows link “Xem và thanh toán”; outbid active rows link “Xem để trả tiếp”.
  All commands stay on the detail surface. Personal read does not expose another
  bidder's identity or auto ceiling; no row invents private information.
- Expired payment countdown says it is updating rather than promising an active
  payment. State copy distinguishes on-hold/cancelled/unsold/payment-expired and
  already-paid results. Money and handover remain simulated.
- Loading is explicit; empty payment, seller, initial and cursor-page contexts
  retain distinct text and a public-discovery route. Initial/known errors offer
  retry. Transient network/server refresh errors retain cached rows with warning;
  denied 401/403 private reads hide cached rows and explain account/session access.
  Failed reads do not expose a next-page action from stale data.

## Accessibility and mobile

View navigation is labelled and selected button exposes aria-current. Result
region exposes fetching state; loading/status and errors use appropriate live
semantics. Titles wrap anywhere, metadata keeps readable line height, numeric
prices use tabular figures, and links/buttons have 44px minimum height. Shared
focus-visible styling remains. Below 700px the header stacks, rows use 64px cover
and flexible facts, and price/action moves below facts in the second column;
view buttons wrap. The surface adds no decorative motion or autoplay.

## Comparison and verification limits

Source/CSS and account screenshots extend DESIGN.md's account typography, compact
navigation, contained photographs and divided rows. This surface recipe is not a
new global palette or card system. Shelf and error roles bind the exact incumbent
values locally for covers and payment urgency. DESIGN.md/.impeccable/design.json are preserved;
existing Auction-scope prose remains outside this write boundary and is not
adopted as a rule.

[Auction evidence](../../../../.impeccable/review/auctions/README.md) records own
rows/payment-empty view, `mine-desktop.jpg`, transient 503 preservation in
`mine-refresh-error.jpg` and denied 403 hiding in `mine-access-denied.jpg`.
Recaptured `mine-mobile.jpg` and `mine-empty-mobile.jpg` visibly confirm the
stacked personal layout and distinct payment-empty state. Viewport readback is
390px; file content width is 375px with the stable 15px scrollbar gutter. All
normal captures use a restarted isolated fixture with the same book/intake
workflow. Browser JPEG files retain `.jpg`.

QA uses isolated Mongo/fake storage and labelled fixture covers; personal cursor
ownership/view tests and web checks are listed in the evidence report. The AI
finish verdict resolves three scoped fixes, not human review or a full-surface
re-review. Native, physical phone, Safari, speech screen reader, full 125%/200%
zoom, live Supabase, remote CI and release acceptance remain unverified. A populated
payment-urgency view was not captured; the payment screenshot proves the empty
state only.
