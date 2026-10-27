# ADR 0047: Seller publishes and schedules auctions; Buy Now stays open after bids

27/10/2026. Owner request: once the book is inspected, the seller decides when
the auction goes live. The seller can publish it at once or schedule it, choose
how long it runs and change the time before anyone bids. When the seller set a
Buy Now price, Buy Now stays available after bids. The owner granted this as a
named exception to the READINESS gate "mở rộng nghiệp vụ sau F2h", like
[ADR 0044](0044-auction-delivery-from-point.md); the rest of the gate is unchanged.

This supersedes, in [LOCAL-AUCTION-01](../features/LOCAL_HANDOVER_AUCTION.md):

- POL-38 "24 giờ từ khi mở; không lên lịch tương lai": the length is 1–168
  hours and the start may be scheduled up to 7 days ahead.
- FR-AU02 "Staff độc lập mới mở phiên; startAt=serverNow, endAt=startAt+24 giờ":
  the owning seller publishes. The fixed 24-hour Staff open stays only as a
  deprecated operation (`openAuction`) for operations tooling and tests.
- FR-AU06 / DEC-06 / [ADR 0043](0043-buy-now-challenge-window.md) "BuyNow chỉ
  trước bid hợp lệ đầu tiên": Buy Now is offered while live, unused and above the
  current price, also after bids.

Unchanged: Buy Now stays optional at intake (FR-AU01 "buyNow nếu có"); inspection
Pass is still required; after the first bid the seller cannot withdraw, change
prices or move the time (FR-AU02); the ADR 0043 60-second window; the 24-hour
payment window; POL-39 prices; POL-41 limits; Admin cancel.

## Decision

- **Publish.** `POST /auction-intakes/{id}/publish` (`publishAuction`), owner
  MEMBER, ACTIVE and not restricted (POL-17), intake `Passed`, listing revision
  unchanged. Body: intake `expectedVersion`, `startAt` (null = now, otherwise now
  + 5 minutes … now + 7 days) and `durationHours` 1–168. It creates the auction
  like the Staff open did and moves the intake to `Auctioning`.
- **No scheduled state.** The auction is stored `Active`; its phase is derived
  from server time: `Scheduled` before `startAt`, `Live` until `endAt`, then
  `Ended`. No worker opens auctions, so nothing races a scheduler. Bids, Auto and
  Buy Now before `startAt` return 409 `AuctionNotStarted`, decided with the
  server clock after the auction lock. Holds, seller withdraw and Admin cancel
  work unchanged because the state is `Active`.
- **Edit the time.** `POST /auctions/{id}/schedule` (`rescheduleAuction`), owner
  only, auction `expectedVersion`, only while `bidderCount = 0`, Buy Now unused
  and not ended, at most 5 edits. Scheduled: new `startAt` (null = now) and length.
  Live: only the length counted from the original start; the new end must be at
  least 1 hour away. Locks only the auction, like bids and close, so an edit and
  a racing first bid or close have exactly one order.
- **Buy Now.** Offered when the auction is live, has a Buy Now price, Buy Now has
  not been used and `currentPrice` is null or below it. The current leader cannot
  use it. It stays one committed manual bid at `buyNowPrice` (ADR 0043): an
  earlier Auto ceiling at or above it keeps the lead by sequence (FR-AU04), and
  the window still starts. Refusing that case would reveal a hidden ceiling
  (FR-AU10). Once the price reaches the Buy Now price, Buy Now is withdrawn.
- **Withdraw.** The seller still withdraws through `cancelAuctionIntake` before
  the first bid, including while scheduled; the book goes to reclaim. There is no
  "unschedule" back to `Passed`.

## Persistence and contract

- Migration 0037 adds `plannedEndAt`, `publishedAt`, `publishedBy`
  (`Staff | Seller`) and `scheduleRevision` (0–5), backfilled as `startAt + 24 h`,
  `startAt`, `Staff`, 0. The end rule becomes: `endAt = plannedEndAt` without Buy
  Now, `min(plannedEndAt, buyNowAt + 60 s)` with it; `plannedEndAt − startAt` in
  1–168 h; `publishedAt ≤ startAt ≤ updatedAt + 7 days`. New index
  `auctions_state_start_at_idx`. Commit-time invariant: no bid before `startAt`.
- OpenAPI 0.52.0: `publishAuction`, `rescheduleAuction`, `PublishAuction`,
  `RescheduleAuction`; `PublicAuctionSummary.phase/version/scheduleRevision`;
  `OperationsAuctionItem.phase`; `GET /auctions?phase=live|upcoming` (default live,
  so older clients never list scheduled auctions); `GET /me/auctions?view=upcoming`;
  error `AuctionNotStarted`; `openAuction` deprecated.

## Consequences

- Longer or later auctions hold a point slot longer; the 7-day horizon and
  168-hour cap bound it.
- Older clients that open a scheduled auction by link get `AuctionNotStarted`
  on bid. Older copy saying Buy Now ends at the first bid is outdated.
- No "starting soon" notification yet (it needs a notification-kind migration).
