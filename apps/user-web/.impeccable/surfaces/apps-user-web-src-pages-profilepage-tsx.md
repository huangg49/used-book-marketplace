---
version: 1
slug: "apps-user-web-src-pages-profilepage-tsx"
primary_target: "apps/user-web/src/pages/ProfilePage.tsx"
related_targets: ["apps/user-web/src/pages/ProfilePage.module.css", "apps/user-web/src/layouts/DashboardLayout.tsx", "apps/user-web/src/layouts/DashboardLayout.module.css", "apps/user-web/src/pages/profile/components/DashboardSidebar.tsx", "apps/user-web/src/pages/RegisterPage.tsx", "apps/user-web/src/services/my-listings.ts", "apps/user-web/src/components/BookJourneyStates.tsx", "apps/user-web/src/components/BookJourneyStates.module.css"]
---

# Tài khoản và kệ sách cá nhân

Mode: Operate. Code-led extension of the approved wine/cream bookshop world.
Approved scope: WEB_MEMBER_NEXT_PAGES_PLAN §4, existing `/profile` route.
Replace the legacy mock dashboard with the authenticated member's real shelf.
No balances, trust scores, charts, orders or bid history without actual data.

Desktop: compact account navigation beside a broad paper shelf. Identity from
SessionClient, one primary posting action, moderation filters with URL state,
actual owner listings with complete photographs and separate state/price labels.
Mobile: labelled account disclosure above one column; rows use a small contained cover.
No marketing hero or autoplay. The later approved initial-empty illustration
below is the only new raster exception here. Existing shared Header stays.

Use GET /me/listings pagination and filters, owner photo reads; title/authors
come from confirmed public catalog or the owner's catalog request when pending.
Show errors/retry independently; never substitute synthetic title/data. Only
visible approved listings link to public detail. No edit/removal mutation added.
Auth guest returns to login/profile, restoring state visible, logout via existing
session service. Account fields read-only; registration/reset remain API-gated.
The existing `/register` scaffold becomes an honest unavailable state using
Login's existing photograph/cream split and credit, with discovery/login links.
No unconnected form, OAuth/identity claim or simulated account success remains.

Acceptance: four responsive widths, filter/Back, empty/error/retry, long title,
pending and visibility/trade labels, owner media read, auth guard/logout. Cursor
counts only loaded page; no invented total. Gate/native/human remain separate.

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
