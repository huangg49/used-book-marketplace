# Account menu, profile and shelf — 11/10/2026

Source: `codex/account-menu-profile`, base `96e75c9`; checkpoint subject
`feat(web): separate account profile and book shelf navigation`.
Owner approved a click disclosure on Tài khoản, distinct profile and shelf pages,
and the same destinations on mobile. Existing bookshop world, Operate/code-led
extension; no new visual world, raster assets or auth/API contract.

## Implemented

- Header disclosure: Hồ sơ của tôi, Kệ sách của tôi, Đề nghị đổi sách and Đăng xuất.
  No extra top-level shelf button. Desktop links, mobile menu and sidebar share
  `accountNavigation`; guest login link and notification bell remain.
- `/profile` reads real SessionClient name, email and account status. The initial
  is derived from the name, not a claimed avatar. Password recovery links to the
  existing `/forgot-password` flow. No profile edit endpoint exists, so no fake
  edit/save control or trust/statistics was added.
- `/my-books` retains the previous owner query, photographs, moderation filters,
  URL cursor, page count, metadata recovery and separate listing state labels.
  Legacy `/profile?moderation=…` or `?cursor=…` redirects with query intact.
- Guest guards keep destination pathname and query. Account navigation focuses
  the new H1 and updates the tab title; leaving the dashboard restores the default
  product title. Query-only filter changes preserve focus.
- Logout awaits existing session revocation, guards repeated clicks and exposes
  retryable failure. Success navigates even when auth state unmounts the menu.
  No token persistence or second session store was introduced.

## Verification

PASS: user-web TypeScript, build, 65 unit tests across nine files. Lint: zero
errors, five pre-existing warnings in Exchange source; build retains its existing
large-chunk warning. Final checks after the functional follow-up are recorded in
SESSION_STATE. One mechanical design scan returned `[]`; no second scan.

CUA browser4, agent QA tab5: Vite5187 with real Nest API3009 on an isolated,
generated `ops_browser_*_test` Mongo database/least-privilege user. Existing test
account, synthetic identity/listing and fake storage with Sharp; mail provider
local. This is not main-DB, live Brevo or live Supabase evidence.

Observed: click disclosure; Escape closes and restores trigger focus; ArrowDown
opens/focuses first link; Tab/Enter opens shelf and focuses H1; outside click
closes; selected nav item; mobile global and personal menu close on route change;
Draft filtered empty and PendingReview populated shelf; old profile query goes to
new shelf with filter; guest/login return keeps `/my-books?moderation=Draft`;
floating navbar dropdown; Home logout ends at `/login`; dashboard title cleanup.

Two bounded layout rounds, logical desktop/laptop viewport1280×720 and
mobile390×844, followed by the reviewer's scoped focus correction. CUA's capture
bridge can remove the scrollbar and scale output: desktop/profile/menu PNGs are
1265×712, populated shelf1280×720; mobile navigation375×811 and full-page profile
375×926. These are returned screenshot pixels, not physical-device resolution.
Every saved capture was reopened and validated. Evidence is synthetic test data:

- [Desktop account disclosure](menu-desktop.png)
- [Profile laptop](profile-laptop.png)
- [Owner shelf desktop](shelf-desktop.png)
- [Mobile profile, full page](profile-mobile.png)
- [Mobile global navigation](mobile-navigation.png)
- [Floating navbar disclosure](menu-floating.png)
- [Keyboard focus on the dashboard trigger](focus-desktop.png)

Independent full source/capture review found one P2: dashboard focus specificity
overrode the Account trigger's cream outline. The component selector was
strengthened locally. Seven replacement captures were reopened by implementer
and reviewer; the verdict pass returned **ship**, scoring that finding resolved.
This is a scoped verdict pass, not a new whole-surface audit or human sign-off.
Documentation handoff checked source, all seven captures and incumbent tokens;
DESIGN/surface recipe updated without token-sidecar or unrelated drift repairs.

QA tab closed and temporary API/Vite stopped. The disposable database was
identified by its exact generated name and fixture user's creation time within
six seconds of this task's QA script creation. Only that database/users/roles
were removed on127.0.0.1:57017. Main database and API3000/Vite5186 were untouched.
`pnpm docs:check`:311Markdown/2159relative links PASS; `git diff --check` PASS.

NOT RUN: browser integration harness, logout network-failure runtime injection,
pagination beyond20, all moderation/visibility/trade combinations,200% text/zoom,
NVDA/TalkBack, physical mobile, RN/Flutter, live storage, human acceptance and CI.
Existing API/session tests were not rerun because their source/contracts did not
change. Independent AI finish review is separate from human acceptance.
READINESS gates stay unchanged. No push, PR, merge or deploy in this task.
