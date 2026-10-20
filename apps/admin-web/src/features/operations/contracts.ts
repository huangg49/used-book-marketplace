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
  "NeedsEvidence",
  "Auctioning",
  "ReclaimRequired",
  "Reclaimed",
  "Cancelled",
  "Sold",
] as const;
// N4-12 (FR-T01): the point inspection checklist.
const checklist = z.object({
  titleEditionMatches: z.boolean(),
  privateMarksMatch: z.boolean(),
  coverPagesMatch: z.boolean(),
  notesAccessoriesMatch: z.boolean(),
  suspectedCopy: z.boolean(),
}) satisfies z.ZodType<Schema["InspectionChecklist"]>;
export type Checklist = z.infer<typeof checklist>;
export const checklistLabels: Record<keyof Checklist, string> = {
  titleEditionMatches: "Đúng đầu sách và ấn bản",
  privateMarksMatch: "Dấu riêng khớp ảnh đã đăng",
  coverPagesMatch: "Bìa và trang khớp mô tả",
  notesAccessoriesMatch: "Ghi chú và phụ kiện khớp mô tả",
  suspectedCopy: "Có dấu hiệu nghi bản sao",
};
export const outcomeLabels = {
  Pass: "Đạt",
  Fail: "Không đạt",
  NeedsEvidence: "Cần bằng chứng",
} as const;
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
  inspectionOutcome: z.enum(["Pass", "Fail", "NeedsEvidence"]).nullable(),
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
  evidenceRequestedBy: uuid.nullable(),
  evidenceDeadline: time.nullable(),
  evidenceNote: z.string().nullable(),
  evidenceSubmittedAt: time.nullable(),
  reclaimRequiredAt: time.nullable(),
  inspectionDueAt: time.nullable(),
  reclaimDueAt: time.nullable(),
  reports: z.array(
    z.object({
      revision: z.number().int().positive(),
      outcome: z.enum(["Pass", "Fail", "NeedsEvidence"]),
      checklist: checklist.nullable(),
      note: z.string().nullable(),
      createdAt: time,
    }),
  ),
}) satisfies z.ZodType<Schema["AuctionIntake"]>;
export type Intake = z.infer<typeof intake>;
export const intakeList = z.object({
  items: z.array(intake),
}) satisfies z.ZodType<Schema["AuctionIntakeList"]>;

const pointOrderStates = [
  "AwaitingPayment",
  "Fulfilling",
  "ReadyForCollection",
  "InTransit",
  "Inspection",
  "ResolutionPending",
  "ReturnPending",
  "Completed",
  "Cancelled",
  "PaymentExpired",
] as const;
// ADR 0044: the label the point Staff hand to the simulated carrier.
const pointOrderDelivery = z.object({
  recipientName: z.string(),
  phone: z.string(),
  serviceAreaCode: z.string(),
  localityCode: z.string(),
  detail: z.string(),
  outboundFee: price,
  carrier: z.literal("LatLaiSimulator"),
  trackingCode: z.string().nullable(),
  dispatchedAt: time.nullable(),
  deliveryDeadline: time.nullable(),
  deliveredAt: time.nullable(),
});
export const collectionItem = z.object({
  id: uuid,
  version,
  title: z.string(),
  state: z.enum(pointOrderStates),
  recipientName: z.string(),
  fulfillmentMethod: z.enum(["SelfCollect", "CarrierOutbound"]),
  delivery: pointOrderDelivery.nullable(),
  shelfCode: z.string().nullable(),
  collectionDeadline: time.nullable(),
  returnDeadline: time.nullable(),
}) satisfies z.ZodType<Schema["PointCollectionItem"]>;
export type CollectionItem = z.infer<typeof collectionItem>;
export const collectionQueue = z.object({
  items: z.array(collectionItem),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointCollectionQueue"]>;

// ADR 0044: deliveries awaiting a simulated carrier outcome (no address).
export const simulatedDelivery = z.object({
  orderId: uuid,
  title: z.string(),
  pointName: z.string(),
  carrier: z.literal("LatLaiSimulator"),
  trackingCode: z.string(),
  dispatchedAt: time,
  deliveryDeadline: time,
}) satisfies z.ZodType<Schema["SimulatedPointDeliveryItem"]>;
export type SimulatedDelivery = z.infer<typeof simulatedDelivery>;
export const simulatedDeliveryQueue = z.object({
  items: z.array(simulatedDelivery),
  serverTime: time,
}) satisfies z.ZodType<Schema["SimulatedPointDeliveryQueue"]>;

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
    "DeliveryFailed",
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
  // ADR 0044: the carrier brings an undelivered book back to the point.
  DeliveryFailed: { RequireReturn: [null] },
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
    "InTransit",
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
  NeedsEvidence: "Chờ bằng chứng của người bán",
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
  InTransit: "Đang giao tận nơi",
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
  DeliveryFailed: "Giao tận nơi không thành công",
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
  entityType: z.enum(["HandoverPoint", "PointAssignment", "PointIncident"]),
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

// N4-13: incidents and the simulated fund (FR-T04, POL-42).
const incidentKinds = [
  "Lost",
  "Damaged",
  "ArrivalMismatch",
  "LateArrival",
  "EmergencyClose",
  "Other",
] as const;
const amount = z.number().int().nonnegative();
export const pointIncident = z.object({
  id: uuid,
  pointId: uuid,
  pointName: z.string(),
  intakeId: uuid.nullable(),
  title: z.string().nullable(),
  kind: z.enum(incidentKinds),
  description: z.string(),
  protectedValue: amount.nullable(),
  state: z.enum(["Open", "Decided", "Underfunded"]),
  openedBy: uuid,
  openedAt: time,
  decision: z.enum(["Compensate", "NoCompensation"]).nullable(),
  approvedAmount: amount.nullable(),
  fundedAmount: amount.nullable(),
  unfundedAmount: amount.nullable(),
  decidedAt: time.nullable(),
  decisionReason: z.string().nullable(),
  version,
}) satisfies z.ZodType<Schema["PointIncident"]>;
export type PointIncident = z.infer<typeof pointIncident>;
export const pointIncidentList = z.object({
  items: z.array(pointIncident),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointIncidentList"]>;
export const incidentFund = z.object({
  opening: amount,
  approved: amount,
  balance: amount,
  entries: z.array(
    z.object({
      sequence: z.number().int().positive(),
      type: z.enum(["Opening", "CompensationApproved"]),
      amount: z.number().int().positive(),
      incidentId: uuid.nullable(),
      balanceAfter: amount,
      createdAt: time,
    }),
  ),
  serverTime: time,
}) satisfies z.ZodType<Schema["IncidentFund"]>;
export const incidentKindLabels: Record<PointIncident["kind"], string> = {
  Lost: "Mất sách",
  Damaged: "Hư hỏng",
  ArrivalMismatch: "Sách đến không khớp",
  LateArrival: "Sách đến trễ hạn",
  EmergencyClose: "Đóng khẩn cấp",
  Other: "Khác",
};
export const incidentStateLabels: Record<PointIncident["state"], string> = {
  Open: "Chờ quyết định",
  Decided: "Đã quyết định",
  Underfunded: "Quỹ không đủ",
};

// N4-14: overdue point work for the Admin (POL-31, POL-09, POL-34).
export const pointEscalationList = z.object({
  items: z.array(
    z.object({
      intakeId: uuid,
      title: z.string(),
      pointId: uuid,
      pointName: z.string(),
      kind: z.enum([
        "InspectionOverdue",
        "EvidenceDecisionOverdue",
        "ReclaimOverdue",
        "ReclaimEscalated",
      ]),
      dueAt: time,
      state: z.enum(["Received", "NeedsEvidence", "ReclaimRequired"]),
    }),
  ),
  serverTime: time,
}) satisfies z.ZodType<Schema["PointEscalationList"]>;
export type PointEscalation = z.infer<
  typeof pointEscalationList
>["items"][number];
export const escalationLabels: Record<
  PointEscalation["kind"],
  [string, string]
> = {
  InspectionOverdue: [
    "Quá hạn kiểm tra (24 giờ)",
    "Nhắc nhân viên điểm kiểm tra. Sách không tự đạt.",
  ],
  EvidenceDecisionOverdue: [
    "Quá hạn quyết định bằng chứng",
    "Một nhân viên khác tại điểm cần quyết định. Không tự đạt.",
  ],
  ReclaimOverdue: [
    "Người bán quá hạn nhận lại (72 giờ)",
    "Liên hệ người bán. Sách vẫn được giữ, không tự tịch thu hay thanh lý.",
  ],
  ReclaimEscalated: [
    "Quá hạn nhận lại hơn 14 ngày",
    "Cần quản trị viên xử lý trực tiếp với người bán. Không tự tịch thu hay thanh lý.",
  ],
};
