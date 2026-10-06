# ADR 0030: Bounded auction backend

Date: 2026-10-08. Status: implemented for intake → bidding → close/expiry → reclaim
on branch `feature/auction-backend` (OpenAPI 0.24.0, migration `0008-auctions`).
Winner Order creation and payment are not implemented. Needs human review before merge.

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

## Consequences and limits

- **Winner payment is missing.** `AwaitingWinnerPayment` and `BuyNowPending` record
  winner, price and deadline but cannot be paid yet, so every won auction currently
  expires to `PaymentExpired`. The next increment must add a ViaPoint Order created
  through `OrdersService` (snapshot, commitment/slot transfer with no gap, P plus
  outbound fee, `Fulfilling` without seller confirmation) and payment.
- Only self drop-off and self collect are modelled; carrier legs and fee holds,
  NeedsEvidence, late-arrival handling, inspection overdue tasks, point admin CRUD,
  OnHold resolution UI and SSE are not implemented.
- The auction document is a hot lock: commands on one auction are serialized and
  retried. That is adequate for the demo limits (POL-41) but was not load-tested.
- After this migration, run the role bootstrap so the app user gets the new
  collections, as with earlier migrations that added collections.
