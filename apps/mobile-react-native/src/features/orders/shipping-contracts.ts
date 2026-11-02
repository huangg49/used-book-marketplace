import { z } from "zod";

const inputMessages = {
  PendingShipment: "Cần xác minh vận đơn trước khi thêm ảnh.",
  PendingPhoto: "Cần xác minh ảnh đóng gói trước khi đăng ký vận đơn.",
  PhotoRequired: "Chọn ảnh đóng gói trước khi lưu.",
  InvalidPhoto: "Chọn ảnh JPG, PNG hoặc WebP, từ 1 byte đến 10 MB.",
  PhotoTooLarge: "Ảnh quá lớn. Chọn ảnh không quá 10 MB.",
  UnsupportedPhoto:
    "Chọn ảnh JPG, PNG hoặc WebP; xuất ảnh HEIC sang JPEG trước.",
  ShipmentRequired: "Nhập vận đơn trước khi đăng ký.",
  InvalidShipment:
    "Cần ảnh đã lưu và mã bắt đầu LL-, tiếp theo 8–32 chữ in hoa hoặc số.",
} as const;
// Only local, allowlisted copy may bypass the shared API error presenter.
export class ShippingInputError extends Error {
  constructor(code: keyof typeof inputMessages) {
    super(inputMessages[code]);
  }
}

export const packagingPage = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(["Pending", "Ready"]),
      createdAt: z.iso.datetime(),
    }),
  ),
  serverTime: z.iso.datetime(),
});
export const directShipment = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  carrier: z.literal("LatLaiSimulator"),
  trackingCode: z.string(),
  state: z.enum(["LabelCreated", "PickedUp"]),
  pickupConfirmed: z.boolean(),
  demoOnly: z.literal(true),
});
export const shippingReceipt = z.object({ entityId: z.uuid() });
export type PackagingInput = {
  expectedVersion: number;
  mimeType: string;
  sha256: string;
  bytes: Uint8Array<ArrayBuffer>;
};
export type ShipmentInput = {
  expectedOrderVersion: number;
  carrier: "LatLaiSimulator";
  trackingCode: string;
  packagingEvidenceIds: string[];
};
