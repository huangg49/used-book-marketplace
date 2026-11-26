import { describe, expect, it } from "vitest";
import { ApiError } from "../../core/api/session-client";
import {
  auctionDriverHref,
  driverMode,
  driverSimulatorEnabled,
  exchangeDriverHref,
  exchangeDriverOrderSchema,
  exchangeDriverStep,
  parseLeg,
  simulatorUnavailable,
  type ExchangeDriverOrder,
} from "./driver-model";

const order = (patch: Partial<ExchangeDriverOrder> = {}): ExchangeDriverOrder => ({
  exchangeId: "ex-1",
  trackingCode: "GHN123",
  sender: { name: "A", phone: "1", detail: "a" },
  receiver: { name: "B", phone: "2", detail: "b" },
  itemsSummary: "Sách",
  fee: 30000,
  ...patch,
});

describe("driverMode", () => {
  it("routes each simulator kind", () => {
    expect(driverMode({ kind: "direct", trackingCode: "X" })).toBe("direct");
    expect(driverMode({ kind: "auction", trackingCode: "LL-ABCDEFGH" })).toBe("auction");
    expect(driverMode({ kind: "exchange", trackingCode: "LL-ABCDEFGH" })).toBe("exchange");
    expect(driverMode({ exchangeId: "e", trackingCode: "LL-ABCDEFGH" })).toBe("exchange");
  });
  it("recognises an auction code without kind and defaults to exchange", () => {
    expect(driverMode({ trackingCode: "ll-abcdefgh12" })).toBe("auction");
    expect(driverMode({ trackingCode: "GHN123" })).toBe("exchange");
    expect(driverMode({})).toBe("exchange");
  });
  it("round-trips the hrefs the entry buttons push", () => {
    const ex = exchangeDriverHref("e", "recipient", "GHN1");
    expect(driverMode(ex.params)).toBe("exchange");
    expect(parseLeg(ex.params.leg)).toBe("recipient");
    expect(driverMode(auctionDriverHref("LL-ABCDEFGH").params)).toBe("auction");
    expect(parseLeg("other")).toBeUndefined();
  });
});

describe("driverSimulatorEnabled", () => {
  it("shows in dev or with the explicit demo flag only", () => {
    expect(driverSimulatorEnabled(true, undefined)).toBe(true);
    expect(driverSimulatorEnabled(false, "1")).toBe(true);
    expect(driverSimulatorEnabled(false, "true")).toBe(false);
    expect(driverSimulatorEnabled(false, undefined)).toBe(false);
  });
});

describe("exchangeDriverStep", () => {
  it("derives the parcel step like the web simulator", () => {
    expect(exchangeDriverStep(order())).toBe(0);
    expect(exchangeDriverStep(order({ shippedAt: "2026-11-26T00:00:00Z" }))).toBe(1);
    expect(exchangeDriverStep(order({ lastEvent: "Bưu tá đã nhận kiện sách từ A" }))).toBe(1);
    expect(exchangeDriverStep(order({ lastEvent: "Kiện GHN123 đã nhập kho trung chuyển TP.HCM" }))).toBe(2);
    expect(exchangeDriverStep(order({ lastEvent: "Bưu tá đang đi giao sách đến B" }))).toBe(3);
    expect(exchangeDriverStep(order({ lastEvent: "x", deliveredAt: "2026-11-26T00:00:00Z" }))).toBe(4);
  });
  it("accepts the server payload with both legs and ignores extra fields", () => {
    const parsed = exchangeDriverOrderSchema.parse({
      ...order(),
      carrierCode: "GHN",
      status: "InTransit",
      legs: [
        { leg: "initiator", label: "Kiện 1", trackingCode: "A", isDelivered: true, carrierCode: "GHN" },
        { leg: "recipient", label: "Kiện 2", trackingCode: "B", isDelivered: false },
      ],
    });
    expect(parsed.legs).toHaveLength(2);
  });
});

describe("simulatorUnavailable", () => {
  it("is true only for the server's local-demo 404", () => {
    expect(simulatorUnavailable(new ApiError(404, "NOT_FOUND", "Not found"))).toBe(true);
    expect(simulatorUnavailable(new ApiError(409, "CONFLICT", "Conflict"))).toBe(false);
    expect(simulatorUnavailable(new Error("offline"))).toBe(false);
  });
});
