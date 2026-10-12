# Auth papers — verification, 11 October 2026

Branch `codex/auth-library-papers`, base `d20c43a`. UI-only; API/SessionClient,
OpenAPI, database and auth validation unchanged. User prototype is local
`Lật Lại · Đăng nhập.html`; it is a visual reference, not shipping source.

## Captures

Codex IAB, reduced-motion=true. All captures opened and checked for correct route,
loaded photo/fonts, readable content. Login:1520×740,1366×768, actual user pane572×815,
390×844,320×900. Register:1535×850,320×900. Recovery:1535×850,320×1000.
Actual320×568 has normal vertical scrolling and no horizontal overflow; a taller
320 capture records all content because IAB fullPage leaves blank pixels below
its current viewport. Short desktops may scroll with longer recovery/error copy.

`login-error-fixture.jpg`1366×900 and `login-stamp-fixture.jpg`1366×768 are explicitly
badged **QA fixture · không kết nối DB**. They use a separate localhost5187 Vite
middleware with synthetic auth responses and no database connection. No fixture
code, credentials or environment overrides are shipped in the application.
The displayed `reader@example.test` is synthetic, not a person's account.

## Checks performed

- TypeScript + production Vite build PASS (existing large-chunk warning).
- User-web unit suite:34 tests/7 files PASS; existing suite, no Auth-specific unit suite.
- Oxlint:0 errors,5 pre-existing Exchange warnings, no Auth warnings.
- Manual design detector ONE run: paper top-edge/radius warning; intentional new
  Auth-local font/color/size/radius documentation findings sent to finish reviewer.
  Findings are not reported as detector PASS; no second detector run.
- Native required input validation focuses empty email, preserving browser semantics.
- Keyboard after sheet navigation: next H1 focus, Tab enters email; visible tinted
  focus outline. Only current sheet exists in accessibility tree; outgoing content
  inert during leave. Full screen-reader speech/NVDA NOT RUN.
- Query/returnUrl preserved between sheets. Drafts retained in layout memory only;
  leaving Auth disposes them. Password reveal remains the same native control.
- Synthetic401:clear handwritten alert, values retained, no success stamp.
- Synthetic200:busy submit disabled; real SessionClient accepts fixture response,
  then stamp + polite success status precede safe redirect to `/books?data=preview`.
  `returnUrl=//example.com` returns to local `/`, never external site.
- Actual reduced-motion: spatial page/stamp animation omitted, static stamp500ms.
  Normal 3D flip source inspected, live normal-motion browser NOT RUN.
- Main DB login POST/full authenticated workflow NOT RUN. No production writes,
  register/reset requests, fake account creation or fake email sent.

## Product decisions

Functional labels remain Email/Mật khẩu/Đăng nhập; library language is supporting
copy. Registration and password recovery were already unsupported: separate sheets
say so clearly and collect no data. Home remains default; a safe internal returnUrl
retains existing flow. Fonts are local OFL Google Fonts; photo + texture reused
with existing provenance, visible Davit Margaryan/Unsplash credit retained.

Finish review and documentation are recorded alongside this file after handoff.
AI review is not human sign-off; READINESS gates unchanged.

Final documentation checks: pnpm docs:check PASS; git diff --check PASS. Raster provenance scan:2 rasters,0 missing. Finish reviewer:ship for supplied source/capture scope; documented tokens/recipes follow the final Auth source. Isolated QA server5187 stopped; normal preview5186 retained.
