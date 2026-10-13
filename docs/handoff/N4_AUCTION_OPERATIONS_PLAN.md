# N4 — Đấu giá & vận hành: implementation plan

Date 13/10/2026, source `origin/main` `7be68a4` (OpenAPI 0.34.0). Scope of the N4 card:
auctions, handover points, Staff/Admin, inspection and incident handling.

This is a plan, not a status tracker and not permission to skip a gate. Business rules
come from [LOCAL_HANDOVER_AUCTION](../features/LOCAL_HANDOVER_AUCTION.md) (FR-H, FR-T,
FR-AU, POL-27–42), [ADR 0030](../adr/0030-bounded-auction-backend.md) and
[AUCTION_BACKEND_REPORT](../features/AUCTION_BACKEND_REPORT.md). Gates stay as in
[READINESS](READINESS.md).

## 1. Where things stand

| Area | API (`apps/api`) | Member web (`apps/user-web`) | RN (`apps/mobile-react-native`) | Staff/Admin (`apps/admin-web`) |
| --- | --- | --- | --- | --- |
| Auction browse, bid, Auto, Buy Now | Done (engine, worker, live socket) | Done (`/auctions`, detail, `/my-auctions`) | Home strip only; no detail, no bidding | — |
| Seller intake (send a book to auction) | Done (`POST /auction-intakes`, cancel, my intakes) | Done (`/auctions/new`, withdraw) | None | — |
| Winner pays the point Order | Done (`/point-orders/{id}/pay`) | Done | None | — |
| Report decision, collection code, claim | Done (`accept-report`, `reject-report`, `collection-code`, `claim`) | **Not wired** | None | — |
| Staff intake: receive → inspect → open / reclaim | Done (`/operations/auction-intakes/*`, STAFF + assignment) | — | — | **None** |
| Staff collection: handover with code, receive return | Done (`/operations/point-orders/*`) | — | — | **None** |
| Admin resolution of point Orders | Done (`/operations/point-order-resolutions`, `…/resolve`: RefundBuyer, ResumeCollection, DismissClaim, RequireReturn) | — | — | **None** |
| Admin cancel of an auction | Done (`/operations/auctions/{id}/cancel`, reason) | — | — | **None** |
| Point admin (create/edit, hours, capacity, Active/Paused/Closed) — FR-H04 | **Not implemented** (only `GET /handover-points`) | — | — | None |
| Staff assignment management with audit — FR-H04 | **Not implemented** (seed only, `point_staff_assignments`) | — | — | None |
| Inspection checklist, NeedsEvidence, report revisions — FR-T01/T02 | **Not implemented** (Pass/Fail + note only) | — | — | None |
| Incidents, incident fund POL-42 — FR-T04, FR-H07 | **Not implemented** (no incident model) | — | — | None |
| Overdue/escalation: POL-31 inspection, POL-34 reclaim 14 days, late arrival | **Not implemented** | — | — | None |

Summary: the auction and point backend is mostly there. What is missing is (a) every
Staff/Admin screen, (b) the RN Member screens and part of the Member web flow after winning,
and (c) the point-admin, assignment, inspection-evidence and incident backend.

## 2. Gate rule for this plan

- **Phase 1 — clients over existing endpoints.** No new business workflow, no contract or
  migration change. Can start now on feature branches; normal review per
  [TEAMWORK](../TEAMWORK.md).
- **Phase 2 — new backend workflows.** Point admin, assignments, NeedsEvidence, incidents,
  overdue/escalation. These extend the ViaPoint inspection/custody workflow, which
  READINESS keeps under "mở rộng nghiệp vụ sau F2h: BLOCKED". **Needs explicit project-owner
  approval before code.** Design notes and contract drafts may be prepared earlier.
- Settlement to the seller is outside N4 and stays behind its own gate.

## 3. Phase 1 packages

Each package is one branch and one PR. Sizes: S ≈ 1 day, M ≈ 2–3 days, L ≈ 4–5 days.

### N4-01 — Operations shell in admin-web (S)

- Add an "Vận hành điểm" nav group to `apps/admin-web/src/App.tsx`: Staff sees *Nhận sách
  đấu giá* and *Giao sách*; Admin sees *Xử lý đơn tại điểm* and *Phiên đấu giá*.
- `core/session.ts`: add `canOperatePoint` (ACTIVE + STAFF) and `canResolve` (ACTIVE +
  ADMIN), with tests like the existing `canReview` cases.
- The UI cannot know the Staff member's assignment (no read API). Show the server's 403 as
  "Bạn chưa được phân công tại điểm này" instead of hiding the error.
- Done when: role cases are tested; a STAFF without an assignment sees an explained empty
  state, not a broken page.

### N4-02 — Staff intake desk (M)

- Queue `GET /operations/auction-intakes`; detail with book, seller-declared condition,
  approved photos and deadline (POL-30 72 h).
- Actions: receive (`shelfCode`), inspect (`Pass`/`Fail` + note), open (24 h from server
  time), reclaim. Each command sends `expectedVersion` and an `Idempotency-Key`. On lost
  response, retry with the **same** key and body, then read the receipt. 409 reloads
  and shows the new state.
- The copy must say Pass = "đạt kiểm tra tình trạng tại điểm". Never use "chính hãng".
- Done when: 403 for another point's Staff, 409 version conflict, replay after 503, and
  Fail → reclaim are all shown correctly; keyboard and 320 px/desktop work.

### N4-03 — Staff collection desk (M)

- Queue `GET /operations/point-orders`; handover with the 6-digit code; receive return
  with `MatchesReport`/`DoesNotMatch` + note.
- Never log or keep the raw code beyond the input. After 5 wrong attempts show the
  `RateLimited` state; for an expired code, ask the buyer to request a new one.
- Done when: wrong/expired/used code, replay returns the same receipt, second handover 409.

### N4-04 — Admin resolution queue (M)

- `GET /operations/point-order-resolutions`; decide `RefundBuyer`, `ResumeCollection`,
  `DismissClaim`, `RequireReturn` with a reason (min length per contract) and `fault`
  where the contract asks for it. Confirm dialog states the money effect.
- An Admin assigned to that point gets 403 (independence rule). Explain it in the UI.
- Done when: two Admins racing → one decision, the other sees 409 and the outcome.

### N4-05 — Admin auction cancel (S)

- Admin list from `GET /auctions` + detail; "Hủy phiên" with a required reason and
  `expectedVersion`. Copy: the system does not choose a winner; bidders are notified.
- Done when: short reason 422, already-closed auction 409, replay safe.

### N4-06 — Member web: after winning (M)

- In `apps/user-web`: show the point report and let the winner accept or reject
  (`accept-report`/`reject-report`); request a collection code (`collection-code`,
  10-minute countdown is display only); open a claim (`claim`, description).
- Add the services to `src/services/auctions.ts`; reuse the existing command/key handling.
- Also fix the small tie gap found on 13/10: the "Bạn vừa bị vượt giá" toast in
  `AuctionDetailPage.tsx` also fires on a tie; use the same `tied` check as the status card.
- Done when: decision deadline, no code before acceptance, code reissue, claim replay.

### N4-07 — RN auction browse and bidding (L)

- New route(s) under `src/app` (list + detail), screens in `src/features/auctions`,
  TanStack Query, `packages/session-client`. Point the "Đấu giá" tab at the list instead
  of Home.
- Detail: price, minimum bid, history with aliases, countdown from `serverTime`, bid,
  Auto ceiling (own ceiling only from `/me/auctions/{id}/participation`), disable Auto,
  Buy Now before the first bid. Confirm the amount before sending; bids cannot be withdrawn.
- Leading / tied / outbid states with the same rule as web (FR-AU04).
- Live updates: start with polling the detail; Socket.IO `/auctions` is an optional follow-up.
- Done when: AC-AU03–06 visible in the UI against a real API; lost response retries with
  the same key; Android native run, not only web export.

### N4-08 — RN my auctions, payment and collection (M)

- `/me/auctions` views, pay the point Order, report decision, collection code, claim —
  the same flows as N4-06, after N4-07.

### N4-09 — RN seller intake (M)

- Mirror web `/auctions/new`: eligible Sale books, point from `/handover-points`, price
  grid (POL-39), receipt with the 72 h drop-off deadline, withdraw.

## 4. Phase 2 packages (owner approval required)

All are contract-first (`openapi.yaml` → `pnpm contract:generate`), new Mongo migrations
only, transactions with commit-time checks, and e2e denial/replay/race cases on `*_test`.

| ID | Package | Main rules | Size |
| --- | --- | --- | --- |
| N4-10 | Point admin API + UI | FR-H04: create/edit, hours, capacity never below held slots, Active/Paused/Closed (Paused blocks new bookings only; Closed only with no custody or obligations), audit rows | L |
| N4-11 | Staff assignment API + UI | FR-H04: assign/unassign with audit; no self-assignment; cannot remove the only assignment while the point has obligations; "my assignments" read for Staff (lets N4-01 show the point) | M |
| N4-12 | Inspection checklist, NeedsEvidence, report revisions | FR-T01/T02, FR-H08: checklist fields, photos, immutable report revisions; NeedsEvidence blocks open/handover; seller submits evidence; independent Staff decides within 48 h (POL-09); never auto-Pass | L |
| N4-13 | Incidents and incident fund | FR-T04, FR-H07, §7 table: incident even without an Order, owner/evidence/protected value, Admin independent decision, POL-42 fund journal (2,000,000đ, no auto top-up), emergency point close | L |
| N4-14 | Deadlines and escalation | POL-31 inspection overdue task, POL-34 reclaim Overdue → 14-day Admin escalation, late arrival; worker idempotent, no auto-Pass or auto-confiscation | M |

## 5. Order and parallel work

1. N4-01 first (small, unblocks the console).
2. Then in parallel: N4-02 + N4-03 (Staff), N4-04 + N4-05 (Admin), N4-06 (Member web),
   N4-07 (RN).
3. N4-08 and N4-09 after N4-07.
4. Phase 2 after approval: N4-11 → N4-10 → N4-12 → N4-13 → N4-14 (assignments first, because
   every later rule depends on "who may act at this point").

## 6. Checks per package

Follow the [matrix](../AI_WORKFLOW.md#kiểm-tra-theo-thay-đổi). Minimum:

- UI: typecheck, lint, unit; browser at 1366 and 390 (admin-web also 320) on a QA API with
  a separate `*_test` database; loading/empty/error, 403/409/422/503 and lost-response retry.
  RN also on Android native.
- API (Phase 2): contract check/routes, unit, e2e with denial (wrong role, unassigned Staff,
  assigned Admin), replay with the same key, and races (two Staff/Admin acting at once).
- Record NOT RUN items honestly; web export is not a native PASS.

## 7. Decisions needed from the project owner

1. Approve Phase 2 (N4-10…N4-14) despite the READINESS block, or keep N4 to Phase 1.
2. Staff/Admin console stays in `apps/admin-web` (assumed here) rather than a new app.
3. Per-point opening hours: today a fixed 09:00–18:00 UTC+7 rule (ADR 0030); FR-H04 asks
   for editable hours. Editable hours change deadline calculation and need a policy note.
