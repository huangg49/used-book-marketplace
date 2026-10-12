# Tổng quan cá nhân

Primary target: `apps/user-web/src/pages/AccountOverviewPage.tsx`.
Related: AccountOverviewPage.module.css, OwnerListingRow.tsx, MyBooksPage.tsx,
MyBooksPage.module.css, owner-listing-queries.ts, owner-listing-labels.ts,
wallet.ts, account-navigation.ts, routes.ts, app/router.tsx.
Mode: Operate. Approved plan: `docs/design/WEB_PROFILE_BLEND_PROPOSAL.md`.

## Direction contract

THESIS: Preserve Minh's greeting, summary, sidebar and recent-work structure;
make real owner books the primary work area, without fabricated metrics.

OWN-WORLD: Existing wine/cream/paper, Anton headings, Be Vietnam Pro body and
Lucide. One existing penguin posting illustration in the greeting. Fine rules
and compact book rows, no new global tokens or dashboard theme.

STORY: Recognize the account, read available/held simulated funds, inspect four
recently updated books, follow shelf filters or three auction notifications.
Profile and full shelf remain separate destinations.

FIRST VIEWPORT: Existing account rail, low cream greeting with CTA left and
penguin right, read-only wallet strip below; wide shelf left, compact activity
right. Mobile stacks in DOM order without a fixed-height viewport.

FORM: Code-led extension, structure explicitly selected by the owner on
12/10/2026, no concept roll/approved image comp. Basis is Minh source36cb0c0
and current account shell. Loading/error/empty/403 are local to each block.

FINISH: Record the independent finish review and shipped surface comparison.
This ordinary extension preserves incumbent DESIGN.md and its sidecar; no new
visual world or system refresh. Reused shipping raster retains its provenance.

## Data and bounds

One memory-only SessionClient. Listings limit4; full shelf retains20/cursor.
Owner/limit/filter/cursor query identities; private identity/photo reuse.
Wallet is read-only and explicitly simulated. Notification preview does not
mark read on mount; user opening an item uses existing read endpoint/cache
invalidation. No orders/cashflow/personal auction list until later contracts.

## Acceptance

1440/1280px, laptop720px high,390/320px, zoom125/200%; keyboard, route focus,
guest returnUrl, sidebar/menu, full-shelf filtering/pagination, owner switch,
loading/empty/partial error, signed-image retry and independent state labels.
Do not infer native or screen-reader runtime PASS from browser rendering.

## Shipped comparison — 12/10/2026

Source: `codex/account-overview`, base `2b4e557`; phase1 was approved in the
implementation session. The proposal now records phase1 as implemented and
keeps phase2/3 outside this delivered slice.
Compared AccountOverviewPage.tsx/.module.css, OwnerListingRow.tsx,
MyBooksPage.tsx/.module.css, owner query/label helpers, wallet service and route
configuration with PRODUCT.md, DESIGN.md, .impeccable/design.json and all eight
final captures in the [evidence index](../../../../.impeccable/review/account-overview/README.md).

The selected Minh structure landed as the existing personal rail, greeting,
wallet strip and asymmetric book/activity workspace. It uses incumbent wine,
cream, paper, ink, muted and rule colors; Anton for the single H1, Be Vietnam Pro
for content/prices and Lucide for task icons. No global token, font, framework,
auth/session storage, API or database change belongs to this slice. No legacy
mock dashboard blocks are imported. Profile and full shelf retain separate
destinations; the shared account destination list adds Tổng quan at `/account`.

### Layout, shape and type

The cream greeting has12px corners,32px36px padding and a24px flex gap. Its H1
uses the incumbent account-heading size (`clamp(2rem,3.1vw,2.75rem)`,400) with
local1.2 line-height; the shelf H1 retains1.18. Name/body text wraps, and the
44px-minimum posting action uses8px corners and wine/cream. Wallet data stays
on the page ground below a fine rule; numbers use tabular figures. The shelf
is a paper section with12px corners and24px padding, while activity remains
unboxed. No new elevation/shadow recipe is introduced.

The workspace columns are `minmax(0,1fr)` and `minmax(240px,.52fr)` with28px gap.
At1150px they stack, with the activity list temporarily using three columns;
at760px activity returns to a vertical list. Greeting padding becomes28px then
24px. Its decorative penguin is156px,124px then64px; narrow placement reserves
heading space. Actions, wallet labels, shortcuts, prices and long titles wrap.
DOM order remains greeting → wallet → books → activity with no fixed-height
viewport or visual reordering. Content may continue below a720px-high laptop.

### Shared owner row and real reads

`OwnerListingRow({ item, compact = false })` is shared by the overview and full
shelf; its DOM/CSS contract is documented in
[UI_COMPONENTS](../../../../docs/design/UI_COMPONENTS.md#member-web--ownerlistingrow).
It retains independent moderation/visibility/trade labels, actual owner photos,
public/private catalog identity, rejection/removal reasons, separately labelled
sale/exchange prices and public links only for Approved/Visible rows. Compact
rows omit condition/mode, the duplicate pending explanation and updated date;
full rows retain those fields. A pending or hidden listing is not relabelled sold.

Overview listings request limit4; the full shelf keeps default20 and cursor.
The shared query key includes owner, moderation, cursor and limit. Wallet uses
the existing SessionClient and validates the read-only VND simulation response
with Zod. Available/transactionHeld are shown with “Ví mô phỏng / Mô phỏng đồ án”;
zero requires a successful server value. No asset valuation, funding/withdrawal
action, order timeline, personal-auction aggregate or fabricated counter is added.

Activity requests at most three existing auction notifications under an owner
key. Fetching the preview does not mark them read. Opening an unread item marks
only its id through the existing service and invalidates notification queries;
navigation leads to its auction. Read-write failure leaves server state
authoritative after refetch and does not claim success. Notification text is
historical activity, not proof of live auction state or payment authority.

### States, motion and raster provenance

Each read block owns loading, empty and local retry/error output. Cached
same-owner data remains visible with a refresh-failure warning;403 substitutes
an account-status link rather than a retry control. Restricted/locked status
has its own notice. The overview's empty shelf uses short text and a posting
link; the full shelf retains its existing initial-empty illustration. Photo
and identity errors have separate retry, and no unrelated public cover fallback.
Owner-keyed queries and the keyed overview root support account switching.
Existing DashboardLayout owns guest returnUrl, route H1 focus and personal menu.

Interaction color/background transitions are170ms ease-out, retained by a scoped
reduced-motion override under the owner's11/10 policy. No section-entry stagger,
autoplay or new animation engine is added. The greeting reuses the original
transparent256×256 `post.png`, contains it without cropping, rotates it4° and
sets empty alt/aria-hidden/async decoding. Its
[prompt/hash sidecar](../../public/illustrations/penguins/post.png.json) and
[asset provenance](../../public/illustrations/penguins/README.md) remain unchanged;
no new shipping raster was generated.

### Evidence, disposition and limits

Implementer-reported web build/99tests/lint PASS (five existing Exchange warnings),
one detector `[]`, and nine Chromium scenario groups PASS with real isolated
Nest/Mongo `*_test` and fake storage. Captures show1440/1280/390/320px populated,
desktop/mobile empty, wallet refresh error and real locked-member listing403.
The documenter reopened all eight captures and compared the final source; this
documentation pass did not rerun product tests or browser scenarios. Independent
finish reviewer disposition supplied by the implementation session: **ship**,
all five review sections examined, no material fixes required. AI review does
not close human acceptance or READINESS gates.

Main-content CSS zoom200% was checked by the implementer; actual browser
zoom125%/200%, Safari, speech/screen-reader runtime, physical mobile/native,
RN/Flutter, live Supabase, human acceptance and remote CI remain NOT RUN.
Seeded notification auction targets are synthetic; the full auction workflow
and funding/payment/refund/settlement mutations are outside this evidence.

Incumbent drift reported, not repaired or canonized: global Account prose lists
the earlier Profile/Kệ/Exchange destinations without `/account`; the sidecar's
Account scope still names the older `/profile`-only recipe. Older DESIGN.md
motion passages say other surfaces retain global
reduction, and the sidecar still records the global `.01ms` override. Those
pre-existing descriptions are not a new rule for this overview; its scoped
170ms override follows current owner policy. Global files are deliberately
preserved because this is an ordinary established-world extension.
