# Tổng quan cá nhân — 12/10/2026

Source: `codex/account-overview`, base `2b4e557`; scope phase1 from
[approved plan](../../../docs/design/WEB_PROFILE_BLEND_PROPOSAL.md).
React/Vite Member web only. Existing Profile/MyBooks stay separate. No API,
Mongo migration, session storage, Home, Auth or global token changes.

## Checks run

- Web build (TypeScript/Vite) PASS,99 tests PASS, lint PASS with5 pre-existing
  Exchange warnings; existing large-bundle advisory remains.
- Browser runner `apps/user-web/tests/account-overview.mjs` PASS:9 scenario groups
  listed in [checks.json](checks.json). Real Nest on3009, Vite5192 and dedicated
  QA Mongo replica set57017 with disposable `ops_browser_*_test` database;
  storage fake, no live Supabase. No app/main database writes.
- Guest redirect/returnUrl; limit4 owner preview vs limit20 full shelf,24 items
  and cursor; filter resets cursor; Profile/H1 focus; shared account menu
  ArrowDown/Escape/navigation; owner switch via actual logout/login.
- Real wallet0 shown as0, never inferred from failed reads. Local wallet500/retry
  transport injection, cached-data error flag; shared owner-photo503/retry.
  Notification preview leaves unread rows intact, opening one marks only it read.
  Real LOCKED user produces listing403 distinct from empty while wallet obligation
  read remains accessible. These are scoped UI checks, not a wallet/auction audit.
- Responsive no-horizontal-overflow at1440/1280/390/320; laptop720px high.
  Main-content CSS zoom200% tested (not full browser zoom). Existing OS-reduced
  motion preference does not suppress scoped170ms interaction transitions.
- Detector once, exit0, `[]`, over overview/owner row/shelf UI. It does not prove
  usability or business correctness.

## Screenshot validity

All captures are from document top after fonts/images settled; opened and checked
against filenames. Fake storage intentionally returns solid green test photos;
the repeated long title stresses wrapping. Notifications explicitly say test data.
No production PII/credentials or tokens in evidence. Two self-inspection batches;
compact preview removed duplicate condition/pending/date text, full shelf retains it.

| File | Viewport / state |
| --- | --- |
| [desktop.png](desktop.png) |1440×1000,4 recent books,3 notifications |
| [laptop.png](laptop.png) |1280×720, same populated state |
| [mobile.png](mobile.png) |390×844, populated single column |
| [narrow.png](narrow.png) |320×740, long labels/title wrapping |
| [empty-desktop.png](empty-desktop.png) |1440×900, second owner with no books/notices |
| [empty-mobile.png](empty-mobile.png) |390×844, empty owner |
| [partial-error.png](partial-error.png) |1280×720, wallet refresh500, other blocks usable |
| [locked.png](locked.png) |1280×720, real locked member and listing403 |

## Limits and cleanup

NOT RUN: physical mobile/native/RN/Flutter, Safari, speech/screen-reader runtime,
actual browser zoom125%/200%, live Supabase, human review and remote CI.
No funding/payment/refund/settlement mutation tested or introduced. Auction target
for seeded notifications is synthetic; full auction workflow is outside scope.
One fixture attempt exceeded upload throttling; corrected fixture uses4 uploads
plus20 additional drafts via API, without changing product rate limits.

Runner finally closes browser, Vite, API/fake image service, drops its own database
and QA users/roles. Verified zero disposable browser databases remain. Main API3000
and Vite5186 remain running. QA container started for this run is stopped afterward.
Independent finish-review disposition: **ship**, no material fixes. The reviewer
opened all8 captures and checked persistence, fidelity, ceiling, material fixes
and keep against the approved code-led extension. Keep the quiet wallet strip,
separate state labels, owner query identities, local recovery and asymmetric
shelf/activity hierarchy. Tests above were run by the implementer; the reviewer
did not rerun them. AI review is not human sign-off. No push/PR/merge performed.
