import { z } from "zod";
import type { components } from "@used-books/api-contract";
type Schema = components["schemas"];
const uuid = z.uuid(),
  time = z.iso.datetime({ offset: true }),
  version = z.number().int().positive(),
  price = z.number().int(),
  step = z.union([z.literal(10000), z.literal(50000)]);

export const intakeStates = [
  "AwaitingDropoff",
  "Received",
  "Passed",
  "Auctioning",
  "ReclaimRequired",
  "Reclaimed",
  "Cancelled",
  "Sold",
] as const;
export const intake = z.object({
  id: uuid,
  contextId: uuid,
  listingId: uuid,
  listingRevisionId: uuid,
  title: z.string(),
  pointId: uuid,
  startPrice: price,
  step,
  buyNowPrice: price.nullable(),
  protectiveValue: price,
  state: z.enum(intakeStates),
  version,
  createdAt: time,
  dropoffDeadline: time,
  receivedAt: time.nullable(),
  shelfCode: z.string().nullable(),
  inspectedAt: time.nullable(),
  inspectionOutcome: z.enum(["Pass", "Fail"]).nullable(),
  inspectionNote: z.string().nullable(),
  auctionId: uuid.nullable(),
  reclaimReason: z
    .enum([
      "SellerCancelled",
      "InspectionFailed",
      "Unsold",
      "PaymentExpired",
      "AuctionCancelled",
      "OrderCancelled",
      "OrderReturned",
      "BookMisdescribed",
    ])
    .nullable(),
  closedAt: time.nullable(),
}) satisfies z.ZodType<Schema["AuctionIntake"]>;
export type Intake = z.infer<typeof intake>;
export const intakeList = z.object({
  items: z.array(intake),
}) satisfies z.ZodType<Schema["AuctionIntakeList"]>;

const pointOrderStates = [
  "AwaitingPayment",
  "Fulfilling",
  "ReadyForCollection",
  "Inspection",
  "ResolutionPending",
  "ReturnPending",
  "Completed",
  "Cancelled",
  "PaymentExpired",
] as const;
export const collectionItem = z.object({
  id: uuid,
  version,
  title: z.string(),
  state: z.enum(pointOrderStates),
  recipientName: z.string(),
  shelfCode: z.string().nullable(),
  collectionDeadline: time.nullable(),
  returnDeadline: time.nullable(),
}) satisfies z.ZodType<Schema["PointCollectionItem"]>;
export type CollectionItem = z.infer<typeof collectionItem>;
export const collectionQueue = z.object({
  items: z.array(collectionItem),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointCollectionQueue"]>;

export const resolutionItem = z.object({
  id: uuid,
  version,
  title: z.string(),
  pointName: z.string(),
  openReason: z.enum([
    "ReportRejected",
    "RecipientDecisionOverdue",
    "CollectionOverdue",
    "InspectionClaim",
    "ReturnOverdue",
  ]),
  note: z.string().nullable(),
  openedAt: time,
  buyerTotal: price,
}) satisfies z.ZodType<Schema["PointOrderResolutionItem"]>;
export type ResolutionItem = z.infer<typeof resolutionItem>;
export type Decision = Schema["ResolvePointOrder"]["decision"];
export type Fault = NonNullable<Schema["ResolvePointOrder"]["fault"]> | null;
// Mirrors the API's FR-H09 decision matrix (point-order-resolution.service.ts):
// a refund always names the fault; after the handover only dismiss or return.
// The API still validates every combination.
const ALLOWED: Record<
  ResolutionItem["openReason"],
  Partial<Record<Decision, Fault[]>>
> = {
  RecipientDecisionOverdue: { RefundBuyer: ["BuyerDefault", "NoFault"] },
  ReportRejected: {
    RefundBuyer: ["BookMisdescribed", "NoFault"],
    ResumeCollection: [null],
  },
  CollectionOverdue: {
    RefundBuyer: ["BuyerDefault", "NoFault"],
    ResumeCollection: [null],
  },
  InspectionClaim: { DismissClaim: [null], RequireReturn: [null] },
  ReturnOverdue: { DismissClaim: [null], RequireReturn: [null] },
};
export const decisionsFor = (reason: ResolutionItem["openReason"]) =>
  ALLOWED[reason];
export const resolutionQueue = z.object({
  items: z.array(resolutionItem),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointOrderResolutionQueue"]>;

export const operationsAuction = z.object({
  id: uuid,
  version,
  title: z.string(),
  state: z.enum(["Active", "OnHold"]),
  startPrice: price,
  step,
  currentPrice: price.nullable(),
  bidderCount: z.number().int().nonnegative(),
  startAt: time,
  endAt: time,
  pointName: z.string(),
}) satisfies z.ZodType<Schema["OperationsAuctionItem"]>;
export type OperationsAuction = z.infer<typeof operationsAuction>;
export const operationsAuctionList = z.object({
  items: z.array(operationsAuction),
  serverTime: time,
}) satisfies z.ZodType<Schema["OperationsAuctionList"]>;

export const commandReceipt = z.object({
  id: uuid,
  entityType: z.enum(["AuctionIntake", "Auction", "PointOrder"]),
  entityId: uuid,
  intakeId: uuid,
  auctionId: uuid.nullable(),
  orderId: uuid.nullable(),
  contextId: uuid,
  version,
  state: z.enum([
    ...intakeStates,
    "Active",
    "BuyNowPending",
    "AwaitingWinnerPayment",
    "Unsold",
    "OnHold",
    "PaymentExpired",
    "AwaitingPayment",
    "Fulfilling",
    "ReadyForCollection",
    "Inspection",
    "ResolutionPending",
    "ReturnPending",
    "Completed",
  ]),
  currentPrice: price.nullable(),
  minimumBid: price.nullable(),
  leading: z.boolean().nullable(),
  collectionOutcome: z
    .enum(["HandedOver", "WrongCode", "Expired", "RateLimited"])
    .nullable(),
  attemptsRemaining: z.number().int().min(0).max(5).nullable(),
  codeExpiresAt: time.nullable(),
  returnOutcome: z.enum(["Accepted", "Refused"]).nullable(),
  serverTime: time,
}) satisfies z.ZodType<Schema["AuctionCommandReceipt"]>;
export type CommandReceipt = z.infer<typeof commandReceipt>;

export const reclaimLabels: Record<
  NonNullable<Intake["reclaimReason"]>,
  string
> = {
  SellerCancelled: "Người bán rút sách",
  InspectionFailed: "Không đạt kiểm tra",
  Unsold: "Phiên kết thúc không có người mua",
  PaymentExpired: "Người thắng không thanh toán đúng hạn",
  AuctionCancelled: "Phiên bị hủy",
  OrderCancelled: "Đơn bị hủy",
  OrderReturned: "Người mua trả sách",
  BookMisdescribed: "Sách khác mô tả",
};
export const intakeLabels: Record<Intake["state"], string> = {
  AwaitingDropoff: "Chờ người bán mang sách tới",
  Received: "Đã nhận, chờ kiểm tra",
  Passed: "Đạt kiểm tra, chờ mở phiên",
  Auctioning: "Đang đấu giá",
  ReclaimRequired: "Chờ người bán nhận lại",
  Reclaimed: "Đã trả người bán",
  Cancelled: "Đã hủy",
  Sold: "Đã bán",
};
export const collectionLabels: Record<CollectionItem["state"], string> = {
  AwaitingPayment: "Chờ thanh toán",
  Fulfilling: "Chờ người nhận xem biên bản",
  ReadyForCollection: "Chờ người nhận đến lấy",
  Inspection: "Đã giao, trong hạn kiểm tra",
  ResolutionPending: "Chờ quản trị viên xử lý",
  ReturnPending: "Chờ người nhận mang trả",
  Completed: "Hoàn tất",
  Cancelled: "Đã hủy",
  PaymentExpired: "Quá hạn thanh toán",
};
export const resolutionLabels: Record<ResolutionItem["openReason"], string> = {
  ReportRejected: "Người nhận từ chối biên bản",
  RecipientDecisionOverdue: "Quá hạn xem biên bản",
  CollectionOverdue: "Quá hạn đến lấy sách",
  InspectionClaim: "Khiếu nại sau khi nhận",
  ReturnOverdue: "Quá hạn mang trả sách",
};

// N4-10/N4-11: points, assignments and their receipts (FR-H04).
const pointStatus = z.enum(["Active", "Paused", "Closed"]);
export const operationsPoint = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  displayAddress: z.string(),
  status: pointStatus,
  capacity: z.number().int().positive(),
  heldSlots: z.number().int().nonnegative(),
  version,
  updatedAt: time,
  assignments: z.array(
    z.object({
      id: uuid,
      userId: uuid,
      displayName: z.string(),
      validFrom: time,
    }),
  ),
}) satisfies z.ZodType<Schema["OperationsPoint"]>;
export const operationsPointList = z.object({
  items: z.array(operationsPoint),
  serverTime: time,
}) satisfies z.ZodType<Schema["OperationsPointList"]>;
export type OperationsPoint = z.infer<typeof operationsPoint>;
export const pointReceipt = z.object({
  id: uuid,
  entityType: z.enum(["HandoverPoint", "PointAssignment"]),
  entityId: uuid,
  pointId: uuid,
  version,
  state: z.string(),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointCommandReceipt"]>;
export const myPointAssignments = z.object({
  items: z.array(
    z.object({
      pointId: uuid,
      code: z.string(),
      name: z.string(),
      status: pointStatus,
      validFrom: time,
    }),
  ),
}) satisfies z.ZodType<Schema["MyPointAssignmentList"]>;
// The Admin user directory, narrowed to what the Staff picker shows.
export const staffPage = z.object({
  items: z.array(
    z.object({ id: uuid, displayName: z.string(), email: z.string() }),
  ),
});
export const pointStatusLabels: Record<OperationsPoint["status"], string> = {
  Active: "Đang mở",
  Paused: "Tạm dừng nhận booking mới",
  Closed: "Đã đóng",
};
