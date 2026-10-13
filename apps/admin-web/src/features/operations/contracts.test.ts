import { describe, expect, it } from "vitest";
import { decisionsFor } from "./contracts";

describe("point order decision matrix", () => {
  it("only cancels safely when the recipient never answered", () => {
    expect(decisionsFor("RecipientDecisionOverdue")).toEqual({
      RefundBuyer: ["BuyerDefault", "NoFault"],
    });
  });
  it("lets a rejected report be refunded or resumed, never dismissed", () => {
    const allowed = decisionsFor("ReportRejected");
    expect(Object.keys(allowed).sort()).toEqual([
      "RefundBuyer",
      "ResumeCollection",
    ]);
    expect(allowed.RefundBuyer).toEqual(["BookMisdescribed", "NoFault"]);
    expect(allowed.ResumeCollection).toEqual([null]);
  });
  it.each(["InspectionClaim", "ReturnOverdue"] as const)(
    "offers no refund after the handover (%s)",
    (reason) => {
      expect(decisionsFor(reason)).toEqual({
        DismissClaim: [null],
        RequireReturn: [null],
      });
    },
  );
});
