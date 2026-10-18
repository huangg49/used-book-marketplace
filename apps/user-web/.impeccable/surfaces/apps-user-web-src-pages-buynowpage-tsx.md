---
version: 1
slug: "apps-user-web-src-pages-buynowpage-tsx"
primary_target: "apps/user-web/src/pages/BuyNowPage.tsx"
related_targets: ["apps/user-web/src/pages/CheckoutPage.tsx", "apps/user-web/src/pages/ChatPage.tsx", "apps/user-web/src/pages/SellBookPage.tsx", "apps/user-web/src/components/PurchaseDialog.tsx", "apps/user-web/src/components/PurchaseDialog.module.css", "apps/user-web/src/components/PurchaseAddressFields.tsx", "apps/user-web/src/pages/PurchaseFlow.module.css"]
---

# Purchase forms — 17/10/2026

Mode: Operate. Extend the established Member web system. User specifically requests
popup forms for addresses/order creation and a more coherent buying/selling UI.
No framework, backend, payment semantics or release gate changes.

## Direction contract

THESIS: Keep the selected book and costs readable; isolate address entry and order
confirmation in focused dialogs. The requested popup behavior determines the form.

OWN-WORLD: Inherit wine, cream, paper and Be Vietnam Pro controls. Anton remains
for page headings; modal titles use the body face for legibility. Wine marks the
primary action and address selection; mint only denotes the actual book condition.

STORY: Review the copy, enter/select an address, request real shipping costs,
confirm the order, then pay. Negotiated buyers send quotes; sellers create orders.
Pending requests retain their key/body/version and input across dialog dismissal.

FIRST VIEWPORT: Return link and heading over a three-step progress indicator.
Book/condition/address on the left; labelled costs and one next action on the right.
Mobile stacks these areas. A centered, scrollable native dialog holds the form;
the protected-focus entrance is the signature interaction.

FORM: Code-led extension of the established system, explicitly requested popup
composition. No concept roll, new visual world or generated raster assets.
Inherited world provenance: DESIGN.md seed `20e973c0`; no new purchase-flow seed.

QUALITY BAR: 48px form controls, keyboard focus containment/return, Escape and
backdrop close, retained drafts, busy protection, long content wrapping, retry
without duplicate commands. Inspect desktop1440 and mobile390, including errors.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finished recipe

17/10/2026: implemented within the incumbent world; canonical DESIGN.md and
`.impeccable/design.json` preserved. Independent finish review returned fix for
input cascade and saved-address recovery; final verdict scored both resolved,
disposition ship. Documenter recorded the shared web components/consumer examples
in UI_COMPONENTS.md and reported older generic modal/motion prose as existing drift.
No new shipping raster. Browser QA covers390/1440,130% origin text, errors/replay,
keyboard focus and retained drafts; native/provider/human acceptance remains open.
Evidence: `.impeccable/review/purchase-popup/` at repository root.
