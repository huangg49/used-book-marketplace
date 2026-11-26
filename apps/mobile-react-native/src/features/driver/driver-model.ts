import { z } from "zod";
import { ApiError } from "../../core/api/session-client";

// One /driver route serves the three demo simulators, like user-web DriverPage.
export type DriverMode = "direct" | "exchange" | "auction";
export type ExchangeLeg = "initiator" | "recipient";

export interface DriverParams {
  kind?: string;
  trackingCode?: string;
  exchangeId?: string;
  leg?: string;
}

// Demo-only entry points. Dev builds show them; a hosted demo build opts in with
// EXPO_PUBLIC_DRIVER_SIMULATOR=1. The server still gates every simulator call.
export function driverSimulatorEnabled(
  dev: boolean = typeof __DEV__ !== "undefined" && __DEV__,
  flag: string | undefined = process.env.EXPO_PUBLIC_DRIVER_SIMULATOR,
) {
  return dev || flag === "1";
}

const AUCTION_CODE = /^LL-[A-Z0-9]{8,32}$/i;

export function driverMode(params: DriverParams): DriverMode {
  if (params.kind === "direct") return "direct";
  if (params.kind === "auction") return "auction";
  if (params.kind === "exchange" || params.exchangeId) return "exchange";
  return params.trackingCode && AUCTION_CODE.test(params.trackingCode)
    ? "auction"
    : "exchange";
}

export function parseLeg(value?: string): ExchangeLeg | undefined {
  return value === "initiator" || value === "recipient" ? value : undefined;
}

export function exchangeDriverHref(
  exchangeId: string,
  leg: ExchangeLeg,
  trackingCode: string,
) {
  return {
    pathname: "/driver" as const,
    params: { kind: "exchange", exchangeId, leg, trackingCode },
  };
}

export function auctionDriverHref(trackingCode: string) {
  return {
    pathname: "/driver" as const,
    params: { kind: "auction", trackingCode },
  };
}

// The carrier simulator answers 404 unless the API runs in development and the
// request comes from a local host (or DEMO_ALLOW_REMOTE_HOST=true).
export function simulatorUnavailable(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

const party = z.object({ name: z.string(), phone: z.string(), detail: z.string() });

export const exchangeDriverLegSchema = z.object({
  leg: z.enum(["initiator", "recipient"]),
  label: z.string(),
  trackingCode: z.string(),
  isDelivered: z.boolean(),
  shippedAt: z.string().nullish(),
  deliveredAt: z.string().nullish(),
});

export const exchangeDriverOrderSchema = z.object({
  exchangeId: z.string(),
  activeLeg: z.enum(["initiator", "recipient"]).optional(),
  trackingCode: z.string(),
  carrierName: z.string().nullish(),
  readyForPickup: z.boolean().optional(),
  bothDelivered: z.boolean().optional(),
  sender: party,
  receiver: party,
  itemsSummary: z.string(),
  fee: z.number(),
  shippedAt: z.string().nullish(),
  deliveredAt: z.string().nullish(),
  lastEvent: z.string().nullish(),
  legs: z.array(exchangeDriverLegSchema).optional(),
});
export type ExchangeDriverOrder = z.infer<typeof exchangeDriverOrderSchema>;

// 0 waiting pickup, 1 picked up, 2 at hub, 3 out for delivery, 4 delivered.
// Same derivation as the web simulator: delivered -> last carrier event -> shippedAt.
export function exchangeDriverStep(order: ExchangeDriverOrder): number {
  if (order.deliveredAt) return 4;
  const event = (order.lastEvent ?? "").toLowerCase();
  if (event.includes("đang đi giao") || event.includes("đang trên đường giao")) return 3;
  if (event.includes("nhập kho") || event.includes("kho tổng") || event.includes("trung chuyển")) return 2;
  if (event.includes("đã lấy sách") || event.includes("đã có mặt") || event.includes("đã nhận kiện")) return 1;
  return order.shippedAt ? 1 : 0;
}

export const EXCHANGE_DRIVER_STEPS = [
  {
    step: 1,
    status: "PICKING" as const,
    label: "Lấy kiện từ người gửi",
    event: (o: ExchangeDriverOrder) => `Bưu tá đã nhận kiện sách từ ${o.sender.name}`,
  },
  {
    step: 2,
    status: "IN_TRANSIT" as const,
    label: "Nhập kho trung chuyển",
    event: (o: ExchangeDriverOrder) => `Kiện ${o.trackingCode} đã nhập kho trung chuyển TP.HCM`,
  },
  {
    step: 3,
    status: "IN_TRANSIT" as const,
    label: "Bắt đầu đi giao",
    event: (o: ExchangeDriverOrder) => `Bưu tá đang đi giao sách đến ${o.receiver.name}`,
  },
  {
    step: 4,
    status: "DELIVERED" as const,
    label: "Giao thành công",
    event: (o: ExchangeDriverOrder) => `Giao kiện ${o.trackingCode} cho ${o.receiver.name} thành công`,
  },
] as const;
