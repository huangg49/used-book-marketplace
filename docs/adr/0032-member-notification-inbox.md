# ADR 0032: Durable member notification inbox (auction events)

Date: 2026-10-09. Status: implemented on branch `feature/auction-web` for auction
events (OpenAPI 0.30.0, migration `0015-member-notifications`). Needs human review
before merge.

## Context

SRS FR-N03 makes a durable inbox the primary notification channel ("hộp thư lưu bền
là nguồn chính"), with realtime as a supplement; FR-N04 requires read/unread state,
links only to objects the user may open, and no address, OTP or evidence in the text.
The auction flow had no notification at all: an outbid leader, a winner with a 24 h
payment deadline, a seller whose book sold or whose auction was held or cancelled
only learnt it by opening the page. `outbox_events` exists but nothing consumes it.

## Decision

- Collection `member_notifications` (mutable only for `readAt`), one row per
  recipient and event, written **in the same transaction** as the auction change via
  `notifyAuction()`. A rolled-back command never notifies; a retried transaction
  cannot duplicate a row (unique `dedupeKey` = kind + auction + post-change version +
  user); an idempotent replay never runs the mutation, so it never notifies again.
- Auction events and recipients:

  | Kind | When | To |
  | --- | --- | --- |
  | `AuctionOutbid` | a bid/Auto makes someone else the leader | previous leader |
  | `AuctionWon` / `AuctionSold` | close with a leader | winner / seller |
  | `AuctionBoughtNow` | Buy Now | seller |
  | `AuctionUnsold` | close without bids | seller |
  | `AuctionCancelled` | Admin cancel | seller and every bidder |
  | `AuctionOnHold` | hold sweep or close finds an ineligible party | seller and leader |
  | `AuctionPaymentExpired` | payment deadline passed | winner and seller |
  | `AuctionPaid` | winner paid | seller |

  A bidder whose own bid was immediately answered by an Auto ceiling is not
  "outbid": their receipt already says `leading: false`.
- Text holds the auction title, public prices, states, the point name and deadlines
  only — never an Auto ceiling (`AuctionOutbid` shows the public price and the next
  minimum), another member's identity, a collection code or an address.
- API: `GET /me/notifications` (newest first, opaque cursor, `unreadCount`) and
  `POST /me/notifications/read` (`ids` or `all`). Marking read only changes the
  caller's unread rows, so it is naturally idempotent; it still requires an
  Idempotency-Key like every designed mutation, but stores no receipt.
  Both routes are `@ExistingObligation`: a LOCKED member must still learn about an
  auction or order they are bound to (e.g. their auction was held because of the lock).
- Web: a bell with the unread count in the header, a dropdown and `/notifications`.
  The bell polls every 30 s and refreshes when an auction push arrives (ADR 0031);
  opening a notice marks it read and opens the auction page.

## Consequences

- Run `pnpm db:migrate` then `pnpm db:bootstrap` on existing databases (new collection
  privileges for the app role, new `AuctionHold` system operation).
- Only auction events notify so far. Point-order steps after payment (report,
  collection code, inspection, resolution), wishlist matching (FR-N01/N02), email and
  per-user opt-out are not implemented.
- No private socket channel: the inbox is read over REST; the public live channel only
  triggers a refresh.
