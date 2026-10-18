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

Desktop: compact participant/back/status header over a joined paper workbench.
Agreement left and chat right share top/bottom edges; the agreement scrolls
independently with its heading retained, while messages scroll above the composer.
Ready create-order/payment guidance stays at the agreement's bottom; scroll the
sheet to inspect the remaining price/context/history. The workbench uses
clamp(580px,100dvh -208px,900px) height above760px. Below that, the sheet returns
to natural page flow and two labelled panel buttons preserve mounted drafts.
The chat remains bounded with a480px minimum. Long names/titles wrap.

Book title/author, mode, listed/agreed price and next action carry the hierarchy.
An accepted price is1.5rem on desktop/1.25rem on mobile; opening the secondary
price-edit form does not change it. No marketing footer. Typed agreement events
show the most recent change by default; an aria-expanded control exposes the
complete fetched history in a bounded region. User text is never a system event.
Inbox cards lead with title/partner, then actual mode/status and next step; card
links retain44px targets. Shelf/error/hover roles are scoped locally, not global.

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
Layout follow-up evidence: `.tmp/chat-workspace-layout-final-qa`,1440/900/390px
and320px at130% text. Source/visual review was performed by the implementer;
there is no independent dual-agent or human acceptance claim.
