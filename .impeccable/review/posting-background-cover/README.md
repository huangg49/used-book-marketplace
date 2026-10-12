# Posting background coverage

Source: `codex/posting-background-cover`, base `8f15c76`; checkpoint subject
`fix(web): cover posting viewport throughout long forms`.

CSS-only correction: replace width-sized top background and mobile900px height
with a route-owned fixed pseudo-element, inset0/center cover. Root isolation
keeps it behind the existing opaque papers; pointer-events:none preserves input.
Artwork keeps its aspect ratio, cropping side edges as needed on narrow screens.
No image transformation, form logic, API or motion changes.

CUA Chromium on isolated QA Vite5191/Nest3009/Mongo `*_test`/fake storage. Signed
in using the public QA fixture account; did not submit a listing/send email or
write main DB. Temporary QA database/users/roles/runtime/tab removed and viewport
reset. Main API3000 and Vite5186 preserved.

| Evidence | Viewport/state |
| --- | --- |
| [Desktop top](desktop-top.png) | 1440×900, long condition form |
| [Desktop bottom](desktop-bottom.png) | Same viewport, page1730px, scroll to end |
| [Mobile top](mobile-top.png) | 390×844, condition form |
| [Mobile bottom](mobile-bottom.png) | Same viewport, page2155px, scroll to end |

PASS: artwork remains visible without a flat-color cutoff at top/bottom; computed
pseudo fixed/inset0/cover; no horizontal overflow. Navigating Home removes Sell
root/background. Build TypeScript/Vite PASS with incumbent chunk advisory;
docs:check and diff check PASS. Prior scoped detector already ran once this
session; no repeat scan or new asset. Safari/physical mobile NOT RUN.
