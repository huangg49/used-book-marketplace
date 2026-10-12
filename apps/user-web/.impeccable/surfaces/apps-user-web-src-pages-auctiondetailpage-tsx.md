---
version: 1
slug: "apps-user-web-src-pages-auctiondetailpage-tsx"
primary_target: "apps/user-web/src/pages/AuctionDetailPage.tsx"
related_targets: ["apps/user-web/src/pages/AuctionDetailPage.module.css", "apps/user-web/src/components/AuctionGallery.tsx", "apps/user-web/src/components/AuctionGallery.module.css", "apps/user-web/src/components/AutoBidDialog/index.tsx", "apps/user-web/src/components/AutoBidDialog/AutoBidDialog.module.css", "apps/user-web/src/components/AuctionPrice.tsx", "apps/user-web/src/components/AuctionReceipt.tsx", "apps/user-web/src/components/AuctionReceipt.module.css", "apps/user-web/src/hooks/useAuctionMotion.ts", "apps/user-web/src/lib/auction-motion.ts"]
---

# Chi tiết đấu giá — cập nhật12/10/2026

Mode: Operate. Inherited direction seed: `20e973c0`; code-led extension of the
existing wine/cream bookshop. No approved image comp or new visual world.
THESIS: Judge this inspected book and the actual auction state, then deliberately
confirm a price. Manual bidding is primary; private automatic bidding is secondary.
OWN-WORLD: Be Vietnam Pro wrapping title/facts; wine prices/actions, contained
book photos on sand, paper bidding panel and quiet rules. Anonymous price history
uses factual aliases; no invented identity, rating, guarantee or collectible claim.
STORY: Inspect photos/condition, check time and price, choose a manual amount or
private ceiling, confirm, and read the server result. The winner follows the real
payment state; post-payment copy does not imply collection/settlement is complete.
FIRST VIEWPORT: 1248px bounded page; full-width title above gallery and 340–400px
sticky bid panel. At 960px and below, order is title, gallery, bid panel, condition/
facts/history; panel becomes static. Actual title wraps rather than clamping.

## Current behavior and constraints

- Public book metadata/photos belong to the inspected intake revision. Signed
  photo reads are auction-scoped; the shared gallery loads actual derivatives,
  contains the full photo, offers numbered choices and a native modal large view.
  Failed/missing photos have truthful placeholders; interactive detail permits
  retry. An inspection label appears only when public book metadata is supplied.
- Condition, missing-page information and nonempty cover/pages/notes/accessories
  fields remain readable, with preserved newlines. If metadata is unavailable,
  the page says so and keeps actual public auction state/history.
- Server-time countdown, price, bidder count, step and state govern presentation.
  Socket updates retain REST fallback (10 seconds without socket,60 seconds while
  connected for active detail). Expiry triggers reread while the server closes.
- Manual quick choices and numeric entry lead to one confirmation. Server floor,
  starting-price step and 1,000,000đ ceiling remain enforced; the leader is directed
  to raising the private auto level instead of redundant manual bidding.
- Auto dialog has entry and confirmation stages, explains privacy/no bidding
  wallet hold, and only permits raising an existing ceiling. Known rejection
  retains dialog, stage and amount; “Sửa mức” restores that amount. Unknown result
  closes the dialog and exposes retry of the same command/key/body. Live refresh
  cannot manufacture success or replace an unresolved intent.
- Buy-now retains confirmation and 15-minute payment limit. Winner payment retains
  original order/version/key for unknown-result retry and 24-hour auction-payment
  semantics. Order-state copy distinguishes pending payment, fulfillment, ready
  for collection, inspection, resolution, return and completion. Collection and
  settlement actions are not added here; READINESS gates stay separate.
- Guest login preserves the detail return URL. Seller, winner, suspended, closed,
  capped and pending states retain their dedicated explanations/actions.
- Initial failures show recovery; 404 has a real not-found state. Transient detail
  refresh retains cached content with a stale warning. Transient own-participation
  refresh can retain prior standing with warning; denied private participation
  hides cached standing/actions pending a successful read. Server authorization
  still decides every command.

## Accessibility, mobile and motion

Inputs have numeric keyboards, labels, described errors and invalid state. Quick
choices expose pressed state; confirmations use shared/native dialogs, explicit
names, bounded scrolling and 44px-or-larger close/actions. Auto stage change focuses
its confirmation heading/input; busy dialogs prevent dismissal. Gallery Escape,
focus return and page-scroll locking were browser checked. History is a labelled
focusable scrolling list. The price's live announcement is scoped to the price;
standing/command results have local status regions and errors retain alerts.

- Actual price values render immediately. Only changes after the same auction's
  baseline receive 500ms paper-yellow emphasis and a 3px arrival. The newest
  history entry after baseline gets finite 500ms emphasis; stable event keys preserve
  existing rows. Replayed/unchanged snapshots do not repeat value feedback.
- A changed leading/outbid standing gets 270ms color/position feedback alongside
  its text. No per-second countdown animation or client-side winner is introduced.
- A known successful command response alone mounts the paper receipt (280ms).
  Accepted manual/automatic bids add one decorative Gavel stroke (380ms).
  Rejection or an unknown response produces no confirmation receipt/Gavel;
  live reads cannot acknowledge an unresolved command. Retry retains its intent.
- Auto opens over 220ms; keyed entry/confirmation steps arrive over 200ms/3px.
  Heading/input focus is set before paint on a step change. Close/Escape remain
  immediate when permitted; busy-state dismissal remains blocked. Below 420px,
  confirmation actions stack so the full monetary label remains readable.
- Scoped CSS and WAAPI retain the owner's11/10 motion policy under reduced-motion
  preference. WAAPI checks visibility/bounds, cancels on hidden document and
  cleans up on interruption/unmount. Offscreen updates settle without a backlog;
  unavailable WAAPI preserves immediate readable content and usable actions.

## Comparison and verification limits

Compared detail/gallery/auto source and CSS with incumbent DESIGN.md and sidecar;
wine/cream, task typography, contained covers and paper/rule composition extend
the established system. Local state grounds/type values do not become shared
tokens. Detail and auto dialog bind the exact incumbent shelf, wine-hover, error
and relevant exchange-ink roles locally, resolving missing inherited definitions
without global token changes. Old DESIGN Auction-scope prose remains reported
drift, alongside its older reduced-motion guidance for this scoped policy.
That drift is not promoted into new rules; DESIGN.md and its sidecar stay unchanged.

[Auction evidence](../../../../.impeccable/review/auctions/README.md) records
`detail-desktop-bidder.jpg`, `detail-mobile-bidder.jpg`, `auto-desktop.jpg`,
`auto-mobile.jpg`, `auto-rejection-desktop.jpg`, `detail-refresh-error.jpg` and
gallery keyboard checks. The rejection fixture raised the caller's ceiling
concurrently; retained 500,000đ input after rejection was checked. QA used isolated
Mongo and fake storage with labelled existing-cover fixtures. The three-fix AI
verdict was ship/resolved, not human acceptance or a full surface re-review.
Unknown-payment network-drop browser scenario, live Supabase, native/physical
phone, Safari, speech screen reader, full 125%/200% zoom and remote CI NOT RUN.

[Motion evidence](../../../../.impeccable/review/auction-motion/README.md) and
`runtime.json` add desktop/mobile acknowledged-receipt and live-outbid captures,
auto entry/confirmation, retained known-rejection input, unknown response and
stale-read recovery. A committed auto command followed by a simulated lost ACK
showed zero receipts; retry of the original intent confirmed the same result.
History retained focus and its viewport anchor across a live update, with native
document scroll anchoring and no forced scroll. Escape restored the auto opener.
Chromium actually reported reduced motion enabled; computed step duration was
200ms and samples captured price feedback and a running Gavel transform.

The independent finish disposition was ship with no material fixes. Evidence
records 109 unit tests, build/TypeScript PASS and lint with zero errors/five
existing Exchange warnings. Screenshot/DOM samples are not a complete motion
recording or continuous FPS/CPU trace. Hidden-tab/missing-WAAPI behavior is unit
covered, not browser checked. Physical phone, Safari/native, speech screen reader,
full zoom, remote CI and human acceptance remain NOT RUN. QA uses isolated Mongo,
fake storage and labelled covers; live Supabase and receipt/settlement gates stay
outside scope. No API, auth, session, database or dependency change is implied.
