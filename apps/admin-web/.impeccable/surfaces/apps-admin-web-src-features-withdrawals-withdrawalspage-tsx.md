---
version: 1
slug: "apps-admin-web-src-features-withdrawals-withdrawalspage-tsx"
primary_target: "apps/admin-web/src/features/withdrawals/WithdrawalsPage.tsx"
related_targets: ["apps/admin-web/src/features/withdrawals/WithdrawalsPage.module.css"]
---

# Withdrawal queue — Operate refinement

THESIS: Help Admin identify a withdrawal and open the correct request for review.
Extend the incumbent wallet/operations direction `incumbent-wallet-admin`; no
new visual world or imagery. Preserve DESIGN.md, wine/paper/cream, Admin heading
and body type, native filter, Button, StatusPill and CursorPagination.

First viewport: title and real refresh action share a row. Remove the isolated
arrow above the heading. One flat paper-framed working panel contains the state
filter, honest loaded-row count, existing oldest-first hint, data and pagination.
The count describes loaded rows, not the total server queue. Never infer zero
while loading or denied. No KPI tiles, charts, simulated totals or new endpoint.

Rows: real Member initial/name with request/date metadata; wine, right-aligned
tabular money; actual reason and labeled semantic state; one outlined Xem đơn
action. Hover/focus supplies a quiet row tone and the link uses legible wine/paper
feedback. Retain independent-review eligibility and all legacy simulator actions.

Responsive: the available queue width determines layout. Below720px, preserve
one table and its headers but arrange each row into owner, amount/state, reason,
action. Keep visible small labels and44px controls; avoid horizontal panning.
Long names, text scaling, empty/error/retry and further-page failures remain usable.
Use existing Admin shell and existing authored motion; no global CSS/token edits.

API, auth/roles, state query parameters, page cursors, commands and detail/Back
links remain authoritative. Approval/rejection dialogs and Member popup are outside
this visual refinement. No raster added; preserve root DESIGN and its sidecar.

FINISH04/11: compared the owner's before image with real QA browser renders at
1440/1000/390/320 and390with130%text. The request list is primary, figures align,
filter and row action stay available, and the phone layout needs no horizontal
pan. Count uses the same rows as the table. Verdict: fits the incumbent direction
and task; no new style draw or asset. Browser44captures had no page errors/root
overflow; empty/filter/Back and refresh/link contrast at focus/hover/active passed.
Three detector advisories remain on inherited empty/dialog literals outside the
queue rules. This is code/browser review, not human/native/remote CI approval.
