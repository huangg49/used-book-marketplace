# Tổng quan — cá tính và việc tiếp theo — 12/10/2026

Branch `codex/account-overview-refine`, base `5350059`. Owner feedback: the
phase1 overview feels ordinary. Confirmed scope: Tổng quan first, Hồ sơ later.
Local refinement in the existing wine/cream/Anton/penguin world; no global
DESIGN/token, API, Mongo, auth, Profile, Home or shared owner-row change.

Greeting uses wine/cream with real name and the original posting illustration.
New “Việc trên kệ” uses three separate owner-filtered limit1 reads, with priority
Rejected → Draft → PendingReview. It does not count the shelf, infer absence from
the recent four, or claim the ability to resume/edit a draft. Each entry links
the existing shelf filter. Loading/error/403 remain explicit; errors retry locally.
Presence checks refetch on each overview mount to avoid stale route-return advice.
No rapid polling or full pagination scan. Existing wallet/recent books/notices stay.

## Evidence

- Web build and102 unit tests PASS on Node24.19.0/pnpm11.19.0; lint PASS with
  five existing Exchange warnings. Existing large bundle advisory remains.
- Real Nest/Mongo disposable `*_test` browser fixture, fake storage. The runner
  records11 successful scenario groups in [checks.json](checks.json). No main
  database writes. A rejected item is pushed below the recent four by five newer
  drafts before checking priority, so the bounded-read claim is tested explicitly.
-1440×1000 [desktop](desktop.png),1280×720 [laptop](laptop.png),390×844
  [mobile](mobile.png),320×740 [narrow](narrow.png); captures are full-page.
- [Focus error](focus-error.png), [draft priority](draft-priority.png),
  [rejected priority](rejected-priority.png), [wallet error](partial-error.png),
  [empty desktop](empty-desktop.png), [empty mobile](empty-mobile.png),
  [locked member](locked.png). Synthetic long titles/fake green photographs
  deliberately test wrapping and private reads, not production photo variety.
- Two bounded self-inspection rounds. First round narrowed the greeting/task/
  wallet spacing and made320px task filters full-width rows. Final reviewer
  validates latest captures; no new self-polish after round2.
- Independent review found one material craft issue: the small task label above
  the dynamic title acted as an eyebrow. Removed it and its Library ornament;
  the advice is now the section H2 and accessible label. Same11 browser groups
  passed after that batch; all11 viewports/states recaptured for the verdict pass.
- Detector once: one **advisory** at CSS greeting name size, fluid endpoint
  1.375rem outside the documented ramp. This intentional local22px maximum
  keeps owner name subordinate to the Anton H1; global typography is preserved.
  No claim of a zero-finding detector pass.

NOT RUN: native/RN/Flutter, physical phone, Safari, speech screen reader,
actual browser zoom125%/200%, live Supabase, remote CI and human review.
Main-content CSS zoom200% is tested; it is not full browser zoom acceptance.
OS-reduced motion retains authored170ms interactions per owner policy.
Auction targets are synthetic; no full auction/wallet mutation audit implied.

QA fixture closes API/Vite/browser and drops its own database/users/roles in
finally. Main backend3000/web5186 are preserved. No push/PR/merge authorized.
Verified zero disposable browser databases remain and no QA API/Vite/image
listener remains. The QA Mongo service started for this run is stopped.
Independent verdict pass: **ship**, the sole P2 scored **resolved**. All11
recaptures validated; advice, filters and recovery preserved. This verdict covers
the scored fix, not a new whole-surface audit or human sign-off. No further UI
changes after those captures.
