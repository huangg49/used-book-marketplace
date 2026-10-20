# ADR 0043: Buy Now opens a 60-second challenge window

19/10/2026. Owner request: pressing Buy Now no longer closes the auction at
once. Other bidders get 60 seconds to bid over the Buy Now price if they really
want the book. This supersedes the "BuyNow → CheckoutPending, tắt mọi bid"
part of FR-AU06 in [LOCAL-AUCTION-01](../features/LOCAL_HANDOVER_AUCTION.md);
the rest of FR-AU03–10 is unchanged.

## Decision

- Buy Now is still offered only before the first valid bid and is decided
  under the same auction lock as bids, so a racing first bid and Buy Now have
  exactly one winner.
- An accepted Buy Now is a committed manual bid at `buyNowPrice` (on the start
  + n × step grid): the buyer becomes leader, `currentPrice = buyNowPrice`, the
  bid row has kind `BuyNow`, and Buy Now is no longer offered. The auction
  stays `Active` and records `buyNowAt`.
- The auction then ends at `min(original endAt, buyNowAt + 60 s)`. The original
  24-hour end is kept as an upper bound; a Buy Now in the last minute does not
  extend the auction.
- During the window anyone eligible may bid or set Auto from
  `buyNowPrice + step` with the normal rules (FR-AU03–05). The Buy Now buyer is
  an ordinary bidder: they may raise their own commitment. Later bids do not
  extend the window again (no rolling soft close in this version).
- When the window ends the normal close (FR-AU07) applies: the leader wins at
  `currentPrice`, one Order is formed and the winner has the 24-hour payment
  window from `endAt` (POL-40). If nobody outbid, the Buy Now buyer wins at
  `buyNowPrice`. No `BuyNowPending` Order is formed by new commands.
- Auctions already in `BuyNowPending` keep their 15-minute Order and expiry.
- Bids are refused from `endAt` by server time; the close itself runs in the
  order worker. Besides its full 60-second sweep, the worker runs a close-only
  sweep (`AuctionWorker.closeDue`) every 5 seconds, so a window ends within
  seconds instead of up to a minute late. Close stays idempotent under the
  auction lock; overlapping runs or extra workers only skip (409).

## Persistence and contract

- Migration 0033 adds `auctions.buyNowAt` (date or null, backfilled null) and
  replaces the fixed `endAt = startAt + 24 h` rule with: no Buy Now ⇒
  `endAt = startAt + 24 h`; Buy Now ⇒ `endAt = min(startAt + 24 h,
  buyNowAt + 60 s)` and at least one bidder.
- `PublicAuctionSummary.buyNowAt` exposes when the window started; `endAt`
  already carries the shortened end. `BuyAuctionNow` keeps its body and
  idempotency; its receipt now reports `state: Active`, `leading: true` and the
  new minimum bid, with no `orderId`.
- The seller is notified that a buyer chose Buy Now and that others have 60
  seconds to outbid; the usual Outbid/Won/Sold notifications follow.

## Verification

HTTP/Mongo tests cover the window end time (including near the original end),
outbidding inside the window, the Buy Now buyer winning when nobody outbids,
bids refused after the window by server time, the first-bid/Buy Now and
Auto/Buy Now races, replay with the same key/body, and the migration backfill.
Clients show the 60-second countdown and explain that Buy Now can still be
outbid.
