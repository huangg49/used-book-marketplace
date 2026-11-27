import { describe, expect, it } from "vitest";
import type { PublicListing } from "../../services/public-listings";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import { listingPurchaseState } from "./listing-purchase-state";

const bookId = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const buyer = "33333333-3333-4333-8333-333333333333";
const stranger = "44444444-4444-4444-8444-444444444444";

function listing(overrides: {
  mode?: PublicListing["mode"];
  status?: PublicListing["purchaseAvailability"]["status"];
  bundle?: boolean;
} = {}) {
  return {
    id: bookId,
    mode: overrides.mode ?? "Both",
    bundle: overrides.bundle ? {} : null,
    seller: { id: seller, displayName: "Người bán" },
    purchaseAvailability: { status: overrides.status ?? "Available", expiresAt: null },
  } as unknown as PublicListing;
}

function conversation(status: PurchaseConversation["status"], id = "c-" + status) {
  return {
    id,
    listingId: bookId,
    status,
    buyer: { id: buyer, displayName: "Người mua" },
    seller: { id: seller, displayName: "Người bán" },
  } as unknown as PurchaseConversation;
}

describe("listingPurchaseState", () => {
  it("offers buying and exchanging to a visitor while the book is available", () => {
    const state = listingPurchaseState(listing(), undefined, undefined);
    expect(state).toMatchObject({
      held: false,
      statusTag: null,
      isOwner: false,
      canProposeExchange: true,
      title: "Chọn cách mua",
      chatLabel: "Mở chat với người bán",
    });
    expect(state.conversationToOpen).toBeUndefined();
  });

  it("names each hold and blocks new exchange offers from other members", () => {
    for (const [status, label] of [
      ["AwaitingPayment", "Chờ thanh toán"],
      ["InTransaction", "Đang giao dịch"],
      ["InNegotiation", "Đang giữ sách"],
    ] as const) {
      const state = listingPurchaseState(listing({ status }), [], stranger);
      expect(state).toMatchObject({ held: true, heldLabel: label, statusTag: label, title: label });
      expect(state.canProposeExchange).toBe(false);
    }
  });

  it("keeps exchange open during negotiation only for the member already chatting", () => {
    const state = listingPurchaseState(
      listing({ status: "InNegotiation" }),
      [conversation("Active")],
      buyer,
    );
    expect(state.canProposeExchange).toBe(true);
    expect(state.conversationToOpen?.id).toBe("c-Active");
  });

  it("points the buyer at their order and tells them the transaction is theirs", () => {
    const state = listingPurchaseState(
      listing({ status: "InTransaction" }),
      [conversation("Active"), conversation("OrderCreated")],
      buyer,
    );
    expect(state).toMatchObject({
      title: "Người bán đã tạo đơn cho bạn",
      chatLabel: "Xem đơn hàng của bạn",
      statusTag: "Đang giao dịch với bạn",
    });
    expect(state.conversationToOpen?.id).toBe("c-OrderCreated");
  });

  it("shows the seller their own order conversation", () => {
    const state = listingPurchaseState(
      listing({ status: "AwaitingPayment" }),
      [conversation("OrderCreated")],
      seller,
    );
    expect(state).toMatchObject({
      isOwner: true,
      title: "Bạn đã tạo đơn cho người mua",
      chatLabel: "Mở hội thoại giao dịch",
      canProposeExchange: false,
      statusTag: "Chờ thanh toán",
    });
  });

  it("ignores another member's order on a held book", () => {
    const state = listingPurchaseState(
      listing({ status: "InTransaction" }),
      [conversation("OrderCreated")],
      stranger,
    );
    expect(state.orderConversation).toBeUndefined();
    expect(state.title).toBe("Đang giao dịch");
  });

  it("gives each availability state its own colour tone", () => {
    expect(listingPurchaseState(listing(), [], stranger).tone).toBe("available");
    expect(listingPurchaseState(listing({ status: "AwaitingPayment" }), [], stranger).tone).toBe("payment");
    expect(listingPurchaseState(listing({ status: "InTransaction" }), [], stranger).tone).toBe("transaction");
    expect(listingPurchaseState(listing({ status: "InNegotiation" }), [], stranger).tone).toBe("holding");
    expect(
      listingPurchaseState(listing({ status: "InTransaction" }), [conversation("OrderCreated")], buyer).tone,
    ).toBe("yours");
  });

  it("does not offer exchange on sale-only listings or bundles", () => {
    expect(listingPurchaseState(listing({ mode: "Sale" }), [], stranger).canProposeExchange).toBe(false);
    expect(listingPurchaseState(listing({ bundle: true }), [], stranger).canProposeExchange).toBe(false);
  });

  it("tells the owner how orders start on an available listing", () => {
    const state = listingPurchaseState(listing(), [], seller);
    expect(state).toMatchObject({
      isOwner: true,
      title: "Đây là bài đăng của bạn",
      chatLabel: "Mở chat với người mua",
      canProposeExchange: false,
    });
  });
});
