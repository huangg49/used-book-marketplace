---
version: 1
slug: "apps-user-web-src-pages-loginpage-tsx"
primary_target: "apps/user-web/src/pages/LoginPage.tsx"
related_targets: ["apps/user-web/src/pages/LoginPage.module.css","apps/user-web/src/layouts/AuthLayout.tsx","apps/user-web/src/layouts/AuthLayout.module.css","apps/user-web/src/layouts/auth-paper.ts","apps/user-web/src/pages/RegisterPage.tsx","apps/user-web/src/pages/ForgotPasswordPage.tsx"]
---

# Auth — reader's library papers

Mode: operate. Auth-only visual replacement requested by the owner. Preserve
SessionClient, native required/email validation, password reveal, errors and safe
returnUrl. Existing registration/recovery APIs are absent: those sheets disclose
that clearly and collect no credentials. No mutation or token-store additions.

## Direction contract

THESIS: Old books carry readers' traces. Enter through a central three-sheet
library file, replacing the incumbent split-screen photo/form composition.

OWN-WORLD: Existing wine/photo/cream/logo; original local Davit Margaryan image
with source provenance kept in the asset README, textured paper, ink underlines. Be Vietnam Pro controls,
Bricolage headings, owner-supplied MTD Fancy Melody pencil notes and errors (Vietnamese glyph correction).

STORY: Identify the reader card, enter email/password, recover from clear errors.
Register/recovery turn to honest unavailable sheets. Real login succeeds before
“ĐÃ MƯỢN” appears; turn to the existing safe returnUrl (home by default).

FIRST VIEWPORT: 480px central paper stack, two offset sheets, wine top edge,
original wine logo and card kind in its header. Greeting/form/primary action are
one reading column. One randomized pencil note at right; small brand story at
bottom left. Visible photo credit removed at the owner’s request11/10. On mobile
note moves above paper; story disappears and paper remains in document flow.

FORM: User-pinned paper-file concept and supplied “Lật Lại · Đăng nhập.html”
prototype; code-led, seed477df3fa acknowledged and superseded by explicit brief.
Native controls and real route links, meaningful page-turn/stamp only. Current
sheet becomes inert during turn; next heading receives focus. Reduced motion
omits spatial transitions, uses140/160ms fades and keeps the success stamp static.
Normal motion turns out320ms and in380ms around the left edge, reversing on return
to Login. No initial entrance. Interruptions cancel only their own animation.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
