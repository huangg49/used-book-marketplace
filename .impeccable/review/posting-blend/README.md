# Đăng sách — archival blend — 11/10/2026

Source: `codex/posting-blend-plan`, proposal checkpoint `dd1dfa4`; implementation
checkpoint subject `feat(web): blend archival posting desk with guided review`.
Approved code-led extension of the incumbent wine/cream world; no new seed/comp.

## Evidence

CUA in-app Chromium against QA Vite5191 + Nest3009, disposable Mongo `*_test`
replica set on57017 and fake image storage3010. All content is synthetic and
labelled QA; public repo cover used for local upload. No email, main database or
real storage writes. Agent-owned runtime/tab/database cleaned after checking;
temporary viewport reset. Existing Vite5186 and unrelated local work preserved.

| Capture | Viewport and state |
| --- | --- |
| [desktop](desktop.png) | 1440×1000, left preview and both prices, long title |
| [laptop](laptop.png) | 1280×720, initial information step |
| [mobile](mobile.png) | 390×844, compact preview disclosure, both prices |
| [narrow laptop](user-1024.png) | 1024×640, complete review |
| [narrow mobile](user-320.png) | 320×740, pricing and five numbered controls |
| [desktop review](review-desktop.png) | 1440×1000, seven photos and all facts |
| [mobile review](review-mobile.png) | 390×844, ownership checked before submit |
| [receipt](success-mobile.png) | 390×844, actual awaited QA submission receipt |

These are full-page captures, not claims that the whole form fits one viewport.
1024×640 checks constrained available space; actual125% browser zoom was NOT RUN.

Browser PASS: empty Continue/inline errors/summary focus/linked field focus;
error clears after correction; long text wrapping; forward/back/review edit
retains data; dirty-exit cancellation; optional classification disclosure;
8-photo limit and remove/re-enable; minimum sale price; Both with separate sale/
exchange values; ownership blocks submission; pending state; awaited **Đã gửi
duyệt**; **Đăng cuốn khác** clears fields, photos and step statuses/focus.
No horizontal overflow at all five sizes. Native details opens on mobile.
Actual browser reduced-motion preference was true: scoped step220ms and active
indicator240ms remained enabled under the owner policy. No OS setting changed.

## Checks and review

- `pnpm --filter @used-books/user-web test`: PASS78tests/11files, including
  existing listing-submission retry semantics.
- `pnpm --filter @used-books/user-web build`: PASS TypeScript/Vite; existing
  chunk-size advisory remains.
- `pnpm --filter @used-books/user-web lint`: PASS0errors,5existing Exchange warnings.
- `pnpm docs:check`: PASS318Markdown/2190relative links; `git diff --check` PASS.
- Manual Impeccable detector run once on the three changed product files: `[]`.
- Raster provenance scan:1asset/0missing sidecars. Original Minh image unchanged;
  optimized derivative188KB. External licensing of inherited art is undocumented
  as recorded in [asset provenance](../../../apps/user-web/public/illustrations/posting/README.md).
- Independent AI finish reviewer: **ship**, no material product fixes. All seven
  required layout/review captures valid; TYPE/MATERIAL/GROUND and surface promises
  match. Corrected DESIGN wording: validation focuses error summary, whose links
  focus fields. Reviewer inspected source/images, did not rerun execution checks.

NOT RUN: browser lost-response/retry, full browser harness, Safari, screen-reader
speech, physical mobile/OS keyboard, actual zoom/text enlargement, native apps,
human acceptance and remote CI. No API/session/schema change; READINESS unchanged.
