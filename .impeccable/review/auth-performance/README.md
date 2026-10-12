# Login paper performance — 11/10/2026

Approved scope: keep the accepted paper flow and improve its cost/continuity;
no Home, API, validation, SessionClient or dependency change.
Branch `codex/auth-paper-performance`, base `27203fb`, checkpoint subject
`perf(web): compose login paper flights outside the frame loop`.

## Decision and source

The previous painter submitted textured viewport-sized SVG paths, gradients and
shadows to Canvas on every animation frame. The valid laptop measurements showed
expensive draw submissions even before attributing work to Home. Native WAAPI
now schedules transform/opacity flights once; three SVG page surfaces and twelve
small decoded fragment sprites carry the same material. Shadow/blur is baked into
fragment sources, not applied live to a full scene. Encoded recipes are bounded
to two cache entries. Raster compositor layers still consume memory: small source
cache is not proof of small GPU allocation.

Opaque page entry must finish and cross two paint boundaries before navigation.
The actual destination DOM must mount and cross two further paint boundaries
before exit. A delayed native drift loop is scheduled before the handoff, so it
does not depend on a JS frame callback while React mounts. Exit runs on the outer
page while drift continues on its inner surface. No Canvas frame loop runs in the
normal renderer. No Home reduction, new library, Worker or WebGL was warranted.
The owner-required full motion remains active with OS reduction enabled.

The first runtime pass found H1 focus could run before inert was removed. The
single correction batch moved focus into the post-removal React layout effect.
Final desktop/mobile runs focus H1, remove the overlay and restore body scroll.

## Measurement

Windows Codex IAB, DPR1,1366×768 and390×844. Separate Vite build fixture on5187:
login200/401 is synthetic with800ms response latency; every other `/api/v1`
request returns503. Proxy is disabled; no main/test DB or bucket was used.
Baseline pre-transform uses exact27203fb Layout/painter/CSS snapshots. Both QA
builds explicitly allow the existing preview Home catalog through a QA-only
transform of the DEV check. Shipping source/build does not include that transform.

| Build | Viewport | JS gap p95 / max | Gaps >33.4ms | Old draw p95 | Scene setup | Overlay lifetime |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline |1366×768|33.5 /61.1ms|10|33.7ms|2.9ms|1899.5ms|
| WAAPI |1366×768|5.7 /28.2ms|0|no frame drawing|7.9ms|1712.3ms|
| Baseline |390×844|16.7 /44.5ms|2|14.5ms|2.7ms|1638.3ms|
| WAAPI |390×844|5.7 /27.9ms|0|no frame drawing|5.6ms|1593.5ms|

[Structured numbers](metrics.json). These are one matched build run per viewport,
not a statistical hardware benchmark or a presented-frame GPU trace. IAB cadence
is approximately5.6ms; it must not be translated to physical FPS. Observed long
task entries were empty. Cold compositor rasterization, VRAM and physical phone
FPS remain unmeasured. Initial valid dev runs also reduced laptop p95 gap38.9→5.7ms;
mobile p95 improved16.8→5.7ms but both had two >33.4ms gaps. Do not claim all lag is
gone. Invalid early fixture runs (wrong pre-transform order, temporary QA hold
scope error) are excluded; neither issue shipped in product source.

## Runtime and visual evidence

- Desktop/mobile full renderer with actual `prefers-reduced-motion:true`: PASS.
- Artificial2s destination readiness delay: Home H1 was already mounted, overlay
  stayed covered with route-ready unset, and inner transform advanced. PASS.
- Resize while covered1366×768→1024×600: page drift retained, no Canvas reset;
  transition completes. Five geometry tests cover the solid core for20s waits.
- Login401: clear error and no storm; unchanged source preserves native fields.
  Browser read-only credential snapshots did not expose values reliably, so exact
  value retention is source-backed rather than asserted from that snapshot.
- Browser Back during entry: overlay gone, scroll lock cleared, route restored.
  Cancellation during entry/readiness/reveal has deterministic unit coverage.
- Checked `/books?data=preview` destination reached with H1 focus; no auth API edit.
  A runtime reveal-Back attempt exceeded the fixture selector deadline during the
  artificial delay; that particular browser case is NOT RUN to completion.
- Desktop/mobile native scene inspection: same paper palette, texture, creases,
  angled edges and solid coverage; unchanged Home remains healthy. One correction
  batch addressed focus only. No repeated aesthetic polish or detector runs.

[Covered desktop](covered-desktop.jpg) is an ordinary runtime capture.
[Reveal desktop](reveal-desktop.jpg) and [reveal mobile](reveal-mobile.jpg) capture
the actual native animation paused by QA instrumentation90ms after reveal starts,
solely to make a reproducible screenshot. No capture pause is in shipping code;
these screenshots are not timing/FPS evidence.

## Checks and limits

Shipping user-web build/TypeScript: PASS (existing >500kB chunk advisory).
User-web unit tests:55 PASS across8files, including10 new coordinator/geometry
tests. Lint:0errors/5existing Exchange warnings. Scoped detector once:0findings.
Docs check and diff check recorded at checkpoint completion.

Physical phone/GPU trace/memory, actual live login/DB, hidden-tab/no-WAAPI fallback
runtime, NVDA speech, native and human acceptance: NOT RUN. Source fallback remains
available, preserving navigation/cleanup if WAAPI is absent. Independent agent
review was not requested; this is implementer source/browser evidence, not human
sign-off. READINESS is unchanged. Chat/Notifications/MainLayout local work retained.
Temporary QA server is stopped after checks; no push/PR/deploy authorization inferred.
