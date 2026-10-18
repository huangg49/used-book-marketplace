# Hội thoại và phiếu thỏa thuận Member —19/10/2026

Owner approved one workspace for purchase negotiation and exchange, with a card
inbox at Navbar Chat. Operate; retain wine/cream, shared Header and memory-only
session. Contract/ADR0040 determine permissions and money; visual layout grants
none. Mua ngay remains independent. This supersedes the18/10 inbox-sidebar and
read-only-after-OrderCreated presentation.

`/chat` lists participant-specific book/partner cards, never one public room per
listing. `/chat/start/:listingId?intent=Negotiation|Exchange` preserves the entry
intent through login and opens/reuses a private room. `/chat/:roomId` reads the
selected room directly, including when not among the inbox's latest100 results.

Desktop: agreement sheet left, sticky message/composer area right. Mobile: two
labelled panel buttons with preserved mounted drafts. Paper, title, real book,
listed/agreed prices, pending proposal and next action carry the hierarchy. No
marketing footer. Agreement events are typed server data, not detected prefixes.

Seller proposes a permitted mode; the other party confirms. Buyer may request
Exchange. Price proposals require counterpart acceptance; accepted price fills
the seller's create-order dialog read-only. Uncertain operations retain exact
key/body/version with explicit retry. Changed/missing quote cannot silently alter
an existing create attempt. Public listing changes and other reservations lock
new transaction actions while preserving messages/history.

New exchanges are created from the buyer's owned approved exchangeable books and
own saved address on the same sheet; existing Exchange controls remain embedded
for acceptance/funding/shipping/status. Earlier proposals remain selectable.
Linked exchange routes return to the conversation, and original exchange-message
sources remain readable. Legacy independent exchanges appear in the same inbox
and retain their real conversation/transaction history in a matching two-column
sheet/chat layout. Do not infer they have been merged into another room.

Verification and source checkpoint: docs/handoff/SESSION_STATE.md. Runner:
`pnpm --filter @used-books/user-web test:chat:browser`, isolated HTTP fixtures and
Socket.IO5195 with Vite5193. Actual database tests use the separate QA replica set.
Browser fixtures, storage fake, Supabase live, native and human review are distinct.
