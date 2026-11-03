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
The request list follows history. A centered popup leads with available balance,
amount, reason and bank fields. Admin uses its existing shell, status filter,
queue rows and compact detail sheet.

FORM: Incumbent form and queue patterns; inherited seed `incumbent-wallet-admin`.
On small screens controls stack and dialogs scroll within the viewport.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

No raster added; preserve DESIGN.md and its token sidecar for this extension.
