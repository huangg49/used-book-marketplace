import { z } from "zod";
import { stitchTokens } from "../../core/ui/theme";

const uuid = z.string().uuid();
const dateIso = z.string().nullable().optional();

export const exchangeAddressSnapshot = z.object({
  recipientName: z.string(),
  phone: z.string(),
  detail: z.string(),
  localityCode: z.string().nullable().optional(),
  serviceAreaCode: z.string().nullable().optional(),
});

export const exchangeShipmentInfo = z.object({
  method: z.enum(["carrier", "direct"]),
  carrierCode: z.string().nullable().optional(),
  carrierName: z.string().nullable().optional(),
  trackingCode: z.string().nullable().optional(),
  meetupLocation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  shippedAt: dateIso,
});

export const exchangeSchema = z.object({
  id: uuid,
  initiatorId: uuid,
  recipientId: uuid,
  initiatorListingId: uuid.nullable().optional(),
  initiatorListingIds: z.array(uuid).optional(),
  recipientListingId: uuid,
  status: z.enum([
    "Proposed",
    "AcceptedAwaitingFunding",
    "Preparing",
    "InTransit",
    "Delivered",
    "Completed",
    "Cancelled",
    "ResolutionPending",
  ]),
  revision: z.number().int().min(1),
  initiatorDeposit: z.number().int().min(0),
  recipientDeposit: z.number().int().min(0),
  diffAmount: z.number().int().min(0),
  diffPayerId: uuid.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fundingDeadline: dateIso,
  shippingDeadline: dateIso,
  proposalExpiresAt: dateIso,
  initiatorFundedAt: dateIso,
  recipientFundedAt: dateIso,
  initiatorShippedAt: dateIso,
  recipientShippedAt: dateIso,
  initiatorReceivedAt: dateIso,
  recipientReceivedAt: dateIso,
  inspectionDeadline: dateIso,
  initiatorInspectionDeadline: dateIso,
  recipientInspectionDeadline: dateIso,
  disputedAt: dateIso,
  disputeReason: z.string().nullable().optional(),
  disputedBy: uuid.nullable().optional(),
  lastProposedById: uuid.nullable().optional(),
  completedAt: dateIso,
  initiatorCompletedAt: dateIso,
  recipientCompletedAt: dateIso,
  initiatorAddress: exchangeAddressSnapshot.nullable().optional(),
  recipientAddress: exchangeAddressSnapshot.nullable().optional(),
  initiatorShipment: exchangeShipmentInfo.nullable().optional(),
  recipientShipment: exchangeShipmentInfo.nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  cancelReason: z.string().nullable().optional(),
  cancelledBy: z.string().nullable().optional(),
  cancelledAt: dateIso,
  resolutionDecision: z.enum(["RefundBoth", "CompleteExchange"]).nullable().optional(),
  resolutionReason: z.string().nullable().optional(),
  resolvedBy: uuid.nullable().optional(),
  resolvedAt: dateIso,
  cancellationRequestedBy: z.enum(["Initiator", "Recipient"]).nullable().optional(),
  cancellationRequestedAt: dateIso,
});

export type Exchange = z.infer<typeof exchangeSchema>;
export type ExchangeStatus = Exchange["status"];

export const exchangePageSchema = z.object({
  items: z.array(exchangeSchema),
  nextCursor: z.string().nullable().optional(),
});

export const exchangeMessageSchema = z.object({
  id: z.string(),
  exchangeId: z.string(),
  senderId: z.string(),
  body: z.string(),
  sentAt: z.string(),
});

export type ExchangeMessage = z.infer<typeof exchangeMessageSchema>;

export const exchangeMessagePageSchema = z.object({
  items: z.array(exchangeMessageSchema),
});

export const exchangeReceiptSchema = z
  .object({
    id: uuid,
    entityType: z.string().optional(),
    entityId: uuid.optional(),
    version: z.number().int().optional(),
    serverTime: z.string().optional(),
  })
  .passthrough();

export const exchangeReviewItemSchema = z.object({
  id: uuid,
  exchangeId: uuid,
  authorId: uuid,
  authorName: z.string().optional(),
  targetUserId: uuid,
  bookRating: z.number().int().min(1).max(5),
  partnerRating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
  comment: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type ExchangeReviewItem = z.infer<typeof exchangeReviewItemSchema>;

export const exchangeReviewsResponseSchema = z.object({
  canReview: z.boolean(),
  deadline: z.string().nullable().optional(),
  myReview: exchangeReviewItemSchema.nullable().optional(),
  partnerReview: exchangeReviewItemSchema.nullable().optional(),
});

export type ExchangeReviewsResponse = z.infer<typeof exchangeReviewsResponseSchema>;

export const createExchangeReviewSchema = z.object({
  bookRating: z.number().int().min(1).max(5),
  partnerRating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
  comment: z.string().optional(),
});

export type CreateExchangeReview = z.infer<typeof createExchangeReviewSchema>;


export function formatCancelReason(reason?: string | null): string {
  switch (reason) {
    case "DisputeResolvedRefund":
      return "Phán quyết hoàn cọc từ Quản trị viên";
    case "MutualAgreement":
      return "Hai bên đồng thuận hủy trước khi gửi sách";
    case "FundingExpired":
      return "Hết hạn nạp cọc bảo chứng (24 giờ)";
    case "ProposalExpired":
      return "Hết hạn phản hồi đề xuất (72 giờ)";
    case "ShippingExpired":
      return "Hết hạn gửi sách (72 giờ)";
    case "CancelledByUser":
      return "Người dùng hủy giao dịch";
    case "ListingUnavailable":
      return "Sách không còn khả dụng";
    default:
      return reason || "Đã hủy";
  }
}

export function mapExchangeStatusInfo(
  status: ExchangeStatus,
  isInitiator: boolean,
): {
  label: string;
  badgeBg: string;
  badgeColor: string;
  stepIndex: number;
} {
  switch (status) {
    case "Proposed":
      return {
        label: isInitiator ? "Chờ đối tác phản hồi" : "Đề nghị mới chờ bạn duyệt",
        badgeBg: stitchTokens.tagExchangeBg,
        badgeColor: stitchTokens.tagExchangeText,
        stepIndex: 0,
      };
    case "AcceptedAwaitingFunding":
      return {
        label: "Đã đồng ý · Chờ đặt cọc bảo chứng",
        badgeBg: stitchTokens.amberBg,
        badgeColor: stitchTokens.goldBronze,
        stepIndex: 1,
      };
    case "Preparing":
      return {
        label: "Đã cọc · Chuẩn bị gửi sách",
        badgeBg: stitchTokens.likeNewGreenBg,
        badgeColor: stitchTokens.likeNewGreen,
        stepIndex: 2,
      };
    case "InTransit":
      return {
        label: "Đang giao vận chuyển",
        badgeBg: stitchTokens.amberBg,
        badgeColor: stitchTokens.orangeDeep,
        stepIndex: 3,
      };
    case "Delivered":
      return {
        label: "Đã giao · Đang đồng kiểm",
        badgeBg: stitchTokens.terracottaSoft,
        badgeColor: stitchTokens.wineDark,
        stepIndex: 4,
      };
    case "Completed":
      return {
        label: "Trao đổi hoàn tất",
        badgeBg: stitchTokens.likeNewGreenBg,
        badgeColor: stitchTokens.verifiedGreen,
        stepIndex: 5,
      };
    case "Cancelled":
      return {
        label: "Giao dịch đã hủy",
        badgeBg: stitchTokens.flashRedBg,
        badgeColor: stitchTokens.flashRed,
        stepIndex: -1,
      };
    case "ResolutionPending":
      return {
        label: "Đang xử lý khiếu nại",
        badgeBg: stitchTokens.flashRedBg,
        badgeColor: stitchTokens.crimson,
        stepIndex: -1,
      };
    default:
      return {
        label: status,
        badgeBg: stitchTokens.cardSurface,
        badgeColor: stitchTokens.darkWood,
        stepIndex: 0,
      };
  }
}
