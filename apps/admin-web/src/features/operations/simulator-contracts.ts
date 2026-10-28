import { z } from "zod";
import type { components } from "@used-books/api-contract";
import type { Outcome } from "./action-panel";
type Schema = components["schemas"];
const uuid = z.uuid(), time = z.iso.datetime({ offset: true });
export type SimulatorKind = "topups" | "pickups" | "deliveries";
export type SimulatorValues = Record<string, string>;
export const simulatedTopupEvent = z.object({ eventId: uuid, intentId: uuid, recipientId: uuid, amount: z.number().int().min(1).max(10000000), currency: z.string().regex(/^[A-Z]{3}$/), outcome: z.enum(["Processing", "Succeeded", "Failed"]), occurredAt: time }).strict() satisfies z.ZodType<Schema["SimulatedTopupEvent"]>;
export const simulatedPickupEvent = z.object({ eventId: uuid, shipmentId: uuid, orderId: uuid, carrier: z.literal("LatLaiSimulator"), trackingCode: z.string().regex(/^LL-[A-Z0-9]{8,32}$/), type: z.literal("PickedUp"), occurredAt: time }).strict() satisfies z.ZodType<Schema["SimulatedPickupEvent"]>;
export const simulatedDeliveryEvent = simulatedPickupEvent.omit({ type: true }) satisfies z.ZodType<Schema["SimulatedDeliveryEvent"]>;
export const simulatorPaths = { topups: "/operations/simulator/topup-events", pickups: "/operations/simulator/pickup-events", deliveries: "/operations/simulator/delivery-events" } as const;

export function simulatorCommand(kind: SimulatorKind, values: SimulatorValues, actorId: string) {
  const id = (name: string) => (values[name] || "").trim().toLowerCase();
  const common = { eventId: id("eventId"), occurredAt: (values.occurredAt || "").trim() };
  const raw = kind === "topups" ? {
    ...common, intentId: id("intentId"), recipientId: id("recipientId"), amount: Number(values.amount), currency: (values.currency || "").trim().toUpperCase(), outcome: values.outcome,
  } : { ...common, shipmentId: id("shipmentId"), orderId: id("orderId"), carrier: "LatLaiSimulator", trackingCode: (values.trackingCode || "").trim(), ...(kind === "pickups" ? { type: "PickedUp" } : {}) };
  const body = (kind === "topups" ? simulatedTopupEvent : kind === "pickups" ? simulatedPickupEvent : simulatedDeliveryEvent).parse(raw);
  if ("recipientId" in body && body.recipientId === actorId.toLowerCase())
    throw new z.ZodError([{ code: "custom", path: ["recipientId"], message: "Người vận hành phải độc lập với người nhận tiền." }]);
  return { path: simulatorPaths[kind], key: body.eventId, body };
}

export const walletEventReceipt = z.object({
  id: uuid, entityType: z.literal("TopupIntent"), entityId: uuid, version: z.number().int().positive(),
  state: z.enum(["Pending", "Processing", "Succeeded", "Failed", "Cancelled", "ReviewRequired"]), credited: z.boolean(), journalId: uuid.nullable(), serverTime: time,
  demoOnly: z.literal(true), label: z.literal("Mô phỏng đồ án"), currency: z.literal("VND"), paymentUrl: z.url().optional(), expiresAt: time.optional(),
}) satisfies z.ZodType<Schema["WalletCommandReceipt"]>;
export const pickupEventReceipt = z.object({
  id: uuid, entityType: z.literal("CarrierEvent"), entityId: uuid, shipmentId: uuid, orderId: uuid, contextId: uuid,
  version: z.number().int().min(1).max(128), state: z.literal("Recorded"), outcome: z.enum(["Applied", "Duplicate", "ReviewRequired"]),
  orderVersion: z.number().int().min(3).max(5), orderState: z.enum(["Preparing", "InTransit", "ResolutionPending"]), serverTime: time,
}) satisfies z.ZodType<Schema["CarrierEventReceipt"]>;
export const deliveryEventReceipt = z.object({
  id: uuid, entityType: z.literal("Order"), entityId: uuid, contextId: uuid, version: z.number().int().positive(),
  state: z.enum(["AwaitingPayment", "PendingSellerConfirmation", "SettlementPending", "Cancelled", "PaymentExpired", "Preparing", "ResolutionPending", "InTransit", "Inspection", "Completed"]),
  serverTime: time, paymentDeadline: time, affectedListings: z.array(z.object({ id: uuid, version: z.number().int().positive() })).max(1),
}) satisfies z.ZodType<Schema["TransactionCommandReceipt"]>;
export const simulatorReceipts = { topups: walletEventReceipt, pickups: pickupEventReceipt, deliveries: deliveryEventReceipt } as const;
export type SimulatorReceipt = z.infer<typeof walletEventReceipt> | z.infer<typeof pickupEventReceipt> | z.infer<typeof deliveryEventReceipt>;
const states: Record<string, string> = { Pending: "chờ xử lý", Processing: "đang xử lý", Succeeded: "thành công", Failed: "không thành công", Cancelled: "đã hủy", ReviewRequired: "cần đối chiếu", Preparing: "đang chuẩn bị", InTransit: "đang vận chuyển", ResolutionPending: "chờ xử lý", Inspection: "đang kiểm tra", Completed: "hoàn tất" };
export function simulatorOutcome(receipt: SimulatorReceipt): Outcome {
  if (receipt.entityType === "TopupIntent") return {
    tone: receipt.state === "ReviewRequired" ? "warning" : receipt.credited ? "success" : "info",
    text: `Yêu cầu nạp ${receipt.entityId}: ${states[receipt.state]}. ${receipt.credited ? "Máy chủ xác nhận yêu cầu đã được ghi sổ." : "Máy chủ chưa ghi nhận bút toán nạp cho yêu cầu này."}`, close: true,
  };
  if (receipt.entityType === "CarrierEvent") return {
    tone: receipt.outcome === "ReviewRequired" ? "warning" : "success",
    text: `Sự kiện lấy hàng ${receipt.outcome === "ReviewRequired" ? "cần đối chiếu" : receipt.outcome === "Duplicate" ? "đã tồn tại, không áp dụng thêm" : "đã được áp dụng"}. Đơn ${receipt.orderId}: ${states[receipt.orderState]}.`, close: true,
  };
  return { tone: receipt.state === "ResolutionPending" ? "warning" : "info", text: `Máy chủ đã ghi nhận sự kiện giao hàng. Đơn ${receipt.entityId}: ${states[receipt.state] || receipt.state}.`, close: true };
}
