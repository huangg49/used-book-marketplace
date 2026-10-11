# Condition-answer clearing documentation comparison —12/10/2026

Scope: owner-approved ordinary Operate/code-led follow-up on
`codex/posting-choice-clear`, base `7675dec`. Write boundary for this pass is this
report only. The incumbent **Tiệm sách nhiều màu** world, paper desk, book slip,
choice faces and surrounding layout remain the visual authority.

Read the shipped documenter instructions and full `reference/document.md`,
PRODUCT.md, the applicable UI/workflow instructions, DESIGN.md, the sidecar, the
Sell surface contract and current condition/mode source. Compared the two-file
source diff and three scoped record diffs against `7675dec`. Inspected the saved
`desktop.png`, `mobile.png`, `user-320.png`, `error.png` and `detail.png` captures.
No browser, detector, runtime tests, code edits, commit or push ran in this pass.

## Source and record agreement

- DESIGN's Sell choice paragraph, `sell-paper-task-desk.choiceRows` and the Sell
  surface follow-up agree with the inspected source: repeat click or Space on an
  already checked condition answer restores the existing null/unanswered state.
  The new handlers are limited to the three condition groups. The unchanged
  native `onChange` still selects answers; arrows are not overridden. Space
  repeat is prevented from repeatedly changing state. These are source findings,
  not a fresh keyboard-runtime acceptance result.
- The shared visible hint says **Nhấn lại đáp án đang chọn để bỏ chọn.** Each
  condition fieldset includes its ID through the existing `feedbackProps`
  `aria-describedby` composition, which also retains the inline error ID when
  present. Clipped native legends and aria-hidden visible question duplicates
  remain unchanged. This pass did not test assistive-technology speech.
- Null answers still fail the existing step-three required-answer check. The
  saved error capture shows the final question unanswered, the existing inline
  **Chọn Có hoặc Không.** feedback and required-answer summary while text and
  other answers remain visible. Captures alone do not prove the clearing event
  or Continue interaction; those require the separate runtime evidence.
- Only the final question's bottom border is removed. The existing action row
  keeps its `shop-line` top border,24px top padding and32px top margin. Saved
  desktop/detail and narrow captures agree: the first two question rules remain,
  and one action separator follows the final question.
- Sale/Exchange/Both remains the existing exclusive native radio group, with
  only its unchanged change handler; it has no clearing handlers or hint. The
  source diff introduces no token, palette, font, API, session, payload,
  submission-attempt, raster or motion change. The new null transition is the
  approved UI behavior extension; eligibility and required-answer rules remain.

## Preservation checks

JSON parse and scoped `git diff --check`: PASS. An exact parsed-value comparison
against `7675dec`, after restoring only `choiceRows.questions` and removing only
the added `choiceRows.clearAnswer`, makes the complete sidecar identical to the
base. All other recipe fields, components, extensions and narrative are preserved.
DESIGN frontmatter is identical after newline normalization; its diff changes
only the intended Sell choice paragraph. The surface diff adds only the approved
follow-up paragraph. No new primitive or system-wide doctrine was introduced.

The saved desktop/mobile/320px/detail captures retain paper/ink unchecked faces,
wine/cream checked faces with visible checks and the described hint. Desktop
questions stay beside the paired answers; narrow questions stack above them.
The existing 48px answer/52px mode minimums,6px face corners,14px/1.7 semibold
type,196px desktop answer group,8px face gap and600px responsive threshold remain
the source-backed recipe; screenshot inspection does not measure computed values.

## Five-line system summary

1. Palette: existing wine, cream, paper and ink; `shop-control` bounds faces and `shop-line` separates rows/actions.
2. Type: Anton remains the expressive heading face; Be Vietnam Pro carries functional copy and14px/1.7 semibold choice labels.
3. Layout: restrained ruled paper desk;196px paired desktop answers stack to full width below600px.
4. Faces:48px answers/52px modes,6px corners, reserved check space, native focus with3px wine outline/3px offset.
5. Rules: **The Two Voices Rule** and **The Ground Is Not Status Rule** remain; choice color conveys selection, while explicit validation conveys eligibility.

## Drift not canonized or repaired

Pre-existing Auth overview/behavior drift, older global motion-reduction prose,
the old `sell-mode-selected` primitive recipe and historical shadow-DOM/evidence
records remain outside this follow-up. The scoped `choiceRows` source-backed
recipe describes the current faces; inherited discrepancies are not promoted
into new rules. The existing choice comparison link continues to name the
preceding refinement report; this report records the follow-up separately.

No material source-versus-record mismatch was found within the approved clearing
and separator extension. Independent finish review and runtime evidence remain
separate from this documentation comparison. This report makes no shipping,
native PASS, human acceptance, CI or closed READINESS-gate claim.
