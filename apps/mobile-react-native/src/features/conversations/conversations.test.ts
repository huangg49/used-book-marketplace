import { describe, expect, it } from "vitest";
import {
  eventSummaryText,
  formatDateTimeVi,
  purchaseChatGuidance,
  statusLabels,
} from "./purchase-conversation-service";
import type { ConversationEvent, PurchaseConversation } from "./contracts";

describe("conversations service & guidance", () => {
  const mockRoom: PurchaseConversation = {
    id: "11111111-1111-4111-8111-111111111111",
    listingId: "22222222-2222-4222-8222-222222222222",
    buyer: { id: "buyer-1", displayName: "Người Mua" },
    seller: { id: "seller-1", displayName: "Người Bán" },
    version: 1,
    status: "Active",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    hasQuote: false,
    quotePreview: null,
    orderId: null,
    createdAt: "2026-10-19T00:00:00.000Z",
    closedAt: null,
    terms: {
      mode: "Negotiation",
      pendingProposal: null,
      agreedPrice: null,
      agreedListingRevisionId: null,
      activeExchangeId: null,
      exchangeIds: [],
      locked: false,
    },
  };

  it("calculates initial guidance phase 0 for buyer and seller", () => {
    const buyerGuidance = purchaseChatGuidance(mockRoom, "buyer-1", true);
    expect(buyerGuidance.phase).toBe(0);
    expect(buyerGuidance.title).toBe("Trao đổi trước khi chốt mua");
    expect(buyerGuidance.action).toBe("address");

    const sellerGuidance = purchaseChatGuidance(mockRoom, "seller-1", true);
    expect(sellerGuidance.phase).toBe(0);
    expect(sellerGuidance.action).toBeUndefined();
  });

  it("calculates guidance phase 1 when buyer attached quote", () => {
    const roomWithQuote: PurchaseConversation = {
      ...mockRoom,
      hasQuote: true,
      quotePreview: {
        destination: {
          recipientName: "Nguyễn Văn A",
          phone: "0901234567",
          serviceAreaCode: "HCM-DEMO-v1",
          localityCode: "Q1",
          detail: "123 Lê Lợi",
        },
        shippingFee: 20000,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    };

    const sellerGuidance = purchaseChatGuidance(roomWithQuote, "seller-1", true);
    expect(sellerGuidance.phase).toBe(1);
    expect(sellerGuidance.action).toBe("create-order");

    const buyerGuidance = purchaseChatGuidance(roomWithQuote, "buyer-1", true);
    expect(buyerGuidance.phase).toBe(1);
    expect(buyerGuidance.action).toBe("address");
  });

  it("calculates guidance phase 2 when order is created", () => {
    const orderRoom: PurchaseConversation = {
      ...mockRoom,
      status: "OrderCreated",
      orderId: "33333333-3333-4333-8333-333333333333",
    };

    const guidance = purchaseChatGuidance(orderRoom, "buyer-1", true);
    expect(guidance.phase).toBe(2);
    expect(guidance.title).toBe("Đơn hàng đã được tạo");
    expect(guidance.action).toBe("order");
  });

  it("formats Vietnamese status and event summary texts accurately", () => {
    expect(statusLabels["Active"]).toBe("Đang thương lượng");
    expect(statusLabels["OrderCreated"]).toBe("Đã tạo đơn");

    const priceEvent: ConversationEvent = {
      id: "44444444-4444-4444-8444-444444444444",
      conversationId: mockRoom.id,
      actorId: "buyer-1",
      kind: "PriceProposed",
      mode: null,
      amount: 85000,
      exchangeId: null,
      createdAt: "2026-10-19T00:00:00.000Z",
    };
    expect(eventSummaryText(priceEvent)).toContain("85.000 ₫");

    const modeEvent: ConversationEvent = {
      id: "55555555-5555-4555-8555-555555555555",
      conversationId: mockRoom.id,
      actorId: "seller-1",
      kind: "ModeAccepted",
      mode: "Exchange",
      amount: null,
      exchangeId: null,
      createdAt: "2026-10-19T00:00:00.000Z",
    };
    expect(eventSummaryText(modeEvent)).toContain("đổi sách");

    expect(formatDateTimeVi("2026-10-19T10:30:00.000Z")).not.toBe("");
  });
});
