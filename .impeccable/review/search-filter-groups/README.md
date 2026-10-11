# Search group controls — 11/10/2026

Branch `codex/search-filter-group-controls`, base `cce99af`. Scope: UI and local
draft controls only; existing taxonomy, API, validation and preview pipeline.

## Browser evidence

CUA Chromium, local Vite5186, explicit DEV preview. Desktop1280×800 and
mobile390×844, no main DB/email/backend mutation. One inspection batch across
desktop/mobile, then confirmation; corrected a fieldset reset alignment found
in confirmation without widening scope. QA tab closed and viewport override
reset. Vite remains available for owner review.

- [Desktop](desktop.png): native condition radios, selected line and group reset.
- [Mobile](mobile.png): selected condition and reset align with the heading;
  footer stays visible while the form body scrolls. Category reset keeps condition.
- Two genres + Shounen + Good + max200000: resetting genre removes its two
  values only, focuses summary and leaves URL unchanged until Apply. Apply
  produces three matching preview listings and focuses the result heading.
- Japanese + exam purpose + JLPT N5: resetting purpose removes incompatible N5.
- Mobile condition/price resets survive Escape/reopen. Apply removes only those
  URL criteria, updates results, closes dialog and restores body scrolling.
- Series and edition-language reset preserve the other draft groups.
- ArrowUp/ArrowDown select exactly one condition, with visible wine focus.
- Category reset removes contextual attributes while retaining Good. No
  horizontal overflow at390px. Existing remote-cover retry appeared for one
  Open Library image; cover loading is outside this patch.

## Checks and limits

- Web build with TypeScript,78unit tests, lint PASS;5pre-existing Exchange
  warnings and existing Vite chunk warning.
- One mechanical Impeccable scan:9advisories, all pre-existing Search CSS values
  outside this diff (10/7/16px radii and search-button #341509). Incumbent control/
  modal recipes documented in DESIGN.md; no token changes or suppressions.
- Live API/DB, authenticated Sell runtime, Safari, screen-reader speech,
  physical device, human sign-off and remote CI NOT RUN. Posting keeps default
  clearable=false; typecheck and source review cover the shared consumer.
- No result counts fabricated. Real facet totals, publisher and publication
  year need a separate contract/data design before implementation.
