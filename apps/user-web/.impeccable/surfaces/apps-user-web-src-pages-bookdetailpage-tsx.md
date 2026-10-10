---
version: 1
slug: "apps-user-web-src-pages-bookdetailpage-tsx"
primary_target: "apps/user-web/src/pages/BookDetailPage.tsx"
related_targets: ["apps/user-web/src/components/ListingGallery.tsx", "apps/user-web/src/components/BookCard.tsx"]
---

# Chi tiết bản sách —11/10/2026

Mode: operate. Approved scope: docs/design/WEB_MEMBER_NEXT_PAGES_PLAN.md §2.
THESIS: Understand the particular used copy before reserving it to open chat.
OWN-WORLD: Preserve wine/cream, Be Vietnam Pro facts and complete photographs.
STORY: Inspect photos, read both labelled prices and condition, understand24hchat.
FIRST VIEWPORT: Shared header and a return to the originating shelf; photograph
and thumbnail gallery left, book title/author/condition/prices/action right.
Below: condition and bibliographic facts in two readable columns, seller facts.
FORM: Code-led refinement of incumbent system; no new comp or direction roll.
Signature: thumbnail selection and protected large-photo viewer, with natural
mobile stacking, no perpetual animation or fixed bottom overlay. Real API photos
only; never substitute catalog imagery. Empty/error/retry remain explicit.
QUALITY BAR: Clear photo selection,44px controls, full images, long-title wrapping,
keyboard/Escape/focus/body-scroll restoration, no invented trust/rating or checkout.
FINISH: Independent AI source/seven-capture review returned SHIP with no material
fixes; scoped canonical documentation now records the implemented Detail recipe.

## Implemented recipe

Detail and the lower condition/bibliographic facts each use1fr/1.05fr columns
with56px gap,36px at1000px and one column at720px. Mobile summary gap is24px;
lower facts gap32px. The latter starts48px below the summary with32px top padding,
or32px/28px on mobile. Title uses Be Vietnam Pro700,
`clamp(1.75rem, 2.5vw, 2.125rem)`/1.4, then1.65rem at720px; prices remain1.5rem,
then1.3rem. Long titles and factual fields wrap naturally.

Gallery is sticky at108px, static/centered within480px at720px. Its photograph
stage uses `clamp(360px, 52vh, 480px)` height and32px32px64px padding; at1000px
height420px/padding24px24px64px, at720px height340px. Real listing photographs
fit contain. Thumbnail buttons are64×80px with6px corners; selected wine border
and `aria-pressed` expose selection. Expand and modal controls are at least44px.
Caption identifies the uploader and current/total photo count. Existing shared
ListingPhoto owns missing/loading/error/retry; thumbnails use an unavailable icon
on image failure, without replacing listing evidence with catalog imagery.

The native `<dialog>` viewer is `min(960px, calc(100% - 32px))` wide with20px24px
padding,12px corners and max-height `calc(100dvh - 32px)`. Large-photo stage is
`min(65dvh, 680px)` high with20px padding/8px corners. At720px the modal uses20px
total clearance/14px padding and60dvh stage height. Native modal focus protection,
labelled close/previous/next, ArrowLeft/ArrowRight cycling and Escape/native close
return focus. Body scroll restores on close/unmount. Gallery focus is2px wine at
3px offset. Photo ground `#efe3cf`, label ink `#5b3428`, viewer soft offset shadow
`0 24px 64px #2a130a40` and backdrop `#281914b3` are scoped Detail roles; the
detector's six palette/type/radius advisories do not normalize other surfaces.

BookCard passes the originating `/books` path/query via `catalogReturn` navigation
state; Detail validates that search route before returning, otherwise `/books`.
Owner/held behavior, guest login return,24-hour reservation explanation,
expectedVersion/idempotency replay and SessionClient transport retain semantics.

## Evidence and limits

Seven raw captures in `.impeccable/review/web-member/`:
`detail-gallery-{desktop,laptop,mobile,320,mobile-action,viewer-desktop,viewer-mobile}.jpg`.
Final review: `.impeccable/review/web-member/detail-gallery-finish.md`. This is a
code-led refinement; no comp/direction roll or new shipping raster was required.
QA used real Nest/Mongo `*_test` and fake storage with synthetic QA photographs
and data. Those images are evidence only. Independent reviewer inspected source
and seven captures; lower facts were reviewed in source and only partly pictured.
Reported browser interaction/build/typecheck/unit/lint results were not rerun by
that reviewer. AI review is not human sign-off or native acceptance.

Full owner/held integration, current-slice missing/error photo browser exercise,
200% text/zoom, native accessibility and human review remain NOT RUN. No release
or READINESS gate closes. Current QA/handoff stays in WEB_MEMBER_REDESIGN and
SESSION_STATE.
