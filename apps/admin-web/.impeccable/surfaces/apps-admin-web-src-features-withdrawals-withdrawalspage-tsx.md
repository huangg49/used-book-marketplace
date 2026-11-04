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
links remain authoritative. Queue refinements keep the command dialogs intact;
the separately requested approval refinement is described below. Member popup
and rejection styling remain outside this scope. No raster added; preserve root
DESIGN and its sidecar.

FINISH04/11: compared the owner's before image with real QA browser renders at
1440/1000/390/320 and390with130%text. The request list is primary, figures align,
filter and row action stay available, and the phone layout needs no horizontal
pan. Count uses the same rows as the table. Verdict: fits the incumbent direction
and task; no new style draw or asset. Browser44captures had no page errors/root
overflow; empty/filter/Back and refresh/link contrast at focus/hover/active passed.
Three detector advisories remain on inherited empty/dialog literals outside the
queue rules. This is code/browser review, not human/native/remote CI approval.

Filter clarification04/11: the normal Admin menu has All, Requested, Completed,
Rejected. Manual approval completes immediately, so do not offer intermediate
approval, payout/reconciliation or refund filters by default. Preserve legacy
row/history labels and an explicitly selected old-state deep link; leaving that
selection restores the four-option menu. The separate simulator route retains
its existing state choices. No data migration or change to the state machine.

Approval refinement04/11: a560px paper popup reuses the incumbent wine/cream
world. Wine header explains confirmation; a cream amount band carries tabular
money, actual status and requester/reference. Unboxed recipient fields lead with
the full account number at24px, then bank and holder. The recent15-minute session
note remains explicit. Keep only Xác nhận and close, no approval reason field.
Below480px stack amount/status and recipient fields with20px insets; native scroll
and a sticky header keep the close target available. One420ms opening and240ms
backdrop fade/static4px blur, fast hover/press and fine-pointer close rotation
support the same dialog task under both OS motion preferences. Busy/unknown-result
locks, error/retry, focus/Escape restoration, command intent/key/body/version and
rejection fields keep their existing handlers. No new bank/security claims.

Approval finish: viewed desktop/390/320/130%text and unknown-result recovery.
Verdict: clear money/account hierarchy, compact recipient fields, visible confirm
and scrollable recovery; no horizontal overflow. PASS229Admin unit/build/typecheck/
lint,47browser captures/0page errors and126interaction color states. Escape/focus
restore, leading-zero account, no reason field and exact command retry passed.
Fixed a shared-hover override on the close foreground; final close contrast≥10.7
and confirm≥9.6. Three inherited detector advisories remain; no asset, root design
or API change. Browser/code review does not replace human/native/remote CI review.
