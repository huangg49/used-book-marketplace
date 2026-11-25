# ADR 0031: Live auction updates over WebSocket

> Live auction đã nhập main qua PR28 (`da59199`). Giới hạn chưa có durable inbox
> thuộc phạm vi ban đầu của quyết định này; inbox bổ sung theo [ADR0032](0032-member-notification-inbox.md).
> Trạng thái branch/review dưới đây là mốc lịch sử, không thay [SESSION_STATE](../handoff/SESSION_STATE.md).

Date: 2026-10-09. Status: implemented on branch `feature/auction-web` (on top of
`feature/auction-backend`, [ADR 0030](0030-bounded-auction-backend.md)). Needs human
review before merge.

## Context

Auction pages polled `GET /auctions` (30 s) and `GET /auctions/{id}` (10 s). Bidders
saw other bids and the close late and kept loading the API. SRS FR-N03 and §8 make
realtime a supplementary channel: the durable source stays REST, and a countdown must
show a concrete end time so the page still makes sense without the connection.

Auctions change in three places: member commands in an API process, the close and
payment-expiry worker in the separate `order-worker` process, and Staff/Admin
operations. The worker has no socket server. The app database role (`latlai_app`)
has `find/insert/update` only, so MongoDB change streams would need a new
`changeStream` privilege and a `db:bootstrap` re-run on every environment.

## Decision

- Socket.IO namespace `/auctions` on the API server (`AuctionGateway`), public and
  read-only: no token is read and no command is accepted. Bidding, Auto ceilings, Buy
  Now and payment stay on the REST command protocol (Idempotency-Key, receipts).
- Client → server, all with acknowledgement:
  - `auction:watch` (auction id) → `{ ok: true, auction: PublicAuction }` or
    `{ ok: false, code: VALIDATION_ERROR | NOT_FOUND | RATE_LIMITED | CANCELLED }`.
    The ack is the resync point after every (re)connect. At most 20 auctions per socket.
  - `auction:unwatch` (id), `auctions:watch`, `auctions:unwatch`.
- Server → client:
  - `auction:update` to room `auction:{id}`: the `PublicAuction` body of
    `GET /auctions/{id}`.
  - `auction:summary` to room `auctions`: the `PublicAuctionSummary`; a state other
    than `Active` means "remove from the open list"; an unseen id means "newly opened".
- Payloads are produced by the same `readPublic` as REST, so ceilings, user ids and
  bidder identities never travel; only anonymous aliases do. Each client still reads
  its own participation (`/me/auctions/{id}/participation`) over REST when an update
  arrives, so leading/outbid stays private.
- Detection (`AuctionLiveService`) compares the auction document `version`:
  - right after a bid/Auto/disable/Buy Now/payment command commits in this process
    (`nudge`), and
  - every 2 s, only while someone watches: `_id $in` for watched auctions and
    `state: Active` for list watchers (existing indexes, no migration). This covers the
    worker, Staff open, Admin cancel and other API instances without a new database
    privilege or a message bus.
  - Overlapping checks coalesce; a join registers the watch before reading the ack
    snapshot, so a change in between is pushed again instead of missed.
- Clients keep REST polling only as a fallback (detail 10 s, list 30 s while the socket
  is down; detail 60 s while live) and show whether updates are live.

## Consequences

- Other bids, auto-raises, Buy Now and the close reach watchers in about a second;
  the worker close and operations reach them within the 2 s poll.
- Pushes are best effort. A missed push is repaired by the next ack, poll or REST
  read; nothing depends on delivery, and no business state changes over the socket.
- Polling load is proportional to watched auctions, not to viewers, and stops when
  nobody watches. With many API instances each polls on its own; a change stream or a
  Socket.IO adapter (Redis) can replace the poll later without changing the events.
- Not done: no private socket channel (outbid is derived from the REST participation
  read), no durable notification inbox entry for being outbid (FR-N01–N04), and React
  Native/Flutter clients do not subscribe yet.

## Addendum 2026-11-23: client hardening and React Native

Same events, payloads and server protocol; no OpenAPI or migration change.

- **Transport fallback.** Clients connect with `transports: ['websocket', 'polling']`
  and `tryAllTransports: true`. Socket.IO's default (`false`) gives up when the first
  transport fails, so a proxy or network that refuses the WebSocket upgrade left the
  page on REST polling. WebSocket stays first so several API instances need no sticky
  session in the common case; long-polling across instances does need one.
- **Ordering.** Pushes, watch acks and REST reads write the same cache entry and can
  arrive out of order. Each public snapshot carries `serverTime` from the database
  clock, so clients keep the newer one and the shown price never steps back. Equal
  stamps take the incoming copy (Dutch drops). A REST read that started earlier but
  saw a later commit can lose to an older one; the push for that commit repairs it.
- **Private fan-out.** A push no longer makes every viewer re-read participation,
  point orders and notifications. Within a 400 ms trailing window: a guest reads
  nothing private; a member known not to take part reads only on a lifecycle change
  (state/phase); a participant (or one not yet known) also re-reads participation,
  wallet (ADR 0075 holds) and notifications when price, leader or end time move. Point
  orders are re-read only on a lifecycle change. A lifecycle change flushes at once.
- **React Native** subscribes on the auction detail and open-list screens while the
  screen is focused and the app active (`useForeground`); the socket closes in the
  background and resyncs from the ack on return. REST polls every 30 s while pushes
  flow and every 5 s while they do not; past `endAt` on the server clock it re-reads
  every 2 s and shows "đang chốt kết quả" until the worker's close arrives. List pushes
  replace known cards in place and refetch for an unseen one, keeping server order.
- **List tracking** follows the REST order: the bounded list pass (200) reads open
  auctions by `endAt` (state+endAt index), so the 50 cards `GET /auctions` shows stay
  tracked when more than 200 are open.
- Still not done: a per-IP connection limit on the public namespace, Flutter, and a
  private socket channel (own standing stays a REST read).

## Addendum 2026-11-23: shared server clock for countdowns

Countdowns keep showing time on the server clock; the server still decides when
an auction or a payment/acceptance window closes.

- `ServerClock` in `packages/session-client` takes a sample from every successful
  REST response that carries a top-level `serverTime`. The request is timed and the
  stamp is placed at the round-trip midpoint; the shortest round trip wins, and a
  sample older than 2 min gives way to the next one.
- Time advances on `performance.now()`. As of 2026-11-24, disagreement with the
  device date only permits a fresh response to replace the sample. A manual date
  change leaves the countdown alone. If sleep pauses the monotonic clock, a new
  timed REST response brings it current on return.
- Before the first timed response, `createServerNow(serverTime)` advances the
  snapshot's timestamp with monotonic elapsed time. Once synced, the shared
  sample takes precedence over cached data. Without `serverTime` it uses the
  device date for local timers.
- Web `startServerCountdown`/`useCountdown`, the registration and schedule checks,
  and RN auction list, detail, winner-step and home countdowns use it. Detail on
  web and RN also reads REST when the live socket connects or reconnects. On RN,
  the list refreshes both open and scheduled listings at reconnect, and the
  visible countdown resumes when the app returns to the foreground. The socket
  watch acknowledgement updates auction state. At zero the detail shows
  "đang chốt kết quả" while awaiting the server's final state.

## Addendum 2026-11-24: two-member demo updates

- Bid and auto-bid commands wake the affected auction after commit. A subscribed
  detail page uses a 300 ms version check for changes from other processes
  and the worker. The broad public list check still runs every 2 s. A failed
  snapshot read remains eligible for the next pass.
- Web and RN refresh the bidder's private standing as soon as the public price
  or lifecycle changes. Wallet and notification refreshes still coalesce
  during rapid bidding. Bid commands and access to private standing use REST.
- Member Web joins the existing authenticated `/point-orders` channel for
  the winner's order. Seller auction details on Web and RN also use it to
  refresh their own intake and settlement preview. The point-order fallback
  checks watched IDs every 400 ms.
- Member Web and RN watch `/transactions` for exchange details and messages,
  direct sale orders, purchase negotiation state and transaction lists. The
  client sends `transaction:watch` with a resource kind (`exchange`, `order`,
  `conversation` or `inbox`) and ID. The server
  verifies the current Member session and participant or inbox owner, then
  sends `transaction:changed` with only the resource reference. The client
  re-reads the existing authorized REST views on a change or successful watch.
  The server rechecks membership before every push.
- Local commands wake the relevant watchers after a successful commit. A
  400 ms version or message check covers watched resources from other processes.
  Inbox watchers also check for new durable notifications. Reconnection and REST
  fallback cover missed pushes. The live channels use the existing Mongo role
  and schema.
