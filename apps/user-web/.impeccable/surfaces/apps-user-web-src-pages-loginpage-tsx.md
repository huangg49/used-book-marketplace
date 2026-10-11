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
requires all authored Auth motion even with OS reduced motion; the stamp also
keeps its280ms animation. No initial entrance or autoplay.
Login success uses one continuous diagonal paper flow: desktop1600ms/30 fragments, mobile≤600px1500ms/18 fragments, plus only destination-ready latency. Stamp280ms and tear280ms start remain under either OS preference. Two inert printed halves separate12px/1.8deg then disappear under the approaching pages; display:none hides copies reliably despite their child visibility:visible. Four cached irregular fragment shapes use cream/paper with sparse yellow, faint ink and soft wine-at8% cast shadows; no solid wine fragments. Three large curved vector pages carry existing ivory-paper texture; two angled foreground edges expose depth. An oversized primary page has a proven opaque rectangular core through bounded drift. It moves into and out of view; no full-scene alpha fade. Absolute motion time/rAF continues while navigation awaits; separate release time stays0 until actual React destination DOM commit and two paint boundaries. Full coverage is painted before navigation. Back/unmount cancels the loop, pending mount acknowledgement, local copies, texture callback and scroll lock; final H1/main focus remains. No-Canvas retains440ms technical cover fallback, never selected by OS preference. No dependency/API/session/token changes.
Drafts survive ordinary switches.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
