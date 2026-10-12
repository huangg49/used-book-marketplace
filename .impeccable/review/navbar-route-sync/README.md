# Navbar route synchronization — 12/10/2026

Branch `codex/navbar-route-sync`, base `884a30e`; checkpoint subject
`fix(web): synchronize navbar with route scroll resets`.

The fullscreen Sell page and MainLayout mount different Header instances. The
old effect initialized its local scroll state independently of the rendered
floating state, so a scroll reset between render and subscription could leave
the header floating at scrollY0. Header now synchronizes in a layout effect on
mount/path changes, then checks the next frame for layout/browser scroll resets.
Its passive scroll subscription and pending frame are cleaned up on departure.
The48/16px hysteresis and existing CSS morph/edge flash stay unchanged; only an
actual contraction starts the flash. No routes, form data, APIs or tokens change.

Checks on Node24.19.0/pnpm11.19.0:

- Web unit84/84 PASS, including four regression cases for initial synchronization,
  no-event scroll reset, hysteresis/flash direction and listener/frame cleanup.
- TypeScript/Vite build PASS (existing bundle-size advisory); lint PASS, five
  existing Exchange warnings. Docs/diff checks PASS.
- In-app Chromium, default1280×720 and emulated390×844: Home/Search scrolling
  contracts the header; Search→Home resets scrollY0/floatingfalse; mobile menu
  Home→Search closes and expands; mobile Search→Home expands without overflow.
  [Desktop](desktop.jpg), [mobile](mobile.jpg) are unmodified browser screenshots.
- Authenticated Sell→Home and account routes were NOT RUN in the browser: available
  tabs had anonymous sessions. Their shared observer lifecycle is covered by unit
  regression tests. No login, session mutation or test DB writes were performed.
- Safari, physical mobile, screen-reader speech, human sign-off and remote CI
  NOT RUN. No visual redesign/detector scan needed for this lifecycle-only fix.

Temporary QA tab closed and viewport restored. Existing Vite/API/Mongo retained;
teammate WIP and READINESS untouched. No push/PR/merge.
