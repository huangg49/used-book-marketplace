---
target: Admin visual refinement
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\DESKTOP\\Documents\\WDP391\\used-book-marketplace\\apps\\admin-web\\src"
timestamp: 2026-10-26T16-28-59Z
slug: apps-admin-web-src
---
# Admin visual assessment —26/10/2026

Target: apps/admin-web/src, Operate mode, base d3b19e5 + current local Admin branch.
Provenance: two independent assessments A/B, fresh background browser tabs on an
isolated HTTP/Mongo QA fixture. A completed before B findings entered synthesis.

## Verdict

The original owl, wine/paper palette and physical book shelf belong to Lật lại.
Oversized editorial headings, rounded white panels and repeated elevated cards
weaken the operational composition. Preserve the authored shelf and navigation;
refine the surrounding hierarchy/materials rather than replace the visual world.

## Heuristics

| Heuristic | Score /4 | Evidence |
| --- | ---: | --- |
| System status | 3 | Loading, counts and updated times are visible |
| Real-world match | 3 | Operational terms clear, poetic H1 slows recognition |
| Control/freedom | 3 | Back/filter/draft guards present |
| Consistency | 2 | Paper slips versus elevated white panels |
| Error prevention | 3 | Required review checks/confirmation retained |
| Recognition | 3 | Labelled sidebar and status support orientation |
| Efficiency | 2 | Command search helps; large vertical rhythm costs scrolling |
| Aesthetic/minimalism | 2 | Repeated card chrome competes with content |
| Error recovery | 3 | Retry/draft logic present; not fully exercised by reviewers |
| Help/documentation | 2 | Useful guidance competes with task content |
| Total | 26/40 | AI heuristic judgment, not human usability acceptance |

Strengths: original identity and specific book-shelf interaction; labelled,
compact sidebar with keyboard search and existing motion. Cognitive load moderate;
do not remove required checklist items or permission guardrails. Warm arrival,
slower document reading as container chrome accumulates.

## Priority Issues

1. P1: Content starts too low; preview primary action is below a common laptop
   viewport, Users table starts around y500, only two complete queue rows fit.
   Compact workspace/header/toolbars/rows and preview rhythm without clipping titles.
2. P2: White rounded/shadowed cards repeat across queue, directory, detail and
   empty states, competing with the paper slip. Flatten repeated records and unify
   material; reserve authored paper/wine emphasis for the review/decision object.
3. P2: Directory headers are 11.52px with #8e7564 on #fbf8f2, about4.06:1.
   Identity, status pills and timestamps wrap inconsistently. Darken header text,
   allocate columns, keep short states together and deliberately format date/time.
4. P2: Operational identity should lead. Replace poetic queue/detail H1 with
   task/object labels while retaining the existing descriptive guidance and brand.
5. P3: Legacy controls use38/40px instead of44px, and shared loaders reference
   missing animate-spin/spin definitions. Correct targets and shared busy motion.

Other observations: empty assignment-dependent queues need a compact state, not a
large empty hero. Do not infer an assignment error or change task rules from an
empty list. Long emails/titles and narrow detail columns need responsive inspection.

## Detector evidence

B ran the pinned detector once over the target. Valid JSON:47findings,6warnings/
41advisories. Exit reported1 despite complete output, so not a clean scanner PASS.
Rules: side-tab2, border-accent-on-rounded4, bounce-easing3, design-system-color21,
design-system-font-size6, design-system-radius11. Raw JSON retained in
`.tmp/admin-ui-polish/detector-before.json`.

False positives/intentional brand details: ease-spring does not overshoot; square
PendingShelf/CommandPalette top rules are not rounded accents; blockquote boundary
is semantic; Login badge colors and status pills have an authored purpose. Do not
edit these merely to lower detector counts. Directory contrast and missing shared
spinner are independent source/browser defects.

Personas affected: frequent reviewers scroll unnecessarily; long identity data
makes rows disproportionately tall; first-time staff may confuse an unassigned
point with a cleared queue. Preserve assignment guidance without inventing states.

Questions skipped: owner explicitly authorized selecting and fixing UI issues;
this instruction supersedes the critique workflow's scope interview. No permission
or business decision remains necessary for these visual refinements.
