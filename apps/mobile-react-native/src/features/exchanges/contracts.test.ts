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

  it("validates multi-book exchange with dispute fields", () => {
    const multiBookExchange = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      initiatorId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
      recipientId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
      initiatorListingIds: [
        "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
        "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16",
      ],
      recipientListingId: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15",
      status: "ResolutionPending",
      revision: 3,
      initiatorDeposit: 80000,
      recipientDeposit: 80000,
      diffAmount: 0,
      shippingDeadline: "2026-10-21T10:00:00.000Z",
      disputedAt: "2026-10-19T12:00:00.000Z",
      disputeReason: "Sách bị rách trang",
      disputedBy: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
      createdAt: "2026-10-18T10:00:00.000Z",
      updatedAt: "2026-10-19T12:00:00.000Z",
    };

    const parsed = exchangeSchema.safeParse(multiBookExchange);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.initiatorListingIds).toHaveLength(2);
      expect(parsed.data.disputeReason).toBe("Sách bị rách trang");
    }
  });

  it("validates exchange review payloads safely", async () => {
    const { exchangeReviewsResponseSchema, createExchangeReviewSchema } = await import("./contracts");
    const validCreate = {
      bookRating: 5,
      partnerRating: 5,
      tags: ["Sách đúng mô tả", "Đóng gói cẩn thận"],
      comment: "Rất hài lòng!",
    };
    expect(createExchangeReviewSchema.safeParse(validCreate).success).toBe(true);

    const validResponse = {
      canReview: true,
      deadline: "2026-10-25T10:00:00.000Z",
      myReview: {
        id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        exchangeId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
        authorId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
        targetUserId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
        bookRating: 4,
        partnerRating: 5,
        createdAt: "2026-10-20T10:00:00.000Z",
      },
      partnerReview: null,
    };
    expect(exchangeReviewsResponseSchema.safeParse(validResponse).success).toBe(true);
  });
});

