# Successful-login paper storm — 11/10/2026

Branch `codex/auth-paper-storm`, base `bae53e3`. Scoped checkpoint subject:
`feat(web): reveal login destination through a paper storm`.

Owner approved a meaningful success transition and a lighter phone version with
reduced-motion fallback. Existing 850ms ordinary form shuffle is unchanged.
SessionClient, Login validation/API, memory-only session and safe returnUrl remain.

## Implementation and acceptance

- Route-persistent `PaperStormLayout` owns the overlay through Auth unmount.
  Two inert local DOM copies tear the actual printed card; password values are
  cleared in copies. No serialization, screenshot upload or persisted credential.
- Canvas2D: 68 desktop / 36 phone fragments, three paper silhouettes in four
  existing brand colors. Far fragments small; near ones larger with blur/shadows
  baked into sprites once. DPR capped 1.5 / 1.25, no new dependencies.
- 1850ms desktop / 1600ms mobile, plus route-ready wait. A dedicated full opaque
  cream sheet is drawn, painted, then navigation commits behind it. It stays until
  two destination paints; random particle density is never the coverage guard.
- Reduced preference uses 440ms cover/reveal, no tear or particles. Content stays
  inert/aria-hidden during the journey, polite status remains available; overflow
  and scrollbar compensation are restored and destination heading receives focus.
- Back/unmount cancels stale frames/navigation. Resize redraws last frame.
  Hidden-tab fast completion and no-Canvas fallback exist in source.

## Actual checks

Final web build/TypeScript PASS, 40 tests in 8 files PASS. Six new scheduler tests
verify cover-before-navigation in all modes, slow-route cover holding, cancellation
before cover and while waiting, reduced duration/coverage. Lint: 0 errors, five
known Exchange warnings. Existing Vite >500kB bundle advisory remains. One scoped
Impeccable detector pass on new rendering files/AuthLayout/router: `[]`.

CUA isolated localhost5187 fixture intercepts API with synthetic401/200 only,
no DB/storage. Full motion uses a QA-only matchMedia override; no OS setting or
production behavior was changed. Current real OS reduction is true.

- 1366×768 full motion: tear → storm → opaque cover → reveal → Home. Focus H1,
  overflow restored, no inert after completion. `tear-desktop.jpg`,
  `storm-desktop.jpg`, `covered-desktop.jpg`, `reveal-desktop.jpg`, `home-desktop.jpg`.
- 390×844 full motion:36 fragments, canvas390×844, safe `/books?data=preview`
  return retained, H1 focused, no horizontal overflow. `storm-mobile.jpg`,
  `covered-mobile.jpg`.
- 390×844 actual reduction: mode reduced,0 fragments/0 copies, cover and Home
  focus/restoration PASS. `reduced-cover-mobile.jpg`.
- Synthetic401 retains fields/error and never mounts storm. `rejected.jpg`.
- Back during tear clears overlay/inert/scroll lock; no forced delayed navigation.

Bounded first pass caught native rAF binding failure and missing inherited font
variables/input selector attributes in the local copies. Fixed in one batch,
along with translucent early sprites; second pass confirms final captures above.
These are actual browser captures, not rendered mockups.

## Limits / next action

Physical mobile frame-rate/performance, screen-reader speech,200% zoom/text,
native, hidden-tab completion, no-Canvas runtime, main-DB login and human acceptance
NOT RUN. No new auth/backend gate claimed; READINESS unchanged. No new raster asset
or font required, existing photo/texture provenance retained. Owner can try local
Login; with current reduced-motion setting they see the lighter fallback.
Unrelated Chat/Notifications/MainLayout WIP remains outside this commit.

## Owner motion policy follow-up — 11/10/2026

`codex/auth-motion-preference`, base `b54f0e4`, subject
`fix(web): preserve login animation under motion reduction`. Owner now requires
all authored motion under either OS preference; recorded in AGENTS, superseding
earlier reduction guidance. Storm chooses mode from viewport only; stamp280ms
overrides shared CSS reduction. Canvas-unavailable fallback remains. Existing
reduced-cover capture/tests describe technical fallback, not current OS behavior.

CUA1280×720 actual OS reduce=true, no QA preference override: desktop68fragments,
stamp animationDuration0.28s,Home H1focus/no inert/restored overflow PASS.
`forced-motion-desktop.jpg` is the actual storm capture. No OS setting changed.
Build/TypeScript,40tests8files,docs/diff PASS;lint0errors5known Exchange warnings.
No new backend/native or physical-phone FPS acceptance; unrelated WIP preserved.

Follow-up scoped detector ran once: one inherited intentional6px wine paper-edge
advisory in AuthLayout.module.css (existing concept); not a detector PASS.
