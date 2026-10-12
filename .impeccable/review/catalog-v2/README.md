# Catalog vocabulary v2 — local acceptance12/10/2026

Branch `codex/catalog-expansion`, base `c8456df`; checkpoint subject
`feat(catalog): expand categories and contextual classification`.
Approved scope: [core phases1–5](../../../docs/design/CATALOG_EXPANSION_PLAN.md).
Decision: [ADR0035](../../../docs/adr/0035-catalog-vocabulary-v2.md).
No push, PR, merge or deployment to another environment in this package.

## Implemented

- Shared additive registry:17 roots,55 children,72 IDs,25 facets,234 options.
  Exact-category metadata validation differs from descendant-inclusive search.
  Compatible branches enforce OR within/AND between facets. Purpose and school
  stage control exams and grades; cursor scope includes taxonomy version.
- OpenAPI0.34.0/generated types; frozen Mongo0019 extends the revision validator.
  No0016 modification, new collections, permission changes or catalog backfill.
- Navbar four grouped columns, accent-insensitive search and child disclosure.
  Home discovery covers the system, rather than categories in a loaded page.
  Search keeps draft/apply/URL/Back semantics; long facets are searchable and
  selected choices remain visible. Shared Sell fields, Detail links and Admin
  labels use the same registry. RN readers/resubmission preserve optional metadata.
- Preview118 editions with Open Library sources, spread across16 substantive
  roots. Sách khác is intentionally empty in preview; no claim of72 stocked
  categories. Prices, condition and classification remain illustrative. Added
  covered editions were sourced individually; full remote refresh NOT RUN.

## Checks actually run

Node24 runtime bundled with Codex and pnpm11, Mongo8 QA replica set at57017.
QA uses separate `*_test` databases and fake storage; no tests write to the
owner's catalog or Supabase bucket.

| Check | Result / limits |
| --- | --- |
| API unit, `pnpm --filter @used-books/api test` |130 PASS; final classification file7 PASS again after the last arts profile change |
| User web unit |111 PASS |
| Admin unit |15 PASS |
| RN classification unit |2 PASS; metadata parse, legacy inputs and independent array copy on resubmit |
| API E2E catalog-drafts/listing-review |93 PASS;34 reviewed listings span17 roots, paging/branch/invalid context checks, existing review/permission/replay/race checks retained |
| Mongo schema suite |17 PASS; fresh72-ID validation, v1→v2 upgrade, unchanged historical revision/0016 checksum and append-only app role |
| API/Web/Admin build and all four client/API typechecks |PASS; final builds after UI fixes and vocabulary profiles |
| RN `export:all` |PASS Android/iOS Hermes bundles and13 static web routes; bundling is not native runtime acceptance |
| API/Web/Admin/RN lint |0errors; existing5web Exchange and4RN wishlist warnings |
| Contract check/routes |PASS,0.34.0,125 operations/22controllers |
| Impeccable detector |One run, `[]` in [detector.json](detector.json); not run a second time |

The intentional-public-route allowlist test had omitted the already existing
`getAuctionPhoto` operation. Its expected set now includes that exact route;
no API route was made public by this change. Neither session/financial suites
nor unrelated native acceptance gates were rerun.

Final arts profile positive/negative branch checks run against current source.
Browser fixture API loaded the earlier v2 artMedium profile before that final
restriction refinement; its exercised language/law behaviors are unchanged.
No production-load, continuous FPS, Safari, actual200%zoom, real-phone,
Android/TalkBack, remote CI or human acceptance claim is made.

## Browser evidence and capture validity

Chromium in-app browser,1366×768 desktop,390×844 mobile,320×740 small mobile.
Isolated API3009/web5187/Admin5189 fixture:21 reviewed listings plus one catalog
request. Test titles/descriptions label fixture data. Reused Alice image is an
existing local QA illustration, not a corresponding commercial-book photograph.
Preview captures show real sourced covers, source links and sample labels.

| Capture | Verified state |
| --- | --- |
| [Directory desktop](directory-desktop.jpg) |Settled opaque panel,17 roots/four columns; opacity1 and paper background checked |
| [Directory mobile](directory-mobile.jpg) |Accent-folded French search and source-preserving child link |
| [Home discovery](home-discovery-desktop.jpg) |Expanded17-root system navigation; hero identity preserved |
| [Parent search desktop](search-parent-desktop.jpg) |Language parent+Exam+(N3 OR TOEIC)+Grammar returns two live QA listings |
| [Filter mobile](filter-parent-mobile.jpg), [320px](filter-parent-320.jpg) |Native mobile selects have one chevron; locked page and visible Apply/Reset footer |
| [Arts preview mobile](search-arts-mobile.jpg) |All three covers complete with nonzero natural width before final capture |
| [Posting desktop](posting-law-desktop.jpg), [mobile](posting-law-mobile.jpg) |Law/civil classification; captured from scrollY0 after visiting footer to settle inherited reveals |
| [Desktop footer](posting-law-desktop-footer.jpg), [mobile footer](posting-law-mobile-footer.jpg) |Actual viewport confirmation of depth disclosure and continuation control |
| [Detail mobile](detail-law-mobile.jpg) |Category path, civil/law labels and edition language; visual state unchanged by later explicit live-link correction |
| [Linked search mobile](detail-linked-search-mobile.jpg) |Civil link uses data=live and returns the actual QA book |
| [Admin desktop](admin-classification-desktop.jpg) |Pending revision path/labels/language; subsequently confirmed through UI with decision history visible |

Interactions additionally checked: directory Escape restores trigger focus;
Japanese N3 is pruned and announced on changing to English; removing the TOEIC
chip changes URL and Back restores it; mobile dialog Escape/reopen retains draft;
Apply updates URL; no horizontal overflow at390/320; Sell step2→1 preserves law,
civil, title and author. Full upload/submit UI was not repeated; related API and
existing listing-closure tests cover commands. OS/browser motion settings were
not changed; scoped directory overrides retain the owner's motion policy.

Initial captures caught an entry-animation frame, offscreen form reveals and
lazy covers. Only those named frames were recaptured after loading/scrolling;
no additional UI polish loop ran. All14 final JPEGs were inspected by the fresh
Impeccable finish reviewer. Verdict **ship**, no material implementation fixes
in its visual scope. This is AI review, not human sign-off or API security proof.

## Local rollout and diagnostic limits

Main database already had0016–0018. `pnpm db:migrate` applied exactly0019 on
12/10, with existing books/revisions retained and no seed/reset/backfill.
API3000 was offline and restarted via `pnpm dev:api`; current taxonomy endpoint
returns HTTP200/catalog-v2/72 flattened nodes. Web5186 returns HTTP200.
Other environments must run their normal migration workflow before v2 writes.

QA fixture/API/web/Admin were closed; its database/users/roles and the two
scoped suite databases/users/roles were removed. Remaining QA databases0;
the QA Mongo container started for this work was stopped. Temporary browser
session reports0 tabs. Main API3000/web5186 and main Mongo keep running.

The actual public-eligibility+classification pipeline was explained against
21 QA listings: base cursor examined21 documents/21 keys, downstream lookup
collectionScans0, catalog book/revision lookups used `_id_`, final result1 for
language-parent Exam/N3. This demonstrates pipeline shape only; it is not
production performance evidence and does not justify another index yet.

Deferred: runtime vocabulary CRUD, historical Confirmed reclassification,
full RN taxonomy editor/native acceptance, facet counts and auction filtering.
READINESS and existing business gates remain unchanged. Teammate Chat,
Notifications, MainLayout and Home CSS WIP are preserved outside this commit.
