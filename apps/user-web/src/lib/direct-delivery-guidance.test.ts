import { describe, expect, it } from "vitest";
import type { DirectOrder } from "../services/orders";
import { directDeliveryGuidance } from "./direct-delivery-guidance";

const id = "11111111-1111-4111-8111-111111111111";
const when = "2026-11-02T00:00:00.000Z";
const base = {
  state: "ResolutionPending",
  preparation: null,
  moneyHeld: 155000,
  deliveredAt: null,
  inspectionDeadline: null,
  carrierReview: null,
  deliveryReview: null,
} satisfies Pick<
  DirectOrder,
  | "state"
  | "preparation"
  | "moneyHeld"
  | "deliveredAt"
  | "inspectionDeadline"
  | "carrierReview"
  | "deliveryReview"
>;
describe("DirectDelivery guidance follows recorded facts", () => {
  it("retains a pickup-deadline review even without any carrier event", () => {
    const result = directDeliveryGuidance({
      ...base,
      preparation: {
        acceptedAt: when,
        pickupDeadline: when,
        pickupReview: {
          id,
          openedAt: when,
          reason: "PickupDeadlineExceeded",
          status: "Open",
        },
      },
    })!;
    expect(result.title).toBe("Đang xác minh bàn giao vận chuyển");
    expect(result.dateLabel).toBe("Hạn bàn giao đã ghi nhận");
    expect(result.date).toBe(when);
    expect(result.message).not.toMatch(/Sách đã được giao|72/);
  });
  it.each(["LatePickup", "ConflictingPickup"] as const)(
    "does not turn %s into confirmed delivery or an inspection promise",
    (reason) => {
      const result = directDeliveryGuidance({
        ...base,
        carrierReview: { id, openedAt: when, reason, status: "Open" },
      })!;
      expect(result.title).toBe("Đang xác minh bàn giao vận chuyển");
      expect(result.message).toContain(
        reason === "LatePickup" ? "quá hạn bàn giao" : "có mâu thuẫn",
      );
      expect(result.message).not.toMatch(/Sách đã được giao|72/);
      expect(result.message).toContain("hội thoại");
      expect(result.date).toBe(when);
    },
  );
  it.each([null, { id, submittedAt: when }])(
    "shows delivery deadline and only an existing Buyer report",
    (buyerReport) => {
      const result = directDeliveryGuidance({
        ...base,
        deliveryReview: {
          id,
          openedAt: when,
          deliveryDeadline: when,
          reason: "DeliveryDeadlineExceeded",
          status: "Open",
          buyerReport,
        },
      })!;
      expect(result.title).toBe("Đang xác minh giao hàng quá hạn");
      expect(result.date).toBe(when);
      expect(!!result.report).toBe(!!buyerReport);
      expect(result.message).toContain("chưa có xác nhận người mua nhận sách");
    },
  );
  it("uses a neutral fallback instead of inventing a review cause or hold", () => {
    const result = directDeliveryGuidance({ ...base, moneyHeld: 0 })!;
    expect(result.title).toBe("Đang xác minh giao nhận");
    expect(result.date).toBeNull();
    expect(result.message).not.toContain("vẫn đang được giữ");
  });
  it("preserves historical inspection deadlines without promising automatic settlement", () => {
    const result = directDeliveryGuidance({
      ...base,
      state: "Inspection",
      deliveredAt: when,
      inspectionDeadline: when,
    })!;
    expect(result.date).toBe(when);
    expect(result.message).toContain("chưa tự động giải ngân");
    expect(result.message).not.toContain("có 72 giờ");
    expect(directDeliveryGuidance({ ...base, state: "InTransit" })).toBeNull();
  });
});
