# Hội thoại và phiếu thỏa thuận Member —19/10/2026

Owner approved one workspace for purchase negotiation and exchange, with a card
inbox at Navbar Chat. Operate; retain wine/cream, shared Header and memory-only
session. Contract/ADR0041 determine permissions and money; visual layout grants
none. Mua ngay remains independent. This supersedes the18/10 inbox-sidebar and
read-only-after-OrderCreated presentation.

`/chat` lists participant-specific book/partner cards, never one public room per
listing. `/chat/start/:listingId?intent=Negotiation|Exchange` preserves the entry
intent through login and opens/reuses a private room. `/chat/:roomId` reads the
selected room directly, including when not among the inbox's latest100 results.

19/10 owner follow-up: reuse the approved18/10 soft3D autumn posting artwork
`/illustrations/posting/autumn-book-desk.webp`, restored byte-for-byte from6394dc4.
MainLayout's Chat-only data attribute owns a fixed viewport-cover background,
removed on navigation away. Inbox/guest/room keep opaque paper/shelf surfaces;
mobile has12px side clearance. The Sell archival background stays unchanged.
The image is decorative and does not replace any real listing cover.

Owner chose “two pages of an open book” after rejecting competing type emphasis.
Book title is theh1 beside the real cover; authors/status support it. Partner name,
role and initial avatar belong to the chat header. A warm shelf ground surrounds
one borderless paper spread with a soft offset ink shadow and a32px gutter at
wide sizes,24px below1100px. A single spine rule separates agreement/chat.

Above960px, both pages share top/bottom edges. Only the agreement body scrolls;
heading and next-action area remain in flex flow, never overlaid on price fields.
Guidance explanations remain in the body. Messages scroll above the composer.
The spread uses clamp(600px,100dvh -284px,860px). At960px and below, two labelled
panel buttons preserve mounted drafts, the sheet returns to natural page flow
and chat has a600px minimum. Long titles wrap; narrow title width is preserved
by stacking Back/cover beside the title rather than across three columns.

Scoped Be Vietnam Pro uses400/700 only. Book title and agreed price are28px,
title24px below760px; body/section/partner are16px, metadata/labels14px. Inbox
headings use the same family, with18px book titles. Forms/dialog behavior and
global navigation/brand are unchanged. Flat phase labels replace numbered circles;
the current phase remains explicit. Own messages use cream rather than a dominant
wine block; primary actions and accepted price retain wine emphasis.

Opening secondary price editing does not alter the accepted value. Typed events
show the latest change, with an aria-expanded control for complete fetched history.
User text is never a system event. No marketing footer. Inbox cards lead with
title/partner, then actual mode/status and next step; links retain44px targets.
Shelf/error/hover roles are scoped locally, not global.

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
Open-book evidence: `.tmp/chat-open-book-final-qa`,1440/1100/900/390px and320px
at130% text; `.tmp/chat-open-book-qa` includes missing cover. The optional runner
flag CHAT_QA_COVER=1 uses bundled alice.jpg on an explicitly labelled `[QA]` book;
it never supplies fallback artwork for production listing photos. Source/visual
review was performed by the implementer;
there is no independent dual-agent or human acceptance claim.
