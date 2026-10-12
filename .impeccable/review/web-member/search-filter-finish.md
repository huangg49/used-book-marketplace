# Compact Search filters — independent finish11/10/2026

Source: BookSearchPage.tsx/module.css on codex/web-member-redesign after88bd62c.
Code-led refinement; no approved new comp/raster. Reviewer search_filter_finish,
fresh context; separate search_filter_documenter updated only canonical files.

## Persistence

Draft values, price validation, accessible price names, Apply/reset/query/Back
and live-vs-preview behavior preserved. Canonical source/schema and unrelated
metadata preservation PASS. No Home, session, API or dependency change.

## Fidelity

Full review found two material issues: six-digit prices clipped, and invalid
price error pushed actions below1535×735. One reviewer-fix batch moved currency
to legend with Từ/Đến labels and uses native condition select for invalid forms
at desktop widths above900px/heights701–850px. All baseline screenshots recaptured.

Verdict pass: both findings **resolved**. Invalid1535×735 and1366×768 captures
show complete error, disabled Apply, reset and full200000/100000 at scrollY0;
panel bottom701.75px. Short-dialog320×400 shows unfocused100000/200000 fully
readable and44px actions. Baseline laptop fit preserved, bottom719.46875px.

## Ceiling

Disposition: **SHIP for the two scored fixes**. No regression observed from
the fix batch. This does not add200% zoom, OS keyboard, native, human or live API
success acceptance. Low-height capture is a viewport proxy, not OS keyboard QA.

## Material fixes

None remaining from the scored findings. Initial recapture request was resolved
when the user opened the working localhost tab; old failed tab was not bypassed.

## Keep

Keep shared currency legend, readable fields, invalid-state condition fallback,
complete error text,44px controls, visible recovery actions and native dialog.
Keep unrelated Chat/Notifications WIP and socket-auth race open.
