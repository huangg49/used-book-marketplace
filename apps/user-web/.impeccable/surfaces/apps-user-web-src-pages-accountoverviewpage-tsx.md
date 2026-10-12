# Tổng quan cá nhân

Primary target: `apps/user-web/src/pages/AccountOverviewPage.tsx`.
Related: AccountOverviewPage.module.css, OwnerListingRow.tsx, MyBooksPage.tsx,
MyBooksPage.module.css, owner-listing-queries.ts, owner-listing-labels.ts,
wallet.ts, account-navigation.ts, routes.ts, app/router.tsx.
Mode: Operate. Approved plan: `docs/design/WEB_PROFILE_BLEND_PROPOSAL.md`.

## Refinement contract — 12/10/2026

Owner feedback: the shipped overview feels ordinary; requested more character
and intelligence. Confirmed scope: Tổng quan first, Hồ sơ later. This is a local
bolder/refinement pass in the incumbent world, preserving the rail, greeting,
wallet strip and shelf/activity composition. No new visual system or image comp.

THESIS: Recognize the owner and point to the next useful shelf action.
OWN-WORLD: Existing wine/cream, Anton and original posting penguin. The greeting
uses wine at full strength with cream type/actions; surrounding work stays quiet.
STORY: Greeting → actionable shelf check → read-only wallet → recent books/activity.
FIRST VIEWPORT: One wine greeting with the real owner's name and contained
existing illustration, followed by one unboxed shelf-task area. Three compact
filter links show presence, never totals. Wide priority left / filters right;
mobile flows in DOM order. Keep actual four owner books as the work area below.
FORM: Three independent owner/filter/limit1 reads determine rejected > draft >
pending priority across the shelf, rather than inferring from the recent four.
Failure/loading/403 remain explicit, with local retry and no false all-clear.
FINISH: Build/test/browser, one detector and independent review/documentation;
bounded desktop/mobile capture rounds. No new aggregate, API or auth behavior.

The shipped comparison below records the original phase1 baseline; refinement
evidence is kept separately under `.impeccable/review/account-overview-refined/`.

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

## Shipped refinement comparison — 12/10/2026

Source: `codex/account-overview-refine`, base `5350059`. This comparison follows
the Refinement contract above; the phase1 comparison remains historical.
The documenter compared final AccountOverviewPage.tsx/.module.css,
overview-shelf-focus.ts and its unit cases, and tests/account-overview.mjs with
PRODUCT.md, incumbent DESIGN.md/.impeccable/design.json and all11 latest captures
in the [refinement evidence index](../../../../.impeccable/review/account-overview-refined/README.md).
This is an ordinary local refinement; the global system files are preserved.

### Character, hierarchy and responsive form

The greeting now uses the existing wine ground and cream title, owner name,
body and actions. Its Anton H1 retains the account-heading size and local1.2
line height. The owner name is bold Be Vietnam Pro at
`clamp(1.125rem,1.6vw,1.375rem)`/1.7; it wraps without truncation. The cream
posting action retains44px minimum height and8px corners, with the existing
yellow hover/focus role. The shelf link remains cream. The original256×256
`post.png` is contained in a cream square with12px corners and4° rotation:
136px with12px padding,124px at1150px and below,68px with5px padding at760px
and below. Intrinsic dimensions, empty alt/aria-hidden and async decoding stay.
Its existing prompt/hash sidecar and asset provenance are unchanged.

Greeting padding is24px32px, then24px28px at1150px and24px at760px; its
gap is24px, then8px on narrow screens. The added shelf-task area is unboxed,
with16px block padding and a fine lower rule. The dynamic advice is the18px/1.5
Be Vietnam Pro section H2 and supplies its accessible label directly. There is
no eyebrow or Library ornament. Supporting text is13px/1.8 with48ch maximum;
the action and retry controls retain44px minimum height.

Wide task layout uses `minmax(0,1fr)`/`minmax(0,1.1fr)` with24px gap, equal
columns at1150px, then one column with16px gap at760px. Three ruled presence
links use13px labels,12px status text and80px minimum height. At380px and
below they become full-width52px rows, keeping label, status and arrow readable.
DOM order is greeting → shelf task → wallet → recent books/activity. Existing
workspace columns and their1150/760px stacking remain; recent-book and activity
spacing is adjusted locally. Wallet padding is16px block with12px bottom margin.
No new shadow, global token, font, raster, dependency or animation engine lands.
Existing170ms color/background transitions remain under OS reduced motion per
owner policy, with yellow focus outlines inside the wine greeting.

### Useful advice from bounded owner reads

Three independent existing owner-listing queries request limit1 for Rejected,
Draft and PendingReview, keyed by owner/filter/limit. They refetch on every
overview mount. Advice prioritizes Rejected → Draft → PendingReview only after
the reads complete successfully. Loading and a failed read never become an
all-clear;403 leads to account status, and retry refetches failed non403 reads
locally. Presence labels describe each read without a count. All three successful
empty reads offer posting; they do not assert that the whole shelf is empty.
The draft action opens the existing filter without promising edit/resume.

The recent four owner rows remain a separate read; a rejected item outside those
four can still drive the advice. Read-only simulated wallet, three-notification
preview and existing notice-open behavior remain. No aggregate, full-shelf scan,
polling, API, auth/session, permission or persistence change is introduced.
Profile and other pages are outside this refinement; unrelated teammate work
is not included in this comparison.

### Evidence, disposition and limits

Implementer-reported build/102unit tests/lint PASS with five existing Exchange
warnings and the existing bundle advisory. The documenter reopened all11 latest
captures: desktop, laptop, mobile, narrow, focus-error, draft-priority,
rejected-priority, partial-error, empty-desktop, empty-mobile and locked. They
show the wine greeting, direct H2 advice, responsive presence links and explicit
error/empty/403 states. Synthetic long titles and fake green photographs test
wrapping/private reads rather than production image variety.

[checks.json](../../../../.impeccable/review/account-overview-refined/checks.json)
records11 Chromium scenario groups using real Nest/Mongo on isolated disposable
`*_test` data and fake storage. The harness tests a rejected item below the recent
four, incomplete-read recovery, owner switching, locked-member403, independent
full-shelf pagination, wallet/photo retry and notification opening. This
documentation pass inspected source/evidence without rerunning product tests,
browser scenarios or the detector.

The one detector advisory is the greeting name's fluid1.375rem (22px) endpoint
outside the documented ramp. It is an intentional local size beneath the Anton
H1, not a new global typography role or a zero-finding result; no second detector
ran. The implementation session reports oneP2 eyebrow finding from the full
independent finish review. After removing the eyebrow/Library ornament and
recapturing all11 states, the same reviewer returned **ship**, scoring thatP2
resolved. This verdict pass covers the scored fix; it is not a new whole-surface
audit or human acceptance.

Actual browser zoom125%/200%, Safari, speech screen reader, physical mobile,
native/RN/Flutter, live Supabase, human review and remote CI remain NOT RUN.
Only main-content CSS zoom200% is exercised. Synthetic auction targets do not
prove a full auction or wallet-mutation flow. READINESS gates remain unchanged.

Not canonized or repaired: the earlier global Account destination/scope prose,
sidecar Account recipe and global reduced-motion descriptions still predate
this overview; PRODUCT.md's register/profile-scaffold description also predates
the later real auth/account work. These are existing context drift, preserved
outside this local write boundary. The removed eyebrow is not a reusable rule;
the22px owner-name exception stays local to this surface.
