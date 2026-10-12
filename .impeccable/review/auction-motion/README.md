# Auction motion —12/10/2026

Branch `codex/auction-motion`, base `9479303`. Approved code-led extension of
incumbent wine/cream Operate auction screens, inherited direction20e973c0.
No new visual world, stock/generated asset, dependency, API/auth or DB change.

## Delivered behavior

- Actual prices are rendered immediately. A finite500ms paper-yellow emphasis
  and3px arrival run only when a value changes after the initial baseline.
  New history rows share the update emphasis; stable event keys preserve rows.
- Leading/outbid state uses270ms color/position feedback and a local status
  region. Price announcements are narrowed to the price rather than the entire
  bid form. Replayed/unchanged snapshots do not repeat value feedback.
- Known command receipts get a280ms paper response; accepted manual/automatic
  bids additionally get one380ms Gavel stroke. Unknown/error results get no
  confirmation receipt. No optimistic financial/auction outcome is introduced.
- List filtering/sorting uses pre-commit React snapshots and WAAPI position-only
  offsets over220ms. Repeated changes start from the currently displayed visual
  position, cancel preceding motion and retain keyed links/focus. New/removed
  cards have no hidden entrance, clones or delayed exits. No per-frame React work.
- Auto dialog opens over220ms; each keyed step uses200ms local CSS movement,
  with heading/input focus restored before paint. Close/Escape remain immediate.
  Mobile confirmation actions stack to keep the full monetary label readable.
- Fine-pointer cover/focus lift3px and arrow shift2px use finite220/170ms feedback.
  Countdown has no per-second animation and never announces a client-side winner.
- Scope honors owner's forced-animation policy. WAAPI checks actual visibility/
  bounds, cancels when the document hides, and cleans up on interruption/unmount.
  Unavailable WAAPI leaves content/actions immediately usable. No OS setting changed.

## Checks and browser evidence

PASS web production build/TypeScript;109 unit tests (7 new motion baseline,
repeat/identity, hidden/offscreen and cancellation/fallback tests); lint0errors,
5 existing Exchange warnings. Vite large-bundle warning remains. Final JS1093.51kB
(gzip334.20kB), about4kB raw more than9479303; no added motion-library bundle.
No API tests rerun: API/contract/session/write source is unchanged.

Codex IAB/Chromium on isolated QA API3009, Vite5187/live WebSocket, Vite5188 via
QA-only gateway3011, fake storage3010 and separate Mongo57017/random *_test.
Two real approved/received/inspected/opened workflow fixtures with explicitly
labelled project-cover test photos. A second disposable member supplied real
competing bids. No primary database writes, credentials changes or emails.

Desktop list/open dialog captures at1366×900; desktop detail/known-error at1280×720.
Mobile390×844, content375px with stable15px gutter. All JPEG dimensions checked;
all captures opened and verified. Required captures:

- `list-desktop.jpg`, `list-mobile.jpg`
- `detail-desktop-receipt.jpg`, `detail-desktop-outbid.jpg`
- `detail-mobile-receipt.jpg`, `detail-mobile-outbid.jpg`
- `auto-desktop.jpg`, `auto-mobile.jpg`, `auto-confirm-mobile.jpg`
- `auto-known-error-desktop.jpg`, `unknown-response-mobile.jpg`
- `refresh-error-desktop.jpg`

Browser checks: native/custom sort, buy-now filter, rapid interrupted reversal,
keyboard cover focus/arrow/Escape, manual250000 confirmation, auto350000, live
rival400000/outbid, known auto rejection450000 after independent own500000,
retained edit450000, mobile auto550000, rival600000 and anonymous history.
History top stayed331→332px and focus stayed on the history list across a live
update; document scroll offset changed with native anchoring, no forced scroll.
Gateway simulated503 after a committed auto700000 command: no receipt/Gavel,
original-intent retry returned the same result. Transient503 read kept cached
content with stale notices and later recovered. All fault files/servers are QA-only.

`runtime.json` records read-only DOM samples: price250000 already rendered with
paper-yellow feedback, running Gavel matrix, interrupted card offsets, history
anchor, retained input, unknown-result zero receipt and confirmed replay.
The browser's actual `prefers-reduced-motion` was **true** during these checks.
Final step CSS computed200ms under that preference; screenshot/DOM sampling
alone is not a continuous FPS trace or a recording of the complete motion.

Detector ran once:2 advisory pre-existing scoped outbid colors (#fbeee9/#7b2e1b).
No primary finding and no second detector. No global token/design-file changes.

NOT RUN: physical phone, Safari/native apps, speech screen reader, full browser
zoom, continuous FPS/CPU trace, unavailable-WAAPI browser scenario (unit covered),
hidden-tab browser scenario (unit covered), remote CI and human review. Live
Supabase and receipt/settlement gates remain outside this UI-only slice.

Independent full AI finish review: **ship**, no material fixes. All12 captures
and sampled motion/source contracts were reviewed against the approved scope.
This does not replace human acceptance or prove continuous frame performance.
Two auction surface briefs now describe shipped motion, immediate values,
focus/errors and evidence. DESIGN.md and its sidecar were preserved; their old
Auction/reduced-motion prose remains acknowledged drift outside this slice.

QA cleanup PASS: databases/users/roles count0, QA API/Vite/gateway/fake storage
stopped, QA Mongo container stopped. Browser tabs closed/viewport reset.
The main backend watcher had stopped listening during checks; its owned process
group was restarted with unchanged configuration/data. Main API3000/web5186
readiness HTTP200 and web auctions HTTP200 confirmed before handoff.
No push/PR/merge/deploy authorized. Unrelated teammate WIP remains excluded.
