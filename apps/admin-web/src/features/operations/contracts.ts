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
export const resolutionQueue = z.object({
  items: z.array(resolutionItem),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointOrderResolutionQueue"]>;

// `book` is optional in the contract and not needed by the operations list.
export const auctionSummary = z.object({
  id: uuid,
  listingId: uuid,
  title: z.string(),
  state: z.enum([
    "Active",
    "BuyNowPending",
    "AwaitingWinnerPayment",
    "Sold",
    "Unsold",
    "OnHold",
    "Cancelled",
    "PaymentExpired",
  ]),
  startPrice: price,
  step,
  buyNowPrice: price.nullable(),
  currentPrice: price.nullable(),
  minimumBid: price.nullable(),
  bidderCount: z.number().int().nonnegative(),
  startAt: time,
  endAt: time,
  pointName: z.string(),
  demoOnly: z.literal(true),
}) satisfies z.ZodType<Schema["PublicAuctionSummary"]>;
export type AuctionSummary = z.infer<typeof auctionSummary>;
export const auctionList = z.object({
  items: z.array(auctionSummary),
  serverTime: time,
}) satisfies z.ZodType<Schema["PublicAuctionList"]>;

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
