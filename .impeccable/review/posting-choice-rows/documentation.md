# Choice-row documentation comparison —12/10/2026

Scope: owner-approved ordinary Operate/code-led refinement on
`codex/posting-choice-rows`, base `dfe5f57`. The incumbent **Tiệm sách nhiều màu**
world, archival desk and book-information slip remain the visual authority.

Read the shipped documenter instructions and `reference/document.md`, PRODUCT.md,
DESIGN.md, the sidecar, the Sell surface contract's Choice-row refinement, the
two-file source diff and current condition/mode source. Inspected saved desktop,
mobile, mode-desktop, mode-mobile, questions-focus, user-320 and error captures.
No browser, detector, execution tests, code edits, commit or push ran in this pass.

## Comparison and recorded refinement

- Updated only the Sell paper task desk prose and `sell-paper-task-desk` recipe.
  DESIGN frontmatter, token primitives, sidecar components, all other recipes and
  narrative remain preserved. The historical first-step shadow-DOM sample is
  unchanged; current choice behavior is recorded in `choiceRows`.
- Source and saved captures agree on the paper/ink unchecked faces and wine/cream
  checked faces with a visible check. The same local face serves three eligibility
  groups and the Sale/Exchange/Both group. Neither Có nor Không receives a
  correctness color; the error capture retains the selected invalid answer and
  existing inline explanation/summary.
- Both representations record 48px minimum answer faces,52px mode faces,6px
  corners,10px 12px padding and14px/1.7 semibold text. Native input focus projects
  a3px wine outline at3px offset onto the visible face; the saved question-focus
  capture shows that treatment. Clipped inputs/legends and aria-hidden visible
  question duplicates preserve source accessibility semantics; speech was not
  tested by this documentation pass.
- Condition rows retain18px vertical padding and thin paper rules. Desktop question
  text sits left of a196px paired-answer grid,24px apart; paired faces have8px
  gaps. At600px and below, questions stack above full-width paired answers with
  a12px gap. Mode uses three equal desktop columns and one narrow column. Saved
  desktop/mobile/320px captures match this source recipe and the incumbent paper,
  fonts and surrounding layout.
- Input names, booleans/mode values and change handlers are preserved in the
  inspected diff. No auto-answer, business rule, validation, API, session, token,
  raster or motion change is documented. Implementer reports78tests/build/lint
  passing; those checks were not rerun here.
- Documentation verification: JSON parses and `git diff --check` is clean. An
  exact parsed-value comparison against `dfe5f57` confirms all sidecar data outside
  `sell-paper-task-desk` is unchanged; DESIGN token frontmatter is also unchanged.

## Drift not canonized or repaired

The preserved `sell-mode-selected` frontmatter entry still records the preceding
cream/wine,50px,8px mode recipe. Its primitives are explicitly outside this write
boundary; the current source-backed face is scoped above and in `choiceRows`.
Pre-existing Auth overview/behavior drift and older global motion-reduction prose
remain outside this task, as does the historical first-step shadow-DOM sample.
These inherited records are not promoted as rules for the current choice faces.

The initial independent review requested recapture of `detail.png`; that exact
file was replaced with the valid document-bounds question clip. The final full
review accepts all nine captures and returns **ship** without material fixes for
the scoped choice groups. See `finish-review.md` for that separate disposition.
This documentation comparison asserts no native PASS, human acceptance or closed
READINESS gate.
