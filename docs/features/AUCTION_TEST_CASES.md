# Auction test cases — concurrency and scope

Date: 2026-10-09 · Branch `feature/auction-web` · Rules: [LOCAL-AUCTION-01 §6](LOCAL_HANDOVER_AUCTION.md),
[ADR 0030](../adr/0030-bounded-auction-backend.md), live channel [ADR 0031](../adr/0031-live-auction-updates.md).
AI-written; human review still required.

## How simultaneous commands are decided

Every bid, Auto, disable and Buy Now command runs in one MongoDB transaction that
write-locks the auction document (then the bidder projection). Two commands on the
same auction therefore never interleave: the server applies them one after the other
in an order the clients cannot choose, and the pure engine
(`auction-engine.ts`) decides each one against the state left by the previous one.
Every command also locks the acting user's document, so one person's commands are
serialized across all auctions (this is what keeps POL-41 exact).

| Situation | Behaviour (chosen) | Why |
| --- | --- | --- |
| Two people press Bid at the same moment | The first to commit is applied; the other is re-evaluated against the new price: still above the minimum → accepted, otherwise `409 BidTooLow` with the new minimum | No lost update and no silent overwrite. A tie on the same amount cannot both win; the loser gets a clear, retryable answer |
| Same amount from several people | Exactly one accepted; the rest `BidTooLow` | The first sequenced bidder reached that level first (eBay rule) |
| Two people turn on Auto together | Both accepted; leader = higher ceiling at `min(H, L + step)` | Proxy bidding is order-independent for different ceilings, so arrival order cannot change who wins or the price |
| Equal Auto ceilings together | Leader = the one the server sequenced first (`levelSequence`), price = that ceiling | Server sequence instead of client timestamps: no clock skew, deterministic |
| Double click / retry with the same Idempotency-Key | One commit; every reply is the same receipt (`Idempotency-Replayed`) | Key lock + stored receipt (ADR 0027) |
| Double submit with two keys | First commits; second is refused (`409`, leader cannot bid manually / not increasing) | A leader's manual bid would only raise their own price |
| Buy Now vs first bid / Auto, or two Buy Now | Exactly one winner; at most one Order | Buy Now is decided under the same auction lock and only before the first bid |
| Seller withdraws an opened auction while the first bid arrives | Exactly one wins: Cancelled with no bidder, or Active with that bidder | Withdraw re-checks `bidderCount` under the same auction lock (FR-AU02/AU10) |
| Disable Auto while a rival bids | One of the two serial results (disable first → rival leads; bid first → Auto answers, then stops while leading) | No partial state; a leading obligation is never dropped |
| Bids in several auctions at once (POL-41) | Never more than 5 live leads/awaiting payments | Per-user lock |
| Price at the 1,000,000 cap | No next bid is offered (`minimumBid: null`); further bids `BidTooLow` | Contract range is 10,000–1,000,000 |

Alternatives considered and rejected: optimistic `expectedVersion` on bids (would
reject most bids in a busy auction even when they are still high enough), client
timestamps for ties (clock skew, spoofable), and an end-time extension for late bids
(POL-38 fixes 24 h; owner decision, see ADR 0030).

## Coverage

Engine unit tests (`src/modules/auctions/auction-engine.spec.ts`, every permutation
replayed in memory):

- every arrival order of the same Auto ceilings → one leader and price;
- equal ceilings in any order → first sequenced leads at the ceiling;
- every order of mixed manual/Auto bids → price only rises, top level leads, only
  `BelowMinimum` depends on order, same final result;
- cap: no next bid at 1,000,000, nothing raises the price; plus the earlier AC-AU03–06
  cases and a 200-round random property test.

HTTP + MongoDB e2e (`test/auctions.e2e-spec.ts`, QA replica set, real concurrent requests):

| Case | Test |
| --- | --- |
| Two bids, different amounts, together (3 rounds) | `race: two people press Bid together…` |
| Two Autos, different ceilings, together (3 rounds) | `race: two people turn on Auto together…` |
| Two equal Autos together (3 rounds) | `race: equal Auto ceilings together…` |
| 8 mixed Autos/bids together (leader fixed; price 650k or 700k by order) | `race: many Autos and bids at once…` |
| Seller withdraw vs first bid (3 rounds) | `race: the seller withdrawing against the first bid…` |
| Leader raised after a tie, then disables | `FR-AU05: a leader who raised after winning a tie…` |
| 6 equal bids together | `simultaneous equal bids…` (existing) |
| 10 ascending bids together | `race: ten ascending manual bids…` |
| Same key ×3 together | `double click…` |
| Two keys together | `double submit with two keys…` |
| Buy Now vs first bid (×3), vs Auto, vs Buy Now | `AC-AU07…` (existing), `race: two Buy Now at once…` |
| Disable vs rival bid (3 rounds) | `race: disabling Auto while a rival bids…` |
| POL-41 across auctions | `POL-41 race…` |
| Cap tie at 1,000,000 | `cap: two Autos at 1,000,000…` |
| Outbid bidder matches the leading ceiling; no lowering | `an outbid bidder who matches…` |
| Auto counts as first bid for Buy Now | `Buy Now disappears once an Auto…` |
| Live: last push after a burst equals REST | `live: after a burst…` |
| Live: ack, push, privacy, worker close, unwatch | `ADR 0031: live watchers…` |

Every e2e race asserts the same invariants after the fact: leader holds the top level
(ties by sequence), price ≤ leader level and on the grid, `bidderCount` = bidder
projections, unique sequences, public history strictly non-increasing from the
current price, and the public JSON validates against the contract.

## Found and fixed by these cases

- FR-AU05: a leader who won a tie and then raised their Auto ceiling could not turn
  Auto off (500 from the commit-time ranking check). The leader now keeps the sequence
  that won the lead ([ADR 0030 amendment](../adr/0030-bounded-auction-backend.md#amendment-2026-10-09--leader-sequence-and-the-price-cap)).
- Web copy said Auto raises "one step each time"; it answers one step above the rival's
  level, which can be several steps above the old price after a manual jump.

- At the cap, `minimumBid` was 1,050,000 in `GET /auctions/{id}`, participation and
  receipts — outside the contract range and impossible to bid. It is now `null`, and
  `BidTooLow` says the cap is reached.

## Order-dependent outcomes that are correct

A ceiling the price has already reached is refused (`BidTooLow`), so the arrival order
can decide whether a middle ceiling enters at all. Example: Autos 600k, 800k and 650k
together → if 600k and 800k are sequenced first the price is 650k and 650k is refused
(next bid 700k); otherwise 650k enters and the price is 700k. The top ceiling leads in
both. This matches "must beat the current price by one step" (eBay behaves the same);
fixing it would need a sealed-bid round, which the scope does not have.

## Gaps from the business review — status

| Gap | Fix | Tests |
| --- | --- | --- |
| Seller saw the bid panel on their own auction | The page reads the seller's own `/me/auction-intakes`; it shows "Đây là phiên của bạn" and, before the first bid, "Rút phiên" (FR-AU02) | Browser on fixture; withdraw race e2e |
| A seller/leader losing eligibility only held the auction at close | Worker sweep + `AuctionHold` system command holds it at once under the auction lock (FR-AU09); bids then get `AuctionClosed`; the close skips it | `FR-AU09: a seller locked mid-auction…`, `…a leader who loses eligibility…` |
| Outbid / cancel / hold only visible on the page | Durable inbox written in the same transaction ([ADR 0032](../adr/0032-member-notification-inbox.md)), bell + `/notifications` | `FR-N03: outbid, won, sold and paid…`, `FR-N03: Buy Now, unsold, Admin cancel…`, `FR-N04: inbox pages…` |
| "Giá chốt" shown for held/cancelled auctions | State-specific price and history labels | Browser on fixture |
| POL-41 counts live leads and unpaid wins, not outbid levels | Kept: an outbid level cannot win without a new action (no runner-up), so it is released | `POL-41 race…` |

## Not covered

- Close at `endAt` racing an in-flight bid in different processes (covered only with
  the server clock pinned: T−1 ms accepted, T refused, double close once).
- Primary step-down/failover during a bid (needs the failover profile).
- Load beyond a few dozen simultaneous requests; Socket.IO with several API instances.
