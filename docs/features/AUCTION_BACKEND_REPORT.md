# Auction backend report — AU01–AU03

Date: 2026-10-08 · Branch `feature/auction-backend` · OpenAPI 0.27.0 · migrations
`0008-auctions` … `0011-point-order-resolution` · decision record [ADR 0030](../adr/0030-bounded-auction-backend.md).
Rules: [LOCAL-AUCTION-01 §6](LOCAL_HANDOVER_AUCTION.md); cases:
[AC-AU01–14](LOCAL_TRANSACTION_ACCEPTANCE.md). AI-written; human review still required.

## What exists

| Area | Endpoints | Notes |
| --- | --- | --- |
| Points | `GET /handover-points` | Two simulated HCM points, capacity and free slots; not real addresses |
| Seller intake | `POST /auction-intakes`, `POST /auction-intakes/{id}/cancel`, `GET /me/auction-intakes[/{id}]` | Approved/Visible/Available **Sale** only; commitment + slot + `Reserved` in one commit; max 2 open per seller; self drop-off within 72 h |
| Point Staff | `GET /operations/auction-intakes`, `POST …/{id}/receive`, `…/inspect`, `…/open`, `…/reclaim` | STAFF with a current assignment at the point, not the seller; Pass/Fail; open = server time, 24 h fixed |
| Bidding | `POST /auctions/{id}/bids`, `PUT …/auto-bid`, `POST …/auto-bid/disable`, `POST …/buy-now` | Proxy bidding per FR-AU04; Buy Now only before first bid; no money held at bid time |
| Reads | `GET /auctions`, `GET /auctions/{id}` (public), `GET /me/auctions/{id}/participation` | Public price/history with aliases; own ceiling only to its owner |
| Live | Socket.IO `/auctions`: `auction:watch`/`auction:update`, `auctions:watch`/`auction:summary` | Same public projections pushed after commit or by a 2 s version poll; [ADR 0031](../adr/0031-live-auction-updates.md) |
| Admin | `POST /operations/auctions/{id}/cancel` | ADMIN independent of seller and bidders, reason ≥ 10 chars |
| Winner Order | `GET /me/point-orders/{id}`, `POST /point-orders/{id}/pay` | Win/Buy Now forms a ViaPoint Order; commitment transferred without release; wallet → Order hold; auction `Sold`, Order `Fulfilling` |
| Collection | `POST /point-orders/{id}/accept-report`, `…/reject-report`, `…/collection-code`; `GET /operations/point-orders`, `POST /operations/point-orders/{id}/handover` | 72 h report decision; 72 h collection window in point hours; 6-digit 10-minute code (hash only); Staff handover → `Inspection` + 72 h window; overdue → `ResolutionPending` |
| Resolution | `GET /operations/point-order-resolutions`, `POST /operations/point-orders/{id}/resolve` | Independent ADMIN: `RefundBuyer` (full hold back, Order Cancelled, book to reclaim) or `ResumeCollection` (new 72 h window) |
| Worker | `AuctionWorker` inside `order-worker` | Close at `endAt` (Unsold / AwaitingWinnerPayment + Order / OnHold), payment expiry (Order and auction; commitment back to intake), drop-off expiry |

Concurrency and scope cases, the chosen tie/serialization behaviour and their tests:
[AUCTION_TEST_CASES](AUCTION_TEST_CASES.md).

## Rule comparison (other auction sites)

| Topic | Reference | Lật lại | Why |
| --- | --- | --- | --- |
| Price paid | eBay: second-highest + increment, capped at own max | `min(H, L+step)` | Same rule (FR-AU04) |
| Tie | eBay: earliest bid at that amount leads | Server `levelSequence` when a level rises | Same, but by server sequence instead of timestamp |
| Increment | eBay: steps grow with price | Seller-chosen 10k/50k grid | Simple, deterministic, prices never leave the grid |
| Late bids | Catawiki: bid in the last 60 s adds 90 s | Fixed 24 h (POL-38) | Auto ceilings blunt sniping; changing it is an owner decision |
| Withdraw | Catawiki: never; eBay: narrow exceptions | Never | Clients must confirm the amount |
| Buy Now | eBay: disappears at the first bid | Same (FR-AU06) | |
| Non-payment | eBay: seller may offer to second place | PaymentExpired → reclaim, no runner-up | FR-AU08 |

## Evidence (this branch, local machine)

| Check | Result |
| --- | --- |
| `vitest run` (API unit, incl. 14 engine tests for AC-AU03–06 and 5 point-hours tests) | PASS 102/102 |
| `test/auctions.e2e-spec.ts` on QA replica set `latlai_e2e_test` | PASS 17/17 |
| `oxlint`, `tsc --noEmit`, `nest build`, `contract:check`, `contract:routes` | PASS |
| Full `test:api:e2e` | PASS 521/521 (26 files) |
| Full `test:api:mongo` | PASS 39, 4 skipped (PostgreSQL import needs `TEST_DATABASE_URL`; failover profile not started) |

E2E cases: only Sale enters (Both → 409); replayed intake key; commitment/slot/
`Reserved` held and released together on cancel; non-assigned Staff and ADMIN cannot
receive; Fail → reclaim → Available; AC-AU03 sequence 200/300/400/450k with ceiling absent
from public JSON and audit; tie priority, leader manual bid rejected, raise does not move
price, off-grid/over-1M → 422, `BidTooLow`, replay and `IdempotencyConflict`, disable keeps a
leading obligation; seller/assigned Staff/LOCKED cannot bid; bid vs Buy Now race ×3 with
one winner; 6 simultaneous equal bids → one success; T−1 ms accepted, T rejected with
`AuctionClosed`; two concurrent worker ticks close once with deadline `endAt+24h`;
payment expiry → ReclaimRequired with listing still Reserved; reclaim → Available;
no-bid close → Unsold; Admin cancel reason/independence.

Payment cases (0.25.0): Order formed at close with frozen P/commission/proceeds and
the commitment owned by the Order context; a stranger cannot pay or read; insufficient
funds → 409 with no journal; two concurrent payments → one `OrderPayment` journal;
Order `Fulfilling`, auction `Sold`, wallet `transactionHeld` = P; the seller read hides
the buyer; the worker never expires a paid Order; payment at the deadline is refused
and expiry returns the commitment to the intake; Buy Now forms a 15-minute Order that
can be paid.

Collection cases (0.26.0): decision deadline paidAt + 72h; no code before acceptance;
seller cannot decide; collection deadline ≥ 72h and inside hours or at 18:00; raw code
absent from code records, receipts and audit; code replay returns null; other-point
Staff 403; closed point 409; wrong code committed with attempts left; handover replay
returns the same receipt with one handover row; second handover 409; Inspection with
deadline +72h; five wrong attempts then RateLimited even with the right code; expired
code; fresh code works; rejection, silent decision and no-show all reach
ResolutionPending with the hold kept, no refund, no live code and the listing Reserved.

Resolution cases (0.27.0): Admin queue; STAFF 403; short reason 422; Admin assigned to
the point 403; refund returns 300k to available with one OrderRefund journal and a
decision row; replay and second decision; intake ReclaimRequired/OrderCancelled with the
commitment back on the intake; reclaim → Available; full ledger reconciliation passes;
two Admins racing refund vs resume → one decision; resumed window → new code → handover.

## Not done / blocked

- Settlement after the inspection window is **BLOCKED by the READINESS gate**; collected
  Orders stop at `Inspection` with the money held. Post-handover claims/returns and the
  14-day escalation are planned.
- Codes are salted hashes (not keyed HMAC); point hours are a fixed UTC+7 rule.
- Carrier inbound/outbound legs and fee holds, NeedsEvidence, late arrival, inspection
  overdue tasks, point/assignment admin APIs, OnHold resolution, SSE/notifications.
- Account lock/restriction during an Active auction is detected at close (OnHold), not
  pushed immediately; Admin lock workflows are still planned.
- No RN/web/operations UI yet. No load test of the per-auction lock.
- After `pnpm db:migrate`, run `pnpm db:bootstrap` so the app role gets the new
  collections; `pnpm db:seed` assigns `staff@latlai.local` to HCM-DEMO-01.
