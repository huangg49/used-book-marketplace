# Auction web refinement — 12/10/2026

Branch `codex/auction-web-refine`, base `f0c3115`. Code-led extension of the
established wine/cream bookshop UI; no new visual world or approved image comp.

## Scope

- Public list: compact existing penguin introduction, collapsible participation
  instructions, point/buy-now/sort criteria retained in the URL, book-first cards.
- Detail: inspected revision photos and condition, gallery, live price and private
  standing, one manual-bid confirmation action; automatic bidding and buy-now
  confirmations retained. Login returns to the selected auction.
- `/my-auctions`: member-only paginated read with all/active/payment/selling views.
  Cursor bound to caller and view; no private ceilings or identities returned.
- Public photos: only approved, inspected intake revision derivatives, checked
  before and after signing. Ordinary public listing eligibility is unchanged.
- Unknown payment results retain the original order/version/key across live
  refreshes. Post-payment copy distinguishes actual order states; no collection,
  inspection, settlement or completion workflow gates are closed by this change.

## Evidence

Browser QA: Codex IAB/Chromium, desktop1366×900 and mobile390×844. Isolated API3009,
web5187, QA Mongo57017/random `*_test`, fake storage3010. Two books were created
through catalog confirmation, listing/media approval, intake receipt/inspection
and opening APIs. Existing project covers are explicitly labeled test data in
the listing description. No primary database writes or live Supabase upload.

Required captures: `list-desktop.jpg`, `list-mobile.jpg`,
`detail-desktop-bidder.jpg`, `detail-mobile-bidder.jpg`, `auto-desktop.jpg`,
`auto-mobile.jpg`, `mine-desktop.jpg`, `mine-mobile.jpg`, `mine-empty-mobile.jpg`.

Browser checks: guide Enter; sort and buy-now filter; gallery opening/Escape and
focus restoration; preserved login return URL; manual bid choose/confirm and
server-confirmed leading state; automatic bid enter/confirm/private ceiling;
personal rows and payment-empty view. No horizontal overflow at390px.

- PASS:49 auction HTTP/Mongo tests, including public-media access revocation during
  signing, cross-auction media rejection, private ownership, cursor caller/view
  binding, existing bidding/replay/race/payment/collection tests.
- PASS:102 web unit tests; API typecheck/lint; web production build/lint;
  generated contract check;125 operations match22 controllers.
- Existing warnings:5 Exchange lint warnings and large Vite bundle.
- Detector ran once: `detector.json` records1 primary finding and22 advisories.
  Removed the old faux-book thumb/side stripe and replaced its old colors/radii
  with brand tokens. Status surfaces/local type values do not change the global
  design system. No second detector pass.

NOT RUN: native apps, physical phone, Safari, speech screen reader, full browser
zoom125%/200%, live Supabase, unknown-payment network-drop browser scenario,
remote CI and human review. The QA HTTP origin does not prove persistent secure
cookie restoration across full reloads. Money and handover remain simulated.

## Finish review

Independent AI review initially requested three material fixes. The verdict pass
scored all three **resolved**, disposition **ship**: automatic-bid rejection keeps
the dialog/amount; transient refresh failures retain cached content with warning
and retry while denied private reads hide cached rows; mobile selects show full
labels and one chevron. This verdict scores these fixes, not a fresh whole-surface
review or human sign-off. No second detector was run.

Additional QA: an independent request raised the caller's ceiling to550.000 while
the dialog confirmed500.000. The known rejection remained in the dialog and
“Sửa mức” restored the input with500.000 retained. `auto-rejection-desktop.jpg`.
A QA-only forwarding proxy at5188/3011 simulated503 reads: detail retained its
heading/content, list retained2cards, and personal results retained2rows. A403
retry hid all personal rows and showed the permission message. Captures:
`detail-refresh-error.jpg`, `list-refresh-error.jpg`, `mine-refresh-error.jpg`,
`mine-access-denied.jpg`. Proxy flags and test fixture code stay ignored in.tmp.

No push, PR, merge or deployment is authorized by this checkpoint.

Finish documentation comparison found missing auction-scoped roles. Added exact
incumbent shelf/error/wine-hover/exchange-ink values locally, preserving global
tokens. Rebuilt and recaptured all9 normal views. Explicit DOM viewport readback
and file dimension checks confirm personal mobile captures are375px content
width (390px viewport with stable15px gutter). Captures are browser JPEG output.
A restarted isolated fixture used the same workflow and books; the personal
empty view was captured before the Alice bid, the final populated view after it.

The same roles are scoped on MyAuctions.page (shelf/error); final build passed.
That last color binding was source-checked, with no new payment-urgency browser
capture. Final independent bounded verdict: ship, all prior fixes and personal
mobile evidence corrected; it is not a whole-surface re-review.

Documentation: three auction surface briefs compare the implementation with the
incumbent DESIGN.md and preserve DESIGN.md/.impeccable/design.json. Existing
DESIGN auction prose describes the earlier introduction-only refinement and
legacy body; this drift is reported, not silently repaired or promoted.

Cleanup: stopped QA APIs/Vite/fake storage/fault proxy; disposable databases,
users and roles removed by fixture cleanup, Mongo inventory shows0 browser QA
databases. Stopped the QA Mongo container started for this session. Main API3000
and web5186 remain running. Unrelated Chat/Notifications/MainLayout/Home WIP is
excluded from the commit. No primary data was seeded/reset.
