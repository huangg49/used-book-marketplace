---
version: 1
slug: "apps-user-web-src-pages-profilepage-tsx"
primary_target: "apps/user-web/src/pages/ProfilePage.tsx"
related_targets: ["apps/user-web/src/pages/ProfilePage.module.css", "apps/user-web/src/pages/MyBooksPage.tsx", "apps/user-web/src/pages/MyBooksPage.module.css", "apps/user-web/src/components/AccountMenu.tsx", "apps/user-web/src/components/AccountMenu.module.css", "apps/user-web/src/components/Header.tsx", "apps/user-web/src/layouts/DashboardLayout.tsx", "apps/user-web/src/layouts/DashboardLayout.module.css", "apps/user-web/src/pages/profile/components/DashboardSidebar.tsx", "apps/user-web/src/lib/account-navigation.ts", "apps/user-web/src/hooks/useAccountLogout.ts", "apps/user-web/src/lib/routes.ts", "apps/user-web/src/app/router.tsx", "apps/user-web/src/services/my-listings.ts", "apps/user-web/src/components/BookJourneyStates.tsx", "apps/user-web/src/components/BookJourneyStates.module.css"]
---

# Tài khoản và kệ sách cá nhân

Mode: Operate. Code-led extension of the approved wine/cream bookshop world.
Initial scope: WEB_MEMBER_NEXT_PAGES_PLAN §4 replaced the mock dashboard with a
real owner shelf. Owner-approved follow-up11/10 separates profile/shelf and adds
a click disclosure on **Tài khoản**, with shared desktop/mobile destinations.
Established wine/cream, Anton/Be Vietnam Pro and paper task world remain fixed;
no new identity, tokens, shipping rasters or API/session contract.

THESIS: Personal navigation distinguishes account identity from posted books.
OWN-WORLD: Quiet paper facts and actual-copy shelf inside the existing bookshop.
STORY: Tài khoản → Hồ sơ của tôi `/profile`, Kệ sách của tôi `/my-books`,
Đề nghị đổi sách `/exchange/mine`, or Đăng xuất. No top-level shelf button.
FIRST VIEWPORT: Desktop retains the200px personal rail and task canvas;
read-only profile uses an880px maximum sheet rather than a dashboard of metrics.
Mobile retains the labelled **Không gian cá nhân** disclosure above one column;
the global menu exposes the same shared account destinations.
FORM: `accountNavigation` supplies Header desktop/mobile and Sidebar; actual
SessionClient identity supplies name, email and ACTIVE/RESTRICTED/LOCKED labels.
The decorative circular initial derives from the name and has no avatar claim.
The security action opens real `/forgot-password`; no update-profile endpoint,
edit/save UI, balances, trust scores, charts, orders or bid history is invented.

## Navigation and profile recipe —11/10/2026

Desktop account disclosure appears above1000px. Click toggles; ArrowDown opens
and focuses the first native link; Escape closes and restores trigger focus.
Outside pointer, Tab exit, route change and narrowing close it. It uses a286px
paper panel,12px corners,8px padding, bounded viewport scrolling and quiet overlay
shadow. Rows are at least46px, with wine icons, existing shelf-ground hover and
sand selection. Trigger is at least44px with2px cream focus/4px offset; its scoped
selector must retain that contrast against DashboardLayout's general focus rule.
Panel links/logout use an inset2px wine focus outline. Entry translates−6px→0
once over180ms; chevron rotation is180ms. Owner11/10 scoped overrides retain both
durations under OS reduced motion. No hover-only opening or autoplay.

Profile sheet:12px corners/32px padding,64px initial, real name/status above a
quiet divider; definition-list facts use160px label columns/24px gaps and row
padding. At600px:24px20px sheet padding,52px initial, labels above values with8px
gap/20px row padding. Long name/email wraps. Recovery action remains at least44px,
and the separate shelf link at least48px. No loading fact is replaced with a mock.

Dashboard guest guard preserves destination pathname/query in login returnUrl.
Legacy `/profile?moderation=…` or `?cursor=…` redirects to `/my-books` with query
intact. Authenticated pathname changes focus the new H1 and set its tab title;
query-only shelf changes retain focus, and leaving restores the product title.
Shared `useAccountLogout` awaits session revoke, guards duplicate requests and
shows retryable alert failure. Success navigates even after auth unmounts the
initiating menu. Existing session/token semantics remain authoritative.

## Preserved owner-shelf recipe

The previous shelf moved to MyBooksPage: GET `/me/listings`, moderation filters,
URL cursor, actual owner photographs, metadata recovery, errors and pagination.
Desktop keeps a broad paper shelf, one primary posting action, complete photos
and distinct moderation/visibility/trade/condition/mode/value labels. Mobile rows
use a small contained photo and wrapping metadata. Title/authors come from the
confirmed public catalog or the owner's pending catalog request. Errors/retry
remain independent; no synthetic title/data substitutes. Only Approved/Visible
listings link to public detail. Filters clear cursor; page count covers loaded
records only. No edit/removal mutation or invented total is added. The shared
initial-empty illustration below remains the sole raster exception in this scope.

## Evidence and limits —11/10/2026

Opened all seven final captures under root `.impeccable/review/account-menu/`:
`menu-desktop.png`, `profile-laptop.png`, `shelf-desktop.png`, `profile-mobile.png`,
`mobile-navigation.png`, `menu-floating.png`, `focus-desktop.png`. They show the inherited wine/cream
paper world, desktop/floating disclosure, separate real-data profile/shelf and
mobile navigation; the dedicated keyboard capture shows the cream trigger outline
inside DashboardLayout. Logical viewports1280×720 and390×844; capture bridge output
may scale/remove scrollbar: desktop menu/profile1265×712, shelf1280×720, mobile
navigation375×811 and full-page profile375×926. See the
[evidence index](../../../../.impeccable/review/account-menu/README.md).

Implementer-reported QA used real isolated Nest/Mongo `*_test`, synthetic identity
and listing, fake storage/Sharp and local mail. Click/Escape/ArrowDown/Tab/Enter,
H1 focus, outside close, mobile route close, filtered empty/populated shelf,
legacy query redirect, guest return and Home logout were exercised. TypeScript,
build and65unit tests passed; lint0errors/5pre-existing Exchange warnings. One
mechanical detector returned`[]`; this documentation pass reran no checks/browser.
Fresh AI full review returned oneP2 trigger-focus specificity finding. After the
scoped correction and final recaptures, the reviewer returned **ship**, scoring
that single finding resolved. This verdict pass is not a new whole-surface audit.

NOT RUN: browser integration harness, logout network-failure runtime injection,
pagination beyond20, all state combinations,200% text/zoom, NVDA/TalkBack,
physical mobile, RN/Flutter, live storage, human acceptance and CI. READINESS
gates remain separate. No new sidecar/token spec is needed for this extension.
Pre-existing drift: PRODUCT's scaffold line and unrelated older motion-reduction
recipes lag later approved implementations/policy; reported without repairing
them here. Unrelated Chat/Notifications/MainLayout/Home work remains outside scope.

## Historical combined-route and registration scope

The initial Account batch placed the owner shelf at `/profile` and replaced a
disconnected Register form with an availability-only scene. Later approved Auth
library papers and the account-auth follow-up connect actual registration,
verification and recovery/reset commands. “Registration/reset unavailable” is
historical rather than current capability. The earlier account-shelf/register
captures and finish verdict document that batch, not the new route separation.
The earlier four-width acceptance covered filters/Back, empty/error/retry, long
title, pending/state labels, owner media and guard/logout; native/human gates
remained separate. The initial-empty-shelf extension below still applies at
`/my-books` with the same query-state semantics.

## Approved initial-empty-shelf extension —11/10/2026

Mode: Operate. Inherited direction seed: `20e973c0`; established wine/cream
penguin world, code-led extension; no new world or composition workshop.
THESIS: The empty shelf points to the first real posting action.
OWN-WORLD: Flat paper, wine/cream control and the existing penguin/bookshelf;
empty.webp has alpha,800×600 dimensions, adjacent provenance and prompt sidecar.
STORY: Owner query returns no rows; initial unfiltered page invites `/sell`.
Filtered empty and cursor-page empty retain distinct compact text/actions.
FIRST VIEWPORT: Text left,300px art right/32px gap/40px8px padding. At760px
art above/max240px,16px gap and24px8px32px padding. Existing account shell stays.
FORM: Shared EmptyOwnerShelf uses both cursor and moderation filter to decide
the illustration; clear-filter callback, URL/query, pagination and owner facts stay.
QUALITY BAR:48px initial primary, wrapping copy,3px wine focus/4px offset;
decorative contain image with empty alt/aria-hidden/no pointer input; no autoplay.
FINISH: Supersedes no-new-raster only for initial empty shelf. `story-empty-*`,
`story-filter-*` and `story-cursor-*` are labelled component QA, not full owner
authentication/query proof. Keep independent review/provenance; gates stay open.
