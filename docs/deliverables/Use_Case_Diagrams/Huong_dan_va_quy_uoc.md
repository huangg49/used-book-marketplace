# Used-book marketplace Use Case Diagram set

Version 1.0, 20 September 2026. Based on SRS-BOOK-001 v1.0.

This bundle contains one overview diagram and eight detailed diagrams, exported from the same PlantUML source as SVG and PNG. Open `index.html` to read, zoom and trace requirements. Use the `svg/` images for reports that support vector graphics and `png/` when raster images are required. Keep the folder structure when moving the bundle.

## Scope and reading guide

- Actors stand outside the rectangle; ellipses inside it are use cases. Solid lines are associations and do not show execution order.
- A dashed `«include»` arrow goes from the base use case to the required included behavior.
- A dashed `«extend»` arrow goes from the optional extension to the base use case. Conditions and extension points are listed below each diagram and in the relationship table.
- System and worker tasks are inside the business application boundary. Do not model the system, database or clock as external actors of the platform.
- Payment Simulator and Carrier Simulator are modeled as services outside the business application boundary. This is a modeling boundary, not a requirement for separate physical servers.
- Buyer, Seller and Exchange party are transaction-specific roles. One user may take different roles in different transactions. Staff/Admin have Member capabilities only when granted that role; actor inheritance does not grant extra permissions.
- Visitor is the public browsing/access role; a Member can also act as a Visitor. Moderator is an authorized Staff/Admin role. Test operator is a separate permission, not a default Member capability.
- Login, ownership, deadlines and valid states are usually preconditions or constraints; do not connect `include Log in` to every use case.

## Relationship to the SRS

OVxx, ACxx, LIxx, ORxx, EXxx, WAxx, DIxx, COxx and ADxx are diagram node IDs. They do not replace SRS UC-01 through UC-16 or AC-01 through AC-50; AC01 on a diagram is different from AC-01 in the acceptance tests. Each diagram table links nodes to related FRs and SRS use cases.

All 91 FRs are traced in the detailed diagrams. This is specification traceability, not software test evidence. Automatic behaviors such as timeouts, settlement, ledger, matching and idempotency are attached to the relevant goals or conditions; internal operations are not turned into user-facing ovals or falsely assigned to users.

Diagram 00 summarizes high-level goals. An association to an overview group does not grant every operation in that group; use the detailed diagrams and SRS permission matrix for implementation. For example, Admin connects to the wallet group to approve withdrawals and still cannot edit balances directly.

## Modeling decisions to explain during review

1. Registration and email verification are separate interactions; include does not describe sequence.
2. An Order exclusively reserves one listing; an exchange proposal does not reserve books until acceptance atomically reserves both.
3. Paying the cash difference is a conditional extension of fulfilling the payment duty. Deposit payment is mandatory. Only the payer uses the extension; both amounts for one party are held in the same business action.
4. A claim is not an extension of confirming receipt because it may be raised before receipt. An appeal is a separate goal after a decision notice, not a time-sequenced extension of issuing the decision.
5. Withdrawal approval, payout execution and recording the result are different goals. Do not include success and assume every payout succeeds.
6. A listing attached to a forum topic must belong to its author; card extensions apply while composing a topic, not while writing comments.
7. Available, Reserved and Completed are states, not use cases. State and activity diagrams are separate supporting artifacts.

## Contents

| Diagram | Content | Related SRS |
|---|---|---|
| 00 | Overview of the used-book marketplace | Overview of modules |
| 01 | Accounts and book discovery | UC-01; part of UC-02, UC-03 |
| 02 | Listing moderation and catalog management | UC-02; part of UC-16 |
| 03 | Book purchase and delivery tracking | UC-03, UC-04, UC-05, UC-09 |
| 04 | Book exchange with deposits and cash difference | UC-06, UC-07, UC-08, UC-09 |
| 05 | Wallet top-up and simulated withdrawal | UC-13; part of UC-16 |
| 06 | Disputes decisions appeals and returns | UC-10, UC-11, UC-12 |
| 07 | Forum chat wishlist notifications and reviews | UC-14, UC-15 |
| 08 | Administration policy and operations | UC-16; related to UC-02, UC-11, UC-13 |

## Editing and rendering

Each diagram has an independent `.puml` file in `plantuml/`. Edit actor names, use-case labels or relationships, then render with PlantUML. The deliverable was rendered locally with PlantUML 1.2026.8 and Graphviz; SRS content is not uploaded to a public rendering server. PNG is exported at 160 DPI; SVG remains vector.

Run this from the `Use_Case_Diagrams` folder and replace the JAR path with your installation:

```powershell
java -jar "C:/tools/plantuml.jar" -charset UTF-8 -tsvg -o "../svg" "plantuml/*.puml"
java -jar "C:/tools/plantuml.jar" -charset UTF-8 -tpng -o "../png" "plantuml/*.puml"
```

Java and the rendering tool are not bundled in the ZIP. Images and `index.html` open without Java or network access. The ZIP also includes a reference SRS so FR links continue to work after extraction.

## Notation references

- [OMG UML 2.5.1 specification](https://www.omg.org/spec/UML/2.5.1/About-UML).
- [PlantUML Use Case Diagram syntax](https://plantuml.com/use-case-diagram).

Business conditions come from the SRS prepared for this project; the references cover notation and tooling and do not validate the project deposit rates, fees or timeouts.
