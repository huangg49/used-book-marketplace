# Stable page scroll — 11/10/2026

Source: `codex/stable-page-scroll`, base `b304d13`, checkpoint subject
`fix(web): preserve page geometry across scrollbars and overlays`.

- Global root gutter is stable; unsupported browsers retain a permanent vertical
  scrollbar. The shared lock retains that gutter instead of compensating twice
  with body padding. Nested locks and repeated cleanup are safe; the fallback
  freezes the body and restores scroll only on the same route.
- Owner shelf and exchange tab panels reserve 280–420px, based on viewport height,
  across loading/error/empty/results. Existing loading copy remains; no new
  skeleton component or visual treatment. No API/session/validation changes.
- Audited the three explicit page locks (gallery, mobile catalog filters, login
  transition). Native ConfirmDialog/AutoBidDialog do not mutate page overflow.
  Existing local container overflow and unrelated WIP remain unchanged.
- Node24.19.0/pnpm11.19.0: user-web69tests/10files, typecheck, build PASS.
  Lint0errors/5existing Exchange warnings; existing bundle size warning remains.
- CUA Chromium1280×720/390×844, real Nest/Mongo disposable `_test` replica set,
  local mail/fake storage: all five owner filters, long/short pages, gallery open
  and Escape, filter open/Escape and desktop breakpoint cleanup PASS.
  [Metrics](metrics.json): desktop body1264.8px and headingX280px across filters;
  navbar/nav rectangles identical on long/short owner pages. Empty panels324px
  at720px height; long content grows freely. Gallery body/H1 X unchanged;
  existing navbar scroll animation can still run during click autoscroll.
  Mobile drawer body375.2px/headingX16px before/open/closed; no horizontal overflow.
  Login transition completed and root overflow/body padding restored.
- [Desktop](shelf-desktop.png), [mobile](filter-mobile.png). Screenshots are
  synthetic data; bridge PNG dimensions can differ from logical viewport.
- Legacy fallback tested by unit tests, not an older browser. Slow-network loading,
  physical mobile/Safari/NVDA/full browser integration/human review/remote CI
  NOT RUN. Exchange page retains its existing demo data; not evidence of a live
  transaction workflow. QA tab/viewport/server and its DB/users/roles cleaned up.
