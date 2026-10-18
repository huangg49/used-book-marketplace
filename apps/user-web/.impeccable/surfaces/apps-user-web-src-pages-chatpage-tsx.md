# Chat và thông báo Member

## Conversation guidance —18/10/2026

Owner requested understandable chat usage across purchase/exchange flows.
Operate; preserve wine/cream, API, receipts, money rules and status permissions.
No new messaging backend, native screen or shared inbox.

Purchase rooms name the partner and buyer/seller role, show the book/title/listed
price, and distinguish conversation → delivery information → order. One guidance
area selects the next action by role, state, fulfillment and quote freshness.
Address submission and seller creation keep their existing routes/dialog; buyer
payment retains its retry intent. Order states use existing Vietnamese labels
and link to the order. OrderCreated becomes read-only in the mounted room,
matching the existing API. Deadline timers refresh guidance with cleanup.

Inbox rows include book titles/role, initially ten rows plus a selected row;
public listing reads share the existing cache. An explicit link directs Exchange
users to their exchange list. Narrow rooms use a compact heading, back link and
wrapped progress labels. A greeting suggestion fills a draft, never sends it.

Exchange ChatPanel shows give/receive titles, partner, state and an anchor to the
action area. Loading/empty/history failure are distinct; cached messages and
failed-send drafts survive errors. Fetch/invalidation keys include the actor.
Member text is not classified as a system notification from its prefix. Step
labels no longer claim acceptance while pending; delivery copy points to actual
transaction controls instead of informal chat confirmations.

Verification:147 web unit tests, lint/build/typecheck; six pre-existing warnings
elsewhere. One detector returned0 findings. Browser1440/390px and320px130% used
intercepted HTTP plus isolated Socket.IO: buyer/seller guidance, quote submission,
mounted OrderCreated transition, lost-ACK message dedupe, seller-order/payment
same-key/body retry, exchange history recovery and retained drafts passed.
Local captures: `.tmp/chat-guidance-qa`. Durable fixture runner:
`pnpm --filter @used-books/user-web test:chat:browser` (ports5193/5195).
No application DB/bucket, native, live-provider or remote-CI acceptance.
Financial/inspection audit findings and READINESS remain unchanged.

Mode: Operate. Code-led expansion of the incumbent wine/cream task surfaces,
approved WEB_MEMBER_NEXT_PAGES_PLAN §5. Keep the shared Header. Chat omits the
marketing footer so the composer has room. No new raster or decorative motion.

Chat uses the existing GET /me/purchase-conversations list (up to100 server-side),
messages and Socket.IO purchase-chat namespace; no invented inbox endpoint.
Desktop list beside selected conversation, mobile list or room with a labelled
back link. Actual participant name, book when public read available, exact hold
expiry and closed state. Retain readable history during disconnect; sending and
failure are explicit. An uncertain message retries its original messageId/body,
not a new command. No optimistic server success, payment or new negotiation flow.

Notifications: real inbox, title/body/date/read status and existing auction target.
List rows and clear loaded/empty/error/retry/pending read state; no invented kind
filter or fake unread count. Mark-all failure visible and does not claim success.
Home/header bell and notification-opening hook outside this scoped UI remain.

Acceptance: desktop/laptop/mobile/320, guest return, list/room/history/empty/error,
real send/disconnect recovery where QA permits, read states. API gates, native,
human review and live storage remain separate.
