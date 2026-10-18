import { describe, expect, it } from "vitest";
import { mapExchangeStatusInfo, exchangeSchema } from "./contracts";

describe("mapExchangeStatusInfo", () => {
  it("returns distinct labels for initiator vs recipient in Proposed status", () => {
    const forInitiator = mapExchangeStatusInfo("Proposed", true);
    const forRecipient = mapExchangeStatusInfo("Proposed", false);

    expect(forInitiator.label).toContain("Chờ đối tác");
    expect(forRecipient.label).toContain("Đề nghị mới");
    expect(forInitiator.stepIndex).toBe(0);
  });

  it("handles Completed status correctly", () => {
    const info = mapExchangeStatusInfo("Completed", true);
    expect(info.label).toBe("Trao đổi hoàn tất");
    expect(info.stepIndex).toBe(5);
  });

  it("handles Cancelled status correctly with negative step index", () => {
    const info = mapExchangeStatusInfo("Cancelled", true);
    expect(info.label).toBe("Giao dịch đã hủy");
    expect(info.stepIndex).toBe(-1);
  });
});

describe("exchangeSchema", () => {
  it("validates a full exchange payload safely", () => {
    const mockExchange = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      initiatorId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      recipientId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
      initiatorListingId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
      recipientListingId: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
      status: "Proposed",
      revision: 1,
      initiatorDeposit: 50000,
      recipientDeposit: 50000,
      diffAmount: 10000,
      diffPayerId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      createdAt: "2026-10-18T10:00:00.000Z",
      updatedAt: "2026-10-18T10:00:00.000Z",
    };

    const parsed = exchangeSchema.safeParse(mockExchange);
    expect(parsed.success).toBe(true);
  });
});
