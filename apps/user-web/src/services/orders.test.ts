import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
vi.mock("../lib/session", () => ({ session: { request: vi.fn() } }));
import { session } from "../lib/session";
import { getOrder } from "./orders";
const id = "11111111-1111-4111-8111-111111111111",
  when = "2026-11-02T00:00:00.000Z";
const contact = {
  recipientName: "Synthetic QA",
  phone: "0900123456",
  localityCode: "DEMO-A",
  detail: "Synthetic only",
};
const order = {
  id,
  role: "Buyer",
  version: 4,
  state: "ResolutionPending",
  paymentDeadline: when,
  paymentEnabled: false,
  amounts: { bookPrice: 125000, shippingFee: 30000, buyerTotal: 155000 },
  conversationId: null,
  serverTime: when,
  createdAt: when,
  paidAt: when,
  moneyHeld: 155000,
  canCancel: false,
  sellerAcceptanceEnabled: false,
  canReject: false,
  sellerConfirmationDeadline: null,
  shipmentRegistrationEnabled: false,
  preparation: null,
  ownAddress: contact,
  shippingAddress: null,
  item: {
    listingId: id,
    metadata: { title: "Synthetic QA" },
    condition: "Good",
    description: "",
    coverNote: "",
    pages: "",
  },
  deliveredAt: null,
  inspectionDeadline: null,
  carrierReview: { id, openedAt: when, reason: "LatePickup", status: "Open" },
  deliveryReview: null,
};
beforeEach(() => vi.resetAllMocks());
describe("private Order review projection", () => {
  it("retains actual review reasons and nullable delivery dates from the API", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(order),
    );
    const value = await getOrder(id);
    expect(value.carrierReview).toEqual(order.carrierReview);
    expect(value.deliveredAt).toBeNull();
    expect(value.inspectionDeadline).toBeNull();
    expect(session.request).toHaveBeenCalledWith(
      `/me/orders/${id}`,
      expect.anything(),
    );
  });
  it("retains an overdue delivery review and the report ACK without copying report text", async () => {
    const deliveryReview = {
      id,
      openedAt: when,
      deliveryDeadline: when,
      reason: "DeliveryDeadlineExceeded",
      status: "Open",
      buyerReport: { id, submittedAt: when, description: "Synthetic report" },
    };
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({
        ...order,
        carrierReview: null,
        deliveryReview,
      }),
    );
    const value = await getOrder(id);
    expect(value.deliveryReview?.deliveryDeadline).toBe(when);
    expect(value.deliveryReview?.buyerReport).toEqual({
      id,
      submittedAt: when,
    });
  });
  it("preserves a pickup-deadline review before any carrier evidence exists", async () => {
    const preparation = {
      acceptedAt: when,
      pickupDeadline: when,
      pickupReview: {
        id,
        openedAt: when,
        reason: "PickupDeadlineExceeded",
        status: "Open",
      },
    };
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({
        ...order,
        preparation,
        carrierReview: null,
      }),
    );
    expect((await getOrder(id)).preparation).toEqual(preparation);
  });
  it("rejects an unknown review reason rather than presenting a fabricated success", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({
        ...order,
        carrierReview: { ...order.carrierReview, reason: "Delivered" },
      }),
    );
    await expect(getOrder(id)).rejects.toThrow();
  });
});
