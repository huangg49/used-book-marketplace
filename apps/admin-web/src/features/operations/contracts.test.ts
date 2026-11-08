import { describe, expect, it } from "vitest";
import { decisionsFor, operationsAuction } from "./contracts";

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

describe("ADR 0080: held auction rows", () => {
  const row = {
    id: "7f1c2a4e-1b2c-4d5e-8f90-1234567890ab",
    version: 7,
    title: "Sách thử",
    state: "OnHold",
    startPrice: 100_000,
    step: 10_000,
    currentPrice: 150_000,
    bidderCount: 2,
    startAt: "2026-11-08T10:00:00.000Z",
    endAt: "2026-11-09T10:00:00.000Z",
    pointName: "Điểm A",
    holdExpiresAt: "2026-11-10T10:00:00.000Z",
  };
  it("reads when an Admin resumed it, and older servers without the field", () => {
    expect(operationsAuction.parse({ ...row, resumedAt: "2026-11-08T12:00:00.000Z" }).resumedAt).toBe(
      "2026-11-08T12:00:00.000Z",
    );
    expect(operationsAuction.parse({ ...row, resumedAt: null }).resumedAt).toBeNull();
    expect(operationsAuction.parse(row).resumedAt).toBeUndefined();
  });
});
