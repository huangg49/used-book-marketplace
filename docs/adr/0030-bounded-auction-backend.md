# ADR 0030: Bounded auction backend

> Phạm vi quyết định ban đầu ngày 08/10: migration0008–0011. Main đã nhập
> backend qua PR23 và bổ sung completion0012/0013, live/inbox0015. Các giới hạn
> increment trong ADR này là lịch sử; xem [kiến trúc hiện hành](../architecture/README.md)
> và [SESSION_STATE](../handoff/SESSION_STATE.md). Code đã nhập không tự đóng gate review.

Date: 2026-10-08. Status: implemented for intake → bidding → close → winner ViaPoint
Order and wallet payment → report decision → collection code and Staff handover →
inspection window start, plus expiry/reclaim, on branch `feature/auction-backend`
(OpenAPI 0.27.0, migrations `0008-auctions` … `0011-point-order-resolution`), plus
Admin resolution (refund or resumed collection) of Orders still at the point.
Settlement to the seller and post-handover disputes are not implemented. Needs
human review before merge.

## Context

[LOCAL-AUCTION-01 §6](../features/LOCAL_HANDOVER_AUCTION.md) (FR-AU01–10, POL-38–41)
and [ADR 0007](0007-hcm-handover-auction-scope.md) define a minimal auction: one Sale
book per session, already received and inspected at a managed point, manual bids
and private Auto ceilings on one price grid, Buy Now before the first bid, 24-hour
fixed end and one winner with no automatic runner-up or relist. P01/P02 (points,
intake, inspection) did not exist yet, and Orders are DirectDelivery-only.

The rules were compared with eBay automatic bidding and Catawiki max bids. Second
price plus one step capped at the winner's maximum, and first-to-reach-a-level wins
ties, match eBay. Catawiki's last-minute extension (bid in the last 60 s adds 90 s)
was **not** adopted: POL-38 fixes the end time, Auto ceilings already remove most of
the benefit of sniping, and `endAt + 24h` stays a simple, worker-independent
deadline. Changing that is a project-owner policy decision. Like Catawiki, bids can
never be withdrawn or lowered; eBay's typo retraction has no equivalent, so clients
should confirm the amount before sending. Hidden reserve prices stay out of scope.

## Decision

- **Engine.** `auction-engine.ts` is a pure function over the auction and bidder
  projections. Level = manual amount or Auto max; ranking = level desc, then the
  server `levelSequence` assigned whenever a bidder's level rises. Price =
  `max(current, start | min(H, L+step), new manual amount)`, never above H. The
  leader may only raise an Auto ceiling, which never moves the price. Disabling a
  leading Auto freezes the level at the current price with its old sequence. Two
  competing Autos resolve in one step; no synthetic bid loop is written.
- **Persistence.** Migration 0008 adds `handover_points` (two simulated HCM points,
  capacity 20), `point_staff_assignments`, `point_slots`, `auction_intakes`,
  `auctions`, `auction_bidders` (one projection per bidder, private level) and
  append-only `auction_bids`. `workflow_contexts` gains the `AuctionIntake` kind
  (exactly one of `orderId`/`auctionIntakeId`); commitments gain reason `Reclaimed`;
  receipts/audit accept the `AuctionClose`, `AuctionPaymentExpiry` and
  `AuctionIntakeExpiry` system principals. Validators pin the price grid, 24 h
  duration, 72 h drop-off, 15 min Buy Now and `endAt + 24h` payment deadlines.
- **Ownership.** Intake creation takes the shared exclusive commitment, one point
  slot (counted under the point lock) and the listing `Reserved` projection in one
  transaction. They are released together only on cancel before drop-off, drop-off
  expiry or Staff-recorded reclaim. Unsold, PaymentExpired, cancelled auctions and
  failed inspections keep the book off the shelf in `ReclaimRequired` (AC-AU14).
- **Concurrency.** Every bid/Auto/Buy Now/close/cancel locks the auction document;
  the decision clock is read after the locks and a bid at or after `endAt` is
  refused even if the worker has not run. Bids do not use `expectedVersion`; they
  validate against the locked state and return `409 BidTooLow` with the new minimum.
  Idempotency-Key/body/receipt replay is unchanged and runs after current
  authorization. Close is keyed by the auction id per system principal.
- **Roles.** Receive/inspect/open/reclaim need STAFF with a current assignment at the
  intake point and independence from the seller; ADMIN alone cannot. Admin cancel
  needs independence from the seller and every bidder. Bidders must be ACTIVE
  verified MEMBERs, not the seller and not Staff who received, inspected or are
  assigned to the point. Seller/bidder ineligibility at close moves to `OnHold`.
- **Privacy.** Public reads show price, end time, anonymous aliases and price
  history. Only the owning bidder reads their own level. Audit/outbox/receipts carry
  the public price only.
- **Worker.** `AuctionWorker.tick` runs in the existing `order-worker` loop with
  bounded scans (100) for closes, payment expiry and drop-off expiry, and logs
  processed/skipped/failed, OnHold and ReclaimRequired counts.

- **Winner Order (migration 0009).** Close with a winner and Buy Now form a ViaPoint
  Order in `point_orders` inside the same transaction: frozen agreement snapshot
  (P, outbound fee 0 for SelfCollect, commission round(P × 5%), seller proceeds
  P − C, deadline `endAt + 24h` or 15 min), its own `PointOrder` workflow context,
  and the exclusive commitment **transferred** from the intake context (new
  `Transferred` event, versions keep counting, never Released in between). The
  point slot stays with the intake; the book keeps the same slot. `point_orders` is
  separate from `direct_orders` because the DirectDelivery validator pins a quote,
  a 15-minute deadline and seller confirmation, and Order workers would otherwise
  expire or refund it through DirectDelivery rules.
- **Payment.** `POST /point-orders/{id}/pay` (buyer ACTIVE/RESTRICTED, seller still
  verified) locks the auction before the Order, so it serializes with the expiry
  worker; before the deadline it posts one `OrderPayment` journal of buyerTotal into
  the Order's `OrderHold` account, the Order becomes `Fulfilling` (no seller
  confirmation, FR-O05) and the auction `Sold`. Insufficient funds hold nothing.
  The ledger journal check, reconciliation and wallet `transactionHeld` accept
  holds of both DirectDelivery and ViaPoint Orders.
- **Expiry.** Unpaid at the deadline, the worker marks Order and auction
  `PaymentExpired`, closes the Order context and transfers the commitment back to
  the intake, which moves to `ReclaimRequired`; no charge, runner-up or relist.
- **Collection at the point (migration 0010).** Payment opens a 72 h recipient
  decision on the point condition report (POL-32). Accept → `ReadyForCollection`
  with a collection deadline 72 h later, moved to the next 18:00 closing time when
  it falls outside 09:00–18:00 Asia/Ho_Chi_Minh (POL-29/33). Reject, or no answer
  by the deadline, → `ResolutionPending`; no auto-accept and no refund. The buyer
  requests a 6-digit code valid 10 minutes (POL-37); a new code revokes the old
  one, only a salted SHA-256 is stored and the raw code exists only in that HTTP
  response (a replay returns `code: null`). Assigned, independent STAFF enter it
  during point hours: wrong/expired codes are **committed** as attempts and
  returned as a receipt outcome, the sixth wrong attempt within 15 minutes is rate
  limited (AC-H17). A correct code records one `point_handovers` row and moves the
  Order to `Inspection` with `inspectionDeadline = collectedAt + 72h` (FR-T03).
  Missing collection by the deadline → `ResolutionPending` and revokes the code.
  The slot, commitment, `Reserved` listing and Order hold all stay until
  settlement. Buyer decision/code commands are existing obligations (LOCKED allowed).
- **Resolution (migration 0011).** An ACTIVE ADMIN independent of buyer, seller and
  the point's Staff (receiver, inspector or current assignment) decides a
  `ResolutionPending` Order, where the book has not left the point. `RefundBuyer`
  posts one `OrderRefund` journal of the full hold to the buyer, cancels the
  Order, transfers the commitment back to the intake and requires reclaim
  (`OrderCancelled`); `ResumeCollection` opens a new 72 h window from
  `collectionOpenedAt`. Each decision is an append-only `point_order_resolutions`
  row with the reason; the ledger accepts a ViaPoint refund only when it is the
  journal named by that decision. No partial refund, penalty or strike.
- **Gate.** Settlement after the inspection window (P − C to the seller, listing
  `Sold`, slot/commitment release) is deliberately not opened: READINESS keeps
  settlement BLOCKED until the hand-over gates close and the owner approves.
- **Constants.** Auction policy constants live in `migrations/auction-constants.ts`
  so application code does not load the migration chain (import cycle).

## Consequences and limits

- Collected Orders stop at `Inspection`: inspection-window close, settlement to the
  seller (P − C), post-handover claims/returns and the 14-day Admin escalation are
  not implemented, so money for collected books stays held.
- Collection codes are salted hashes of a 6-digit secret; anyone with database
  read access could brute-force a live code within its 10 minutes. A keyed HMAC
  with a server secret would close that; acceptable only for the simulated demo.
- Point hours are a fixed UTC+7 rule (no holidays, no per-point schedule).
- Only self drop-off and self collect are modelled; carrier legs and fee holds,
  NeedsEvidence, late-arrival handling, inspection overdue tasks, point admin CRUD,
  OnHold resolution UI and SSE are not implemented.
- The auction document is a hot lock: commands on one auction are serialized and
  retried. That is adequate for the demo limits (POL-41) but was not load-tested.
- After this migration, run the role bootstrap so the app user gets the new
  collections, as with earlier migrations that added collections.

## Amendment 2026-10-09 — leader sequence and the price cap

Found by the concurrency/scope cases in [AUCTION_TEST_CASES](../features/AUCTION_TEST_CASES.md):

- **Leader raise keeps the winning sequence.** Previously a leader raising their own
  Auto ceiling received a new `levelSequence`. After *A ties B at 400k (A first) → A
  raises to 600k → A disables Auto*, A was set back to 400k with the newer sequence, so
  B ranked first while `leaderId` stayed A; the commit-time ranking check refused the
  disable (500) and the leader could not turn Auto off (FR-AU05). The leader now keeps
  the sequence that won the lead. This does not grant the advantage FR-AU04 forbids:
  when a leader raises, every rival is at or below the leader's old level, so nobody can
  hold the new level with an earlier claim; the kept sequence only matters at the
  current price, where FR-AU05 requires "the sequence of the price that won".
- **No next bid at the cap.** `minimumBid` was `currentPrice + step` even at
  1,000,000 (1,050,000, outside the contract). Public reads, participation and receipts
  now return `null` once no grid amount can beat the price; `BidTooLow` says the cap is
  reached.
