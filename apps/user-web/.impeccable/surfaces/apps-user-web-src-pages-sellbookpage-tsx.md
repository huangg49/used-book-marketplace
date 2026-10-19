---
version: 1
slug: "apps-user-web-src-pages-sellbookpage-tsx"
primary_target: "apps/user-web/src/pages/SellBookPage.tsx"
related_targets: ["apps/user-web/src/pages/SellBookPage.module.css", "apps/user-web/src/components/BookJourneyStates.tsx", "apps/user-web/src/components/BookJourneyStates.module.css", "apps/user-web/src/components/CatalogClassificationFields.tsx", "apps/user-web/src/components/CatalogBookPicker.tsx"]
---

# Đăng sách —11/10/2026

## Cover and supporting photos —19/10/2026

Operate; owner reference specifies a dedicated cover slot on the left and a wider
supporting-photo region on the right. Labels name both regions. Empty pickers use
the existing paper/wine palette and dashed borders; loaded images stay contained
in equal-height frames with44px X buttons. Supporting photos form a wrapping grid
with an add tile, maximum7 plus1 required cover. Below760px the regions stack.
Cover removal leaves supporting photos intact; replacement preserves their order.
Clicking a loaded image opens a single-file replacement picker for that slot,
including when all8 slots are occupied. Cancel/invalid files preserve the original.
Visible native buttons trigger hidden inputs (cover single, supports multiple),
with focus restored after replacement/removal and when the last add tile hides.
Keep max8 total, format/size validation, URL cleanup, upload order and pinned
submission retries. No new assets, tokens or motion.

The earlier owner request makes the desktop book preview sticky from1200px,
top112px under navigation, capped at viewport height minus136px with keyboard
scrolling. Mobile retains the existing disclosure. No API/session/native changes.

## Catalog v2 metadata extension —12/10/2026

Operate; ordinary extension on `codex/catalog-expansion`, preserving the paper
desk, five steps, original submission attempt and receipt/retry behavior. No new
comp, world, artwork or global design tokens. Shared registry now exposes17
roots/72 nodes and25 controlled facets. Manual entry composes native category/
optional child selects and edition language in the established paired row;
<=600px it stacks. `editing` uses exact-category metadata rules, distinct from
Search's union of descendant contexts. Optional facets start collapsed unless
selected; unknown information remains blank. Long facets (>10) offer normalized
option search, retain selected choices and cap each facet at16 selections with
status/disabled unchecked alternatives. Category/purpose/school-stage changes
prune incompatible dependencies and announce removal. Series follows shared
Manga/LN capability, and edition language is separate from study language.

Picking a confirmed book retains its bookId/categoryId/attributes/series/language
and locks the existing identity rather than editing a confirmed revision.
Review displays actual shared labels. Admin's pending-revision reader inherits
the same category path/facet/language vocabulary, with no vocabulary CRUD or
direct edit added. RN parsers and rejected-request resubmission preserve optional
classification with copied attribute arrays; full native taxonomy input is a
separate package, and web/export checks do not establish Android acceptance.

Source checked: SellBookPage, CatalogClassificationFields/styles, shared taxonomy,
Admin reader and RN classification preservation. The fresh finish reviewer
inspected all14 final JPEGs and returned ship; desktop/mobile law captures and
separate footer captures show actual metadata disclosures and continuation.
One detector returned `[]`. Browser/API/test evidence and fixture limits are in
[catalog-v2 README](../../../../.impeccable/review/catalog-v2/README.md).
This documenter ran no tests/browser/detector. Full upload/submit browser flow
was not repeated for v2; native/TalkBack/real phone, human review and remote CI
remain unverified, with READINESS unchanged. Historical receipt evidence below
retains its original motion wording; the later owner policy retains designed
motion regardless of OS preference. Global DESIGN.md/sidecar are preserved.

## Approved book-slip entry extension —12/10/2026

Mode: Operate, code-led extension of the approved archival desk, no new world.
THESIS: A book-information slip gives useful hierarchy to identifying the book.
OWN-WORLD: Existing opaque cream paper, wine ink, Be Vietnam Pro fields and the
existing Auth Melody for one nonessential marginal note; original Logo is a
decorative paper mark, paired with a truthful Bản nháp stamp.
STORY: Choose an existing catalog book or write the title from the cover, then
continue through the same five steps, reviewing the actual copy before submission.
FIRST VIEWPORT: Existing progress/preview topology stays; inside the paper, two
native pressed buttons choose the entry method. Manual title is a larger ruled
line; author below; category/language share a row above existing optional facets.
Below600px the paired fields stack. Catalog selection becomes a readable summary.
FORM: No API/session/validation/payload/retry changes. Draft values survive entry
method switches and step navigation. Invalid first-step submission opens manual
fields before the existing focused summary. Empty preview keeps illustration and
price quiet; condition/prices appear as those steps are reached or data entered.
QUALITY BAR: Existing44/48px controls, accessible labels/focus/error recovery,
320px to desktop without horizontal overflow; no premature price error styling.
FINISH: Fresh independent review plus documentation comparison and captured
runtime evidence; existing shipping assets only, no new raster or design token.

## Choice-row refinement —12/10/2026

Field-focus follow-up: within Sell, text inputs/textareas/selects have one wine
boundary and an associated wine label when focused, no outer outline. Native
focus-visible adds a contiguous inset stroke; title remains a bottom rule. Color
transitions170ms retain owner motion policy. Existing rust error role is bound at
the route root, keeping focused errors distinct; forced-colors has a system inset
outline fallback. Buttons/choices/files, values, validation and shared CSS remain.

Owner screenshot rejected the sparse browser-default Yes/No layout. Preserve all
questions, native radio names/booleans, validation and the surrounding paper desk.
Each eligibility question becomes a ruled row: text left, two48px answer faces
right (196px group/8px gap), stacking below600px. The selected face has wine ink
ground/cream text and a check; unselected paper retains a control boundary.
Actual inputs stay keyboard/AT accessible, with focus outlined on the visible
face. Sale/Exchange/Both use the same local face, three columns above600px and
one column below. No correctness color, auto-answer or new motion/business rule.

Owner follow-up: activating an already selected condition answer clears that
answer to the existing null/unanswered state; selecting the other answer and
native arrow navigation still choose normally. A shared described hint explains
repeat activation. Null answers still block Continue with existing validation.
The last question has no bottom rule; the action row retains its separator.
Mode remains exclusive and cannot be cleared.

Mode: operate. Approved plan §3, incumbent wine/cream world, code-led.
THESIS: A clear desk for describing the actual copy and checking before submission.
OWN-WORLD: Paper surface, wine controls, Be Vietnam Pro fields, restrained rules.
STORY: Enter book, attach photos, disclose condition, choose prices, review and submit.
FIRST VIEWPORT: Đăng sách heading and Để sách đi tiếp lede over Minh's archival
paper art; one horizontal five-step navigation. At1200px+,240px local preview
left and a wide opaque paper form right inside1280px. Below1200px preview is a
native disclosure; mobile has five44px number buttons and a single form column.
FORM: Refine current five steps without changing submission API/session semantics.
Signature: useful preview and step validation with focused errors; protected
exit, original command attempt retained on uncertain response. No auto-save claim.
QUALITY BAR: Full condition questions visible,44px targets, long-title wrapping,
keyboard/focus, data retained across steps/errors, real receipt before success.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Approved submission-receipt extension —11/10/2026

Mode: Operate. Inherited direction seed: `20e973c0`; established wine/cream
penguin world, code-led extension; no new world or composition workshop.
THESIS: A paper receipt makes a completed submission and its next action clear.
OWN-WORLD: Existing wine/cream roles, Anton state heading, Be Vietnam Pro copy;
one transparent pending illustration with adjacent provenance and prompt sidecar.
STORY: Existing service resolves, show pending moderation, then reset or go home.
FIRST VIEWPORT: Art left320px, message right inside960px paper/12px receipt,
40px padding/gap. At760px art above/max240px,24px padding and16px gap.
FORM: Shared ListingSubmissionConfirmation only at real Sell step6; title wraps,
reset callback retains the original attempt/photo/field cleanup. Five form steps,
API/session/idempotency stay intact. The approved blended desk below supersedes
the former no-background-picture policy for this route only.
QUALITY BAR:48px solid primary,44px home link,3px wine focus/4px offset; pending
art settles once560ms from8px/−2°, default visible; reduced motion removes it.
FINISH: Supersedes no-new-raster only for this receipt. `story-pending-*` captures
are labelled component QA, not proof of the full authenticated submission flow.
Keep source/review evidence and pending.webp prompt/provenance; no gate/native claim.

## Direction contract — approved blended desk,11/10/2026

THESIS: Retain Minh's paper desk and horizontal progress, combine with reliable
copy-specific information; avoid duplicate step navigation or three columns.
OWN-WORLD: Existing wine/cream controls and fonts; archived bookshop paper art at
the edges, opaque paper form, restrained rules and a contained actual-copy photo.
STORY: Identify book, photograph copy, disclose condition, choose sale/exchange,
review all information and submit to moderation with draft and retry protected.
FIRST VIEWPORT:1280px container, compact heading, five horizontal steps,240px
preview left / form right. Laptop and mobile collapse preview into Xem bản nháp.
FORM: Operate/code-led extension, approved WEB_POSTING_BLEND_PROPOSAL; no new
world/seed or composition workshop. Step completion derives from existing rules;
review edit links and inline errors keep inputs/focus. Motion is a short step
entrance and sliding active indicator, retained under owner motion policy.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
