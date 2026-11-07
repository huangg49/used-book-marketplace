import { describe, it, expect } from "vitest";
import { getNotificationMeta } from "../DashboardLiveAuctions";
import { notificationPath, type MemberNotification } from "../../../../services/notifications";

describe("DashboardLiveAuctions Notification Categorization", () => {
  it("correctly identifies and tags an Order notification (seller to ship)", () => {
    const notice: MemberNotification = {
      id: "1101d28c-80c3-4223-b289-e9446ba940be",
      kind: "OrderBuyNowPaid",
      title: "Sách đã có người mua — chuẩn bị gửi",
      body: "Đơn Mua ngay đã thanh toán. Hãy mở đơn và bàn giao sách trong 48 giờ.",
      targetType: "Order",
      targetId: "2201d28c-80c3-4223-b289-e9446ba940be",
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    const meta = getNotificationMeta(notice);
    expect(meta.category).toBe("order");
    expect(meta.label).toBe("Đơn bán");
    expect(meta.heroBannerTag).toBe("ĐƠN HÀNG");
    expect(meta.actionLabel).toBe("Mở chi tiết đơn hàng");
    expect(notificationPath(notice)).toBe(`/orders/${notice.targetId}`);
  });

  it("correctly identifies outbid auction notifications", () => {
    const notice: MemberNotification = {
      id: "1101d28c-80c3-4223-b289-e9446ba940be",
      kind: "AuctionOutbid",
      title: "Bạn đã bị trả giá cao hơn ở phiên Sách Cũ",
      body: "Một người mua khác vừa đặt mức giá cao hơn.",
      targetType: "Auction",
      targetId: "3301d28c-80c3-4223-b289-e9446ba940be",
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    const meta = getNotificationMeta(notice);
    expect(meta.category).toBe("auction");
    expect(meta.isOutbid).toBe(true);
    expect(meta.heroBannerTag).toBe("OUTBID");
    expect(meta.actionLabel).toBe("Mở phiên đấu giá ngay");
    expect(notificationPath(notice)).toBe(`/auctions/${notice.targetId}`);
  });

  it("correctly identifies exchange notifications", () => {
    const notice: MemberNotification = {
      id: "1101d28c-80c3-4223-b289-e9446ba940be",
      kind: "ExchangeAccepted",
      title: "Đề xuất trao đổi đã được chấp thuận",
      body: "Hai bên đã đồng ý trao đổi.",
      targetType: "Exchange",
      targetId: "4401d28c-80c3-4223-b289-e9446ba940be",
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    const meta = getNotificationMeta(notice);
    expect(meta.category).toBe("exchange");
    expect(meta.label).toBe("Trao đổi");
    expect(meta.heroBannerTag).toBe("TRAO ĐỔI");
    expect(meta.actionLabel).toBe("Xem chi tiết trao đổi");
    expect(notificationPath(notice)).toBe(`/exchange/${notice.targetId}`);
  });

  it("correctly identifies wallet withdrawal notifications", () => {
    const notice: MemberNotification = {
      id: "1101d28c-80c3-4223-b289-e9446ba940be",
      kind: "WithdrawalUpdated",
      title: "Yêu cầu rút tiền thành công",
      body: "Số tiền 500.000 đ đã được chuyển vào tài khoản.",
      targetType: "Withdrawal",
      targetId: "5501d28c-80c3-4223-b289-e9446ba940be",
      createdAt: new Date().toISOString(),
      readAt: null,
    };

    const meta = getNotificationMeta(notice);
    expect(meta.category).toBe("wallet");
    expect(meta.heroBannerTag).toBe("VÍ TIỀN");
    expect(notificationPath(notice)).toBe(`/wallet?withdrawal=${notice.targetId}`);
  });
});

