---
version: 1
slug: "apps-user-web-src-pages-walletwithdrawals-tsx"
primary_target: "apps/user-web/src/pages/WalletWithdrawals.tsx"
related_targets: ["apps/user-web/src/pages/WalletWithdrawals.module.css", "apps/user-web/src/pages/WalletPage.tsx", "apps/user-web/src/pages/WalletHistory.tsx", "apps/admin-web/src/features/withdrawals/WithdrawalsPage.tsx", "apps/admin-web/src/features/withdrawals/WithdrawalsPage.module.css"]
---

# Wallet withdrawals — Operate extension

## Direction contract

THESIS: Make the held amount and the next responsible person clear on one request.
This is a code-led extension of the existing wallet and operations desk.

OWN-WORLD: Existing wine, paper, ink and body typography. Native paper dialogs,
legible labels, tabular money, restrained status marks and quiet row separators.
No new visual system, imagery, figures or claims; no approved image comp.

STORY: Enter an amount and required reason, check recipient and remaining funds,
send once, then follow the request. For new Manual requests, Admin confirms and
completes the wallet withdrawal in one command; approval has no reason input.
Rejection still requires a reason. Legacy Simulator requests retain their old flow.

FIRST VIEWPORT: Existing wallet card and history remain. Above them, pending
requests show the real Requested count, the owner's under-24-hour processing
message and a detail action. Count all filtered pages, independent of the history
pagination; do not count Completed/Rejected or claim zero after a read error.
There is no separate withdrawal request list below history, per the owner's
follow-up. Keep withdrawal entries in the transaction history, the pending notice
and existing detail deep links. A centered popup leads with available balance,
amount, reason and bank fields. Admin uses its existing shell, status filter,
queue rows and compact detail sheet.

FORM: Incumbent form and queue patterns; inherited seed `incumbent-wallet-admin`.
On small screens controls stack and dialogs scroll within the viewport.

Owner motion refinement03/11: the withdrawal entry uses a760px paper dialog,
16px corners and a wine header with cream title/description. Local step labels
and an underline distinguish entry from confirmation. Desktop has amount/reason
beside recipient fields, separated by one quiet rule; below680px stack them.
Keep visible field labels, raw digit state with dot-grouped amount display, minimum validation and optional
Other detail. The reason textarea has no manual resize grip; long text scrolls
inside its row-sized height. Presets50k/100k/500k/maximum use the real available balance.
The confirmation shows a receipt with actual recipient, reason, fee0 and remaining
available funds. Preserve disabled entry fields and draft values when editing.

Motion thesis: turn the entered withdrawal into its confirmation receipt.
The520ms popup opening,320ms fading backdrop with static4px blur, one900ms header
light pass and420ms grouped entry (80ms offset) form one opening moment. The local
step underline moves over320ms, Other detail reveals over240ms, confirmation enters
over360ms. Focus states, pressed presets and180ms hover/press feedback stay fast;
pointer-fine CTA light pass650ms and arrow movement support confirmation. Only the
actual pending request has a900ms spinner loop. No animation waits gate actions.
Keep the owner's authored motion under both OS preferences; hover lift is only
for fine pointers. No new raster, dependency or global dialog override.

Button correction04/11: primary/secondary controls carry explicit foreground and
fallback backgrounds for hover, active and keyboard focus, including portals
outside the form header. Missing inherited hover/shelf tokens must never produce
cream text on cream paper. The wine-header close button uses a paper focus ring.
Preserve authored motion, native disabled state and command handlers.

Confirmation refinement04/11: replace the full yellow key/value sheet with a
cream financial block at left and unboxed recipient details at right. Amount
28–36px and account24px lead; bank/holder share a row, reason stays separate under
a quiet rule. Fee and expected remaining funds belong to the money block. Below
680px stack the two regions. Move the hold/refund note outside the figures and
keep the Back action quiet, readable and single-line. Do not repeat the available
balance band during confirmation. Freeze this local remaining-funds preview at
review entry so a lost response/reservation cannot visually subtract twice;
the server remains authoritative for every command.

Amount display04/11: group thousands with dots while typing, pasting and using
presets, e.g.5300500 becomes5.300.500. Keep raw digits for validation, preview and
the numeric API payload. Preserve caret position for insertion/replacement and
Backspace/Delete around separators; selecting only a dot must not delete a money
digit. Do not coerce signed/scientific/letter input to a different positive sum.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Detail refinement04/11: use the incumbent wine header/opening on a700px paper
dialog. A cream amount block pairs tabular money with the actual icon/text state
and a quiet fee row. Requested alone shows the owner's under24h message and hold
explanation. Below it, recipient and real event history share two columns; below
600px they stack. Keep the server-masked account prominent, bank/holder together,
reason separate and all event notes intact. A22px marker and connecting rule show
the recorded timeline, with the latest event/state emphasized; no invented steps.
Collapse the full UUID under a44px keyboard-operable reference summary. Retain
Processing recovery copy, owner-only reads, loading/error/retry, native modal
focus/Back/close and existing body scrolling. Preserve DESIGN.md, API and ledger.

No raster added; preserve DESIGN.md and its token sidecar for this extension.
