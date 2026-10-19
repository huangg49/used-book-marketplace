import { describe, expect, it } from "vitest";
import { ApiError } from "@used-books/session-client";
import {
  buyNowError,
  quoteSchema,
  orderReceiptSchema,
  ordersPageSchema,
} from "./contracts";

describe("orders contracts & helpers", () => {
  it("translates API error status codes into helpful Vietnamese messages", () => {
    expect(buyNowError(new ApiError(409, "ListingLocked", "Conflict"))).toContain(
      "đang được giữ chỗ giao dịch",
    );
    expect(buyNowError(new ApiError(403, "Forbidden", "Forbidden"))).toContain(
      "chưa đủ điều kiện đặt mua",
    );
    expect(buyNowError(new ApiError(404, "NotFound", "NotFound"))).toContain(
      "không còn tồn tại",
    );
    expect(buyNowError(new ApiError(422, "Unprocessable", "Unprocessable"))).toContain(
      "Khu vực giao nhận không hợp lệ",
    );
  });


  it("validates quote and receipt schemas", () => {
    const validQuote = {
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      listingVersion: 2,
      listingRevisionId: "22222222-2222-4222-8222-222222222222",
      expiresAt: "2026-10-20T00:00:00.000Z",
      amounts: {
        bookPrice: 50000,
        shippingFee: 15000,
        buyerTotal: 65000,
      },
    };
    expect(quoteSchema.parse(validQuote).amounts.buyerTotal).toBe(65000);

    const validReceipt = {
      id: "33333333-3333-4333-8333-333333333333",
      entityType: "Order",
      entityId: "44444444-4444-4444-8444-444444444444",
      contextId: "55555555-5555-4555-8555-555555555555",
      version: 1,
      state: "AwaitingPayment",
      paymentDeadline: "2026-10-20T00:15:00.000Z",
      serverTime: "2026-10-20T00:00:00.000Z",
    };
    expect(orderReceiptSchema.parse(validReceipt).state).toBe("AwaitingPayment");
  });

  it("validates orders page schema", () => {
    const validPage = {
      items: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          title: "Truyện Kiều",
          listingId: "55555555-5555-4555-8555-555555555555",
          version: 1,
          state: "AwaitingPayment",
          role: "Buyer",
          createdAt: "2026-10-20T00:00:00.000Z",
          paymentDeadline: "2026-10-20T00:15:00.000Z",
        },
      ],
      nextCursor: null,
      serverTime: "2026-10-20T00:00:00.000Z",
    };
    const parsed = ordersPageSchema.parse(validPage);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].state).toBe("AwaitingPayment");
  });
});

