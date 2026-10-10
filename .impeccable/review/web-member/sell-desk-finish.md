# Sell desk finish review — 11/10/2026

Final disposition: **ship** for the scoped Member web Sell desk refinement,
after the control-boundary correction verified below. No rebuild or recapture
is requested by this review.

Independent review of the uncommitted SellBookPage source and module CSS on
`codex/web-member-redesign`, base `de214eb`, against PRODUCT.md, DESIGN.md,
approved plan §3, craft floor and the persisted surface contract. No shipped
agent definitions, browser session, implementation edits or new detector pass
were used. Reported execution evidence below was supplied by the implementer
and was not independently rerun.

## persistence

The contract at
`apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-sellbookpage-tsx.md`
records Operate mode, a clear desk for the actual copy, the incumbent wine/cream
world, five existing steps, a local preview and protected submission recovery.
The source and captures follow that contract. This is a code-led refinement;
there is no missing comp requirement.

The scheduled canonical documentation merge follows this review. Record the
actual 180px/form/260px composition, 1150px preview relocation, 760px wrapping
navigation, form/control roles and retry/exit behavior there. Its current absence
is not a separate defect. Keep Home/Search/Detail recipes and READINESS gates.

## fidelity

All seven supplied raw JPEGs open successfully: `sell-desk-desktop.jpg`,
`sell-desk-laptop.jpg`, `sell-desk-mobile.jpg`,
`sell-desk-review-mobile.jpg`, `sell-desk-320.jpg`,
`sell-desk-condition.jpg` and `sell-desk-success.jpg` in this directory.
Content widths retain the captured scrollbar difference; no image manipulation
was needed. The condition capture is a scrolled viewport, showing all three
questions together; its blank fields follow the reported successful reset.

The desktop and laptop compositions make the selected step, labelled fields and
next action easy to find. The preview provides the actual selected local image,
long title, author, condition and separately labelled values without fabricated
ratings, coins or public availability. At 390px and 320px, step labels wrap and
the review preview joins the form column. These captures show the top of review;
lower condition facts, ownership and final action were inspected in source.

The submitted screen says “Đã gửi duyệt” and explains that both book information
and the listing await review before public display. Its QA title identifies the
fixture. The local preview is explicitly unpublished, and the session-only copy
does not promise auto-save. The restrained paper surface, wine controls and
functional icons fit the approved world without decorative distraction.

## ceiling

Source retains all five steps and existing submission service. Labels use native
inputs; condition questions have fieldsets/legends and visible radio choices.
Controls have 44–48px minimum targets, headings receive step-change focus, and
errors have focused alert output. Shared selection, caret and scrollbar theming
are present. Text and placeholder contrast against paper pass the 4.5:1 floor
(the scoped muted text is approximately 5.77:1 on paper and 5.08:1 on page ground).
One boundary color fails the control floor, detailed below.

Validation protects required metadata, photographs, complete condition answers,
eligibility, prices and ownership. Data stays in React state across steps and
validation failures. After submission starts, editable fields lock and the same
in-memory submission closure is retried. Success follows the awaited service
result; “Đăng cuốn khác” clears that closure and the prior input/photo state.
Object URLs are revoked on deletion, reset and unmount. The exit dialog and
beforeunload handler warn about losing local content or an unresolved attempt.
No backend, SessionClient, command key/version or business-state change appears
in this slice.

Supplied evidence reports browser checks for four viewport widths without
horizontal overflow, retained step data, invalid price/readability/ownership
rejection, alert focus, exit/stay preservation and photo addition/deletion.
Real Nest/Mongo `*_test` with fake storage completed upload/submit; an independent
HTTP check reported exactly one PendingReview listing with the intended values
and one media record. Build/typecheck and 25 unit tests passed; lint reported
zero errors and six existing warnings. The service's frozen-input/lost-response
unit coverage is reported passing. These are useful scoped facts, not a live
Supabase or end-to-end browser retry certification.

Actual browser lost-response retry, the full integration harness, 200% text/zoom,
native, the browser beforeunload prompt and human acceptance remain **NOT RUN**.
The source-only and capture review does not close those gates. The supplied
detector's six advisories need no blanket normalization; the control color below
is an independent numeric accessibility finding, not a stylistic objection.

## material_fixes

1. In `apps/user-web/src/pages/SellBookPage.module.css` at lines 135, 168, 192
   and 285, replace `#ac8e7d` with the existing `var(--shop-control)` (or a
   verified equivalent). The present boundary is approximately **2.962:1**
   against `#fffcf5`; the fields use the same paper fill as their container, so
   this border is their distinguishing boundary and falls below 3:1. It is
   approximately 2.393:1 against the upload ground `#efe3cf`. The established
   `#8e7564` control token provides approximately **4.201:1** and **3.394:1**
   respectively. This is a localized palette correction, not grounds for
   another visual polishing round. Verify the declaration/contrast after the
   edit; existing layout captures remain sufficient.

## keep

- The calm paper desk, useful local preview and compact wrapping step navigation.
- Visible condition questions, explicit ownership, distinct sale/exchange labels
  and truthful pending-review receipt.
- Focused validation, retained input, locked uncertain attempt, unchanged command
  replay semantics and fresh closure after a successful reset.
- Protected exit and local-photo cleanup, with no auto-save or storage claims.

This is an independent AI finish review, not human sign-off, a usability study
or native acceptance. Complete the planned scoped documentation and checkpoint
handoff.

Closure — 11/10/2026: verified all four cited border declarations now use
`var(--shop-control)` and no `#ac8e7d` remains in SellBookPage.module.css. The
current global token is `#8e7564`; recalculation confirms 4.201:1 on paper and
3.394:1 on upload ground. `git diff --check` passes. The sole material finding
is resolved. No further polishing or capture pass was performed. Complete the
already planned canonical documentation merge and checkpoint; the NOT RUN
limits and release gates above remain unchanged.
