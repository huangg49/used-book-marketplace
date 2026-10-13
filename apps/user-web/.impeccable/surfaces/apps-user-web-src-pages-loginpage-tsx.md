---
version: 1
slug: "apps-user-web-src-pages-loginpage-tsx"
primary_target: "apps/user-web/src/pages/LoginPage.tsx"
related_targets: ["apps/user-web/src/pages/LoginPage.module.css","apps/user-web/src/layouts/AuthLayout.tsx","apps/user-web/src/layouts/AuthLayout.module.css","apps/user-web/src/layouts/AuthPageLink.tsx","apps/user-web/src/layouts/auth-paper.ts","apps/user-web/src/pages/RegisterPage.tsx","apps/user-web/src/pages/ForgotPasswordPage.tsx"]
---

# Auth — reader's library papers

Mode: operate. Auth-only visual replacement requested by the owner. Preserve
SessionClient, native required/email validation, password reveal, errors and safe
returnUrl. The owner's account-auth follow-up connects registration, verification,
resend, recovery and reset to real public APIs through the same SessionClient.
Draft fields stay only in Auth memory. There is no additional token store.

## Direction contract

THESIS: Old books carry readers' traces. Enter through a central three-sheet
library file, replacing the incumbent split-screen photo/form composition.

OWN-WORLD: Existing wine/photo/cream/logo; original local Davit Margaryan image
with source provenance kept in the asset README, textured paper, ink underlines. Be Vietnam Pro controls,
Bricolage headings, owner-supplied MTD Fancy Melody pencil notes (Vietnamese glyph correction). Form errors use Be Vietnam Pro for readability.

STORY: Identify the reader card, enter email/password, recover from clear errors.
Registration has name, email, password/reveal, confirmation and the required
simulation-rules checkbox; success opens explicit six-digit OTP verification
and offers resend after60 seconds. Recovery has email request then OTP + two
passwords. Code lasts5 minutes with five wrong guesses; one labelled numeric
input supports formatted paste and leading zeros. Only challenge UUID survives
reload in a fragment; email is reentered to resend. Legacy token links remain
supported until consumed. Recovery passwords share a desktop row and stack
below400px; compact height≤800px fits the1536×700 paper. Errors announce the issue and recovery without losing input. Real
login succeeds before “ĐÃ MƯỢN” appears;
then navigate to the existing safe returnUrl (home by default).

FIRST VIEWPORT: 480px central paper stack, two offset sheets, wine top edge,
original wine logo and card kind in its header. Greeting/form/primary action are
one reading column. One randomized pencil note at right; small brand story at
bottom left. Visible photo credit removed at the owner’s request11/10. On mobile
note moves above paper; story disappears and paper remains in document flow.

11/10 Google entry UI: Login alone adds a thin “hoặc” divider, a white full-width
48px Google button and an explicit “Sắp có” availability note before registration.
The native disabled button has type=button and a described-by note; it skips Tab
and never submits, loads a Google SDK or starts OAuth. Official Google G artwork
is served locally with provenance in `public/brand/google/README.md`. The existing
paper/type/brand remains; recheck Google font/branding at functional integration.
Compact laptop spacing keeps the shared paper minimum; mobile flows naturally.
Google's local light-button colors (#fff, #747775 stroke, #1f1f1f text) are
intentional vendor-specific exceptions, not new shop palette tokens. The one
detector returned three color advisories for these values; no rescan implied.

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
Login success retains a continuous diagonal paper flow: desktop1600ms/30 fragments, mobile≤600px1500ms/18 fragments, plus destination-ready latency. Stamp280ms and tear start280ms remain under either OS preference. Two inert printed halves separate12px/1.8deg; cloned passwords are cleared even when revealed, and copies disappear before navigation. Four irregular fragment silhouettes use cream/paper, sparse yellow, faint ink and baked soft wine-at8% shadows/near blur. Twelve small encoded SVG sprites are predecoded on Auth entry; the cache holds at most two palette/mode recipes, not viewport bitmaps. Three opaque SVG pages retain ivory-paper texture, creases, subtle edge shading and two angled foreground edges. Native WAAPI schedules all visible flights before navigation; there is no per-frame Canvas drawing or React state update. The delayed inner-page drift loops continue while the destination mounts, independently of the outer exit animations. Viewport units retain the proven solid rectangular core during resize and bounded drift. Two paint boundaries precede navigation; actual React destination DOM commit plus two further paint boundaries gate release. Back/unmount cancels animations, pending mount acknowledgement, local copies and scroll lock. Destination H1/main receives focus in the layout effect after React removes inert/aria-hidden, not in a competing frame callback. Missing WAAPI retains a440ms technical cover fallback; OS reduction never selects it. No dependency/API/session/token or Home changes. Build comparison and limitations: `.impeccable/review/auth-performance/README.md`.
Drafts survive ordinary switches.

Owner13/10 approved staged improvement: step1 adds one short breeze to the paper
tear, not glow/stardust/autumn leaves yet. Two fine cream wind strokes draw and
fade over720ms. Six mobile/ten desktop dandelion seeds originate along the card
seam, follow its diagonal gust with varied drag/sway, then continue from their
actual computed poses for2500ms after paper removal. WAAPI schedules flights;
the finite aria-hidden/pointer-events-none layer neither retains inert nor
delays focus/scroll/interaction. Back before completion, destination navigation,
hidden document/new journey/unmount dispose it. The two printed halves lift
slightly in the first tear frames; existing stamp, cover and route gates remain.
Reduced preference retains authored motion per owner policy. Step1 rhythm awaits
human approval before adding glow. [Initial evidence](../../../../.impeccable/review/auth-breeze-step1/README.md).
Owner refinement: atmosphere belongs to the large full-screen pages, not just
the form tear. Current field has16mobile/26desktop seeds spread across independent
viewport lanes, smaller/fainter in the distance and larger/clearer close by;
paper-phase seeds rise diagonally with the pages. Two wind traces now connect the
tear and a viewport-spanning gust. A faint wine printed edge keeps cream fibers
visible against paper. Slow local sway continues while destination readiness is
pending. All9 screen sectors contain seeds at reveal in the latest fixture;
the2500ms tail, interaction and cleanup remain. No glow yet.
[Current evidence](../../../../.impeccable/review/auth-breeze-pagewide/README.md).
Owner approved the page-wide atmosphere, requested more natural flight/dissolve.
Current motion keeps the original gust transform and an independently phased
continuous flutter through reveal; no new transform/angle trajectory at handoff.
Gust ripple tapers with zero endpoint velocity. Reveal changes opacity only:
staggered quintic fades have gentle start/end and native finished promises gate
disposal, rather than a2500ms wall-clock timer. Normal tail remains about2–2.5s.
Same-page query/filter changes preserve the tail; leaving the pathname, Back
during tear, hidden/new journey/unmount still dispose. Shape/count/field/glow scope
unchanged. [Latest evidence](../../../../.impeccable/review/auth-breeze-fluid/README.md).
Owner approved fluid motion and authorized step2: cream/gold radiance on6desktop/
4mobile foreground seeds, plus14desktop/8mobile dust motes,5–11px including halo.
Local SVG radial lights use existing cream/yellow tokens, no blur filters or
viewport wash. Soft light opacity varies over2.8–4.04s with individual phases,
never a flashing star effect. Seed paths/count/field and native flight/flutter
stay; dust uses the same gust/dissolve lifecycle. All light remains inside each
particle, so native fade completion removes it together; no extra waiting time.
No new rasters/dependencies/session changes. Owner approved step2 intensity and
the completed breeze on13/10/2026; preserve current flight, dissolve and light.
[Glow evidence](../../../../.impeccable/review/auth-breeze-glow/README.md).

11/10 inline input feedback: a shared AuthForm reads the existing native validity
flags and exact password-confirmation rule, replacing browser validation popups
with field-local messages after blur/submit. Visited fields update while edited;
editing the original password rechecks a visited confirmation. Registration/reset
show actual10–128 length guidance and a match confirmation, never a strength
score. Submit focuses the first invalid input after its described-by message is
rendered. Field feedback has a polite live region, icon plus text and standard
body typography; empty feedback takes no height. The existing ink underline
focus remains. OTP_INVALID/OTP_ATTEMPTS_EXCEEDED belong to the OTP field; network,
delivery and rate failures remain form alerts. Original commands, validation
constraints, busy/cooldown, drafts and motion remain. Errors may grow the paper;
initial1280×720 Register still fits. Chromium390×844 remains in normal flow with
no horizontal overflow. Evidence: `.impeccable/review/auth-inline-feedback`.
One detector scan for this change returned only the three existing intentional
Google vendor-color advisories above. Screen-reader speech, Safari, real auth
submission and physical mobile are not claimed by this input-feedback QA.

Account-auth follow-up: pending buttons disable duplicate requests; status/error
use live regions, successful state headings receive focus only on the active
sheet. Verification is an explicit action and does not auto-login. Register
password drafts clear after success; reset revokes old sessions and returns to
Login. At laptop height≤800px, Register's lede/secondary row are slightly tighter
to retain the common paper minimum. Mobile keeps the 10–128 character hint;
long/error states scroll naturally. Preserve all existing authored motion under
OS reduction. [Implementation/evidence](../../../../docs/features/ACCOUNT_AUTH.md)
records local/Brevo delivery and the remaining inbox/native/human gates.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
