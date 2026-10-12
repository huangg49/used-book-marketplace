# Posting field focus — documentation comparison

Compared on 12/10/2026 against `30f6df3`, restricted to the current Sell field-focus extension. This is source/documentation evidence, not a shipping verdict or release-gate approval.

## Source and recorded system

Checked `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, the Sell surface brief, `SellBookPage.module.css`, the corresponding Sell JSX, the shared classification markup and web global CSS. The existing wine/cream archival paper desk remains the governing world.

The Sell paragraph, sidecar `sell-paper-task-desk.fieldFocus` and surface follow-up agree with the current CSS:

- Eligible text inputs, textareas and selects within the Sell form change their existing border to wine on focus, with no outer outline. Keyboard focus-visible adds a contiguous 1px inset stroke alongside the existing 1px border: one 2px boundary without a geometry change.
- The manual title retains its bottom-only rule; its keyboard inset stroke is bottom-only too. Associated functional labels turn wine through the field, language, catalog and classification wrappers.
- Border/stroke and label color transitions use 170ms ease-out. Scoped important durations preserve this motion under the owner's current preference policy despite the global reduced-motion duration override.
- Invalid controls bind their focus color to the existing canonical `shop-error` rust (`#912b0e`). The local Sell root binding resolves an already documented role absent from global CSS; no global palette or frontmatter primitive was added.
- Checkbox, radio, range and file inputs are excluded from both the ordinary field focus treatment and its forced-colors fallback. Button/disclosure outlines, visible choice-face focus, active-step focus and native file control recipes remain unchanged. Forced-colors substitutes a 2px inset system `Highlight` outline for the eligible fields and suppresses their shadow; this branch has not been runtime-tested.

## Preservation and evidence limits

The complete DESIGN frontmatter is unchanged from the base after line-ending normalization. A recursive sidecar comparison found only two changed paths: `extensions.layoutRecipes[3].controls.focus` and the added `extensions.layoutRecipes[3].fieldFocus`; every other recipe, extension, component sample and narrative value is preserved. DESIGN changes are confined to the Sell control-focus distinction and new scoped paragraph; the surface brief adds only the field-focus follow-up. The CSS diff adds the local error-role binding and field/label/fallback rules; existing paper, spacing, typography, choice and motion recipes are retained.

Inspected `detail.png`, `mobile-focus.png`, `title.png` and `error.png` in this evidence directory. They support the visible single field boundary, wine label, ruled title and distinct rust invalid state within the existing paper desk. Static captures do not prove timing, keyboard semantics or forced-colors behavior. No browser, detector, tests or commit was performed by this documenter; the sidecar's README evidence link is pending the main handoff index.

Inherited Auth availability narrative, older motion wording and older mode-token discrepancies were not canonized or repaired: they are outside this approved field-focus comparison. Independent review and the main implementation handoff retain responsibility for the final disposition. READINESS is not changed by this report.
