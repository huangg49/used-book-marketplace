import { describe, expect, it } from "vitest";
import type { PurchaseConversation } from "../services/purchase-conversations";
import { purchaseChatGuidance } from "./purchase-chat-guidance";

const now = Date.parse("2026-10-18T10:00:00Z");
const room: PurchaseConversation = {
  id: "room", listingId: "book", version: 1, status: "Active",
  buyer: { id: "buyer", displayName: "Người mua" },
  seller: { id: "seller", displayName: "Người bán" },
  expiresAt: null, hasQuote: false, quotePreview: null, orderId: null,
  createdAt: "2026-10-18T09:00:00Z", closedAt: null,
};
const quoted: PurchaseConversation = {
  ...room, hasQuote: true,
  quotePreview: {
    destination: { recipientName: "QA", phone: "0900000000", serviceAreaCode: "HCM-DEMO-v1", localityCode: "DEMO-A", detail: "Fixture" },
    shippingFee: 20000, expiresAt: "2026-10-18T11:00:00Z",
  },
};
describe("purchase conversation next steps", () => {
  it("lets a buyer send their address and tells a seller what to wait for", () => {
    expect(purchaseChatGuidance(room, "buyer", true, now).action).toBe("address");
    expect(purchaseChatGuidance(room, "seller", true, now).action).toBeUndefined();
    expect(purchaseChatGuidance(room, "seller", true, now).description).toContain("người mua");
  });
  it("offers order creation only to the seller with a usable quote", () => {
    expect(purchaseChatGuidance(quoted, "seller", true, now).action).toBe("create-order");
    expect(purchaseChatGuidance(quoted, "buyer", true, now).action).toBe("address");
    expect(purchaseChatGuidance(quoted, "buyer", true, now).title).toBe("Đã gửi thông tin nhận sách");
  });
  it("requires a fresh quote at its expiry boundary or when its address snapshot disappeared", () => {
    const expiresAt = Date.parse(quoted.quotePreview!.expiresAt);
    expect(purchaseChatGuidance(quoted, "seller", true, expiresAt).action).toBeUndefined();
    expect(purchaseChatGuidance({ ...quoted, quotePreview: null }, "seller", true, now).action).toBeUndefined();
    expect(purchaseChatGuidance(quoted, "buyer", true, expiresAt).action).toBe("address");
  });
  it("does not offer a checkout before fulfillment has loaded or when missing", () => {
    expect(purchaseChatGuidance(room, "buyer", undefined, now).action).toBeUndefined();
    expect(purchaseChatGuidance(room, "buyer", false, now).action).toBeUndefined();
  });
  it.each(["buyer", "seller"])("hands an OrderCreated conversation to its order for %s", (user) => {
    const result = purchaseChatGuidance({ ...quoted, status: "OrderCreated", orderId: "order" }, user, true, now);
    expect(result.phase).toBe(2);
    expect(result.action).toBe("order");
  });
  it.each(["Cancelled", "Expired"] as const)("never offers a transaction action for %s", (status) => {
    expect(purchaseChatGuidance({ ...quoted, status }, "seller", true, now).action).toBeUndefined();
  });
  it("does not offer order creation after the conversation itself expires", () => {
    expect(purchaseChatGuidance({ ...quoted, expiresAt: new Date(now).toISOString() }, "seller", true, now).action).toBeUndefined();
  });
});
