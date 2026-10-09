# ADR 0031: Live auction updates over WebSocket

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
