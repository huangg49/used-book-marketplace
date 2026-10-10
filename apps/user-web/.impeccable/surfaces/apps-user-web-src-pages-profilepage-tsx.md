---
version: 1
slug: "apps-user-web-src-pages-profilepage-tsx"
primary_target: "apps/user-web/src/pages/ProfilePage.tsx"
related_targets: ["apps/user-web/src/pages/ProfilePage.module.css", "apps/user-web/src/layouts/DashboardLayout.tsx", "apps/user-web/src/layouts/DashboardLayout.module.css", "apps/user-web/src/pages/profile/components/DashboardSidebar.tsx", "apps/user-web/src/pages/RegisterPage.tsx", "apps/user-web/src/services/my-listings.ts"]
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
No marketing hero, new raster assets or autoplay. Existing shared Header stays.

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
