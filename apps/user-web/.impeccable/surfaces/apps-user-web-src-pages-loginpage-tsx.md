---
version: 1
slug: "apps-user-web-src-pages-loginpage-tsx"
primary_target: "apps/user-web/src/pages/LoginPage.tsx"
related_targets: ["apps/user-web/src/pages/LoginPage.module.css","apps/user-web/src/layouts/AuthLayout.tsx","apps/user-web/src/layouts/AuthLayout.module.css","apps/user-web/src/layouts/AuthPageLink.tsx","apps/user-web/src/layouts/auth-paper.ts","apps/user-web/src/pages/RegisterPage.tsx","apps/user-web/src/pages/ForgotPasswordPage.tsx"]
---

# Auth — reader's library papers

Mode: operate. Auth-only visual replacement requested by the owner. Preserve
SessionClient, native required/email validation, password reveal, errors and safe
returnUrl. Registration/recovery now have full frontend forms at the owner's
request; their absent APIs are disclosed beside native-disabled submission
actions. Draft fields stay only in Auth memory. No request or token-store addition.

## Direction contract

THESIS: Old books carry readers' traces. Enter through a central three-sheet
library file, replacing the incumbent split-screen photo/form composition.

OWN-WORLD: Existing wine/photo/cream/logo; original local Davit Margaryan image
with source provenance kept in the asset README, textured paper, ink underlines. Be Vietnam Pro controls,
Bricolage headings, owner-supplied MTD Fancy Melody pencil notes and errors (Vietnamese glyph correction).

STORY: Identify the reader card, enter email/password, recover from clear errors.
Registration has name, email, password/reveal and confirmation. Recovery has an
email field and librarian note. Real login succeeds before “ĐÃ MƯỢN” appears;
then navigate to the existing safe returnUrl (home by default).

FIRST VIEWPORT: 480px central paper stack, two offset sheets, wine top edge,
original wine logo and card kind in its header. Greeting/form/primary action are
one reading column. One randomized pencil note at right; small brand story at
bottom left. Visible photo credit removed at the owner’s request11/10. On mobile
note moves above paper; story disappears and paper remains in document flow.

FORM: User-pinned paper-file concept and supplied “Lật Lại · Đăng nhập.html”
prototype; code-led, seed477df3fa acknowledged and superseded by explicit brief.
Native controls and real route links. Owner superseded hinged page turning with
a physical card shuffle: pull the top sheet fully to the right, lower it behind
the stack, tuck it into the bottom as the actual next form advances. One850ms
WAAPI sequence, always in the same direction; no yaw flip or carrier fade.
On screens wider than600px, Auth uses56px/48px vertical outer padding and a shared paper minimum clamp(590px,100dvh−104px,660px). This is a minimum, not a fixed or clipping height: errors and enlarged content can grow and scroll. The polite status sits absolutely below the paper without reserving empty flow space. At height800px or less, paper vertical padding becomes22px/14px, header bottom padding/margin10px/12px, footer top padding8px; form lede12px, field/grid separation10px, submit top14px, registration top8px with no extra top padding. Input16px/46px and button48px are unchanged. At1000–1100px the reader note remains beside the stack with26px gap; below1000px it stays above. Mobile keeps its natural stacked flow.
Foreground form is flat at rest for crisp text; only rear papers remain tilted.
Opaque textured front/back, shared2200px perspective only during shuffle, meaningful light/contact
shadow changes. Current and underneath forms are inert during motion, live status
announces the change and the destination H1 receives focus. Owner explicitly
requires this finite Auth shuffle even with OS reduced motion; the stamp alone
still becomes static under that preference. No initial entrance or autoplay.
Success holds the stamp650ms before shuffling. Interrupted routes/unmount cancel
all handles and pending navigation; drafts survive ordinary switches.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
