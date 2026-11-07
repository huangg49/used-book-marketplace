import { describe, expect, it } from "vitest";
import { orderStage, exchangeStage } from "./transaction-stage";

describe("transaction phase copy", () => {
  it("distinguishes who must pay without changing capabilities", () => {
    const order = {
      state: "AwaitingPayment",
      role: "Buyer",
      canConfirmReceipt: false,
    } as const;
    expect(orderStage(order, false).title).toBe("Thanh toán đơn sách");
    expect(orderStage({ ...order, role: "Seller" }, false).title).toBe(
      "Chờ người mua thanh toán",
    );
    expect(order.canConfirmReceipt).toBe(false);
  });
  it("separates registered shipment from handover and inspection", () => {
    const order = {
      state: "Preparing",
      role: "Seller",
      canConfirmReceipt: false,
    } as const;
    expect(orderStage(order, false).title).toBe("Chuẩn bị và gửi sách");
    expect(orderStage(order, true).who).toContain("vẫn cần xác nhận bàn giao");
    expect(orderStage({ ...order, state: "Inspection" }, true).who).toContain(
      "Tiền tiếp tục được giữ",
    );
  });
  it("funded participant waits rather than receiving a second funding prompt", () => {
    expect(exchangeStage({ status: "FUNDING", viewerShipping: {} })).toBe(
      "Đặt cọc để tiếp tục trao đổi",
    );
    expect(
      exchangeStage({
        status: "FUNDING",
        viewerFundedAt: "2026-11-03T00:00:00Z",
        viewerShipping: {},
      }),
    ).toBe("Chờ đối tác đặt cọc");
  });
  it("expired/cancelled phase takes precedence over stale receipt fields", () => {
    const viewerShipping = {
      sentAt: "2026-11-03T00:00:00Z",
      receivedAt: "2026-11-03T01:00:00Z",
    };
    expect(exchangeStage({ status: "EXPIRED", viewerShipping })).toBe(
      "Đề nghị đã hết hạn",
    );
    expect(exchangeStage({ status: "CANCELLED", viewerShipping })).toBe(
      "Trao đổi đã hủy",
    );
  });
});
