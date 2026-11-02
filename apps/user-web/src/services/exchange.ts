import {
  acknowledgedExchange,
  acknowledgedExchangeProposal,
  exchangeCommandIdentity,
  pendingExchangeIntent,
  pendingExchangeProposal,
  readExchange,
  retryExchangeCommand,
  sendExchangeCommand,
  sendExchangeProposal,
  type ExchangeCommand,
} from "@used-books/session-client";
import { z } from "zod";
import {
  ApiError,
  exchangeAgreementSchema,
  type ExchangeBookSnapshot,
} from "@used-books/session-client";
import { session } from "./api";
import type {
  ExchangeTab,
  ExchangeItem,
  ExchangeStatus,
} from "../lib/mock/exchangeMine";

const date = z.string().nullable().optional();
export const exchangeSchema = z.object({
  agreement: exchangeAgreementSchema.nullable().optional(),
  id: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  initiatorListingId: z.string().uuid(),
  initiatorListingIds: z.array(z.string().uuid()).optional(),
  recipientListingId: z.string().uuid(),
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
  diffPayerId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fundingDeadline: date,
  proposalExpiresAt: date,
  shippingDeadline: date,
  initiatorFundedAt: date,
  recipientFundedAt: date,
  initiatorShippedAt: date,
  recipientShippedAt: date,
  initiatorReceivedAt: date,
  recipientReceivedAt: date,
  inspectionDeadline: date,
  initiatorInspectionDeadline: date,
  recipientInspectionDeadline: date,
  disputedAt: date,
  disputeReason: z.string().nullable().optional(),
  disputedBy: z.string().nullable().optional(),
  completedAt: date,
  initiatorCompletedAt: date,
  recipientCompletedAt: date,
  initiatorAddress: z
    .object({
      recipientName: z.string(),
      phone: z.string(),
      detail: z.string(),
      localityCode: z.string().nullable().optional(),
      serviceAreaCode: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  recipientAddress: z
    .object({
      recipientName: z.string(),
      phone: z.string(),
      detail: z.string(),
      localityCode: z.string().nullable().optional(),
      serviceAreaCode: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  initiatorShipment: z
    .object({
      method: z.enum(["carrier", "direct"]),
      carrierCode: z.string().nullable().optional(),
      carrierName: z.string().nullable().optional(),
      trackingCode: z.string().nullable().optional(),
      meetupLocation: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      shippedAt: date,
      lastEvent: z.string().nullable().optional(),
      lastEventAt: date,
    })
    .nullable()
    .optional(),
  recipientShipment: z
    .object({
      method: z.enum(["carrier", "direct"]),
      carrierCode: z.string().nullable().optional(),
      carrierName: z.string().nullable().optional(),
      trackingCode: z.string().nullable().optional(),
      meetupLocation: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      shippedAt: date,
      lastEvent: z.string().nullable().optional(),
      lastEventAt: date,
    })
    .nullable()
    .optional(),
  rejectionReason: z.string().nullable().optional(),
  cancelReason: z
    .enum([
      "CancelledByUser",
      "FundingExpired",
      "ProposalExpired",
      "ListingUnavailable",
      "ShippingExpired",
      "DisputeResolvedRefund",
      "MutualAgreement",
    ])
    .nullable()
    .optional(),
  cancelledBy: z
    .enum(["Initiator", "Recipient", "System", "Staff", "Both"])
    .nullable()
    .optional(),
  cancelledAt: date,
  cancellationRequestedBy: z
    .enum(["Initiator", "Recipient"])
    .nullable()
    .optional(),
  cancellationRequestedAt: date,
  resolutionDecision: z
    .enum(["RefundBoth", "CompleteExchange"])
    .nullable()
    .optional(),
  resolutionReason: z.string().nullable().optional(),
  resolvedBy: z.string().uuid().nullable().optional(),
  resolvedAt: date,
  lastProposedById: z.string().uuid().nullable().optional(),
});
export const exchangePageSchema = z.object({
  items: z.array(exchangeSchema),
  nextCursor: z.string().nullable(),
});
export type Exchange = z.infer<typeof exchangeSchema>;

export function formatCancelReason(reason?: string | null): string {
  switch (reason) {
    case "DisputeResolvedRefund":
      return "Phán quyết hoàn cọc từ Quản trị viên";
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
      return reason || "Giao dịch đã hủy";
  }
}

export function exchangeActor() {
  const state = session.getSnapshot();
  if (state.status !== "authenticated")
    throw new Error("Đăng nhập để xem trao đổi của bạn.");
  return state.user;
}
export function mapExchangeStatus(ex: Exchange, actor: string): ExchangeStatus {
  switch (ex.status) {
    case "Proposed":
      return "PENDING";
    case "AcceptedAwaitingFunding":
      return "FUNDING";
    case "Preparing":
      return "WAITING_YOU_SEND";
    case "InTransit":
      return (
        ex.initiatorId === actor
          ? ex.initiatorReceivedAt
          : ex.recipientReceivedAt
      )
        ? "DELIVERING"
        : "WAITING_YOU_CONFIRM";
    case "Delivered":
      if (ex.initiatorReceivedAt && ex.recipientReceivedAt) {
        return "INSPECTING";
      }
      return (
        ex.initiatorId === actor
          ? ex.initiatorReceivedAt
          : ex.recipientReceivedAt
      )
        ? "DELIVERING"
        : "WAITING_YOU_CONFIRM";
    case "Completed":
      return "COMPLETED";
    case "ResolutionPending":
      return "RESOLUTION_PENDING";
    case "Cancelled":
      if (ex.cancelReason === "CancelledByUser" && ex.rejectionReason)
        return "REJECTED";
      if (
        ex.cancelReason === "FundingExpired" ||
        ex.cancelReason === "ProposalExpired" ||
        ex.cancelReason === "ShippingExpired"
      )
        return "EXPIRED";
      return "CANCELLED";
  }
}
export function exchangeTab(ex: Exchange, actor: string): ExchangeTab {
  if (ex.status === "Proposed")
    return ex.initiatorId === actor ? "sent" : "received";
  return ex.status === "Completed" || ex.status === "Cancelled"
    ? "done"
    : "active";
}
export function getExchanges() {
  return session.request("/exchanges", exchangePageSchema);
}
export function getExchange(id: string) {
  return readExchange(session, id, exchangeSchema);
}
export function exchangeAcknowledged(id: string) {
  return acknowledgedExchange(session, id, exchangeSchema);
}
export function createdExchange(listingId: string) {
  return acknowledgedExchangeProposal(session, listingId);
}
export function exchangeIdentity() {
  return exchangeCommandIdentity(session);
}

export async function exchangeBook(
  id: string,
  fallbackPrice?: number,
  snapshot?: ExchangeBookSnapshot,
  exchangeId?: string,
) {
  if (snapshot) {
    let coverUrl: string | undefined;
    if (exchangeId && snapshot.mediaIds[0]) {
      try {
        coverUrl = (
          await session.request(
            `/exchanges/${exchangeId}/books/${id}/photos/${snapshot.mediaIds[0]}`,
            z.object({ url: z.string().url() }),
          )
        ).url;
      } catch {
        /* Photo failure does not replace frozen agreement facts. */
      }
    }
    return {
      id,
      title: snapshot.book.title,
      author: snapshot.book.authors.join(", "),
      condition: snapshot.condition,
      price: snapshot.exchangeValue,
      coverUrl,
      editionLabel: [
        snapshot.book.edition,
        snapshot.book.publicationYear,
        snapshot.book.isbn ? `ISBN ${snapshot.book.isbn}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      conditionDetails: [
        snapshot.description,
        snapshot.pages,
        snapshot.coverNote,
        snapshot.notes,
        snapshot.accessories,
        snapshot.hasMissingPages ? "Có thiếu trang" : "Không thiếu trang",
        snapshot.readable ? "Đọc được" : "Không đọc được",
      ]
        .filter(Boolean)
        .join(". "),
    };
  }
  return {
    id,
    title: "Hồ sơ cũ — thiếu bản chụp sách",
    author: "Chưa có thông tin",
    condition: "Chưa có thông tin",
    price: fallbackPrice,
  };
}

export async function exchangeBooks(exchange: Exchange, actorId: string) {
  const initiatorIds = exchange.initiatorListingIds?.length
    ? exchange.initiatorListingIds
    : [exchange.initiatorListingId];
  const books = async (ids: string[]) =>
    Promise.all(
      ids.map((id) =>
        exchangeBook(
          id,
          id === exchange.recipientListingId
            ? exchange.initiatorDeposit
            : initiatorIds.length === 1
              ? exchange.recipientDeposit
              : undefined,
          exchange.agreement?.initiatorBooks.find(
            (book) => book.listingId === id,
          ) ??
            (exchange.agreement?.recipientBook.listingId === id
              ? exchange.agreement.recipientBook
              : undefined),
          exchange.id,
        ),
      ),
    );
  const [initiatorBooks, recipientBooks] = await Promise.all([
    books(initiatorIds),
    books([exchange.recipientListingId]),
  ]);
  return exchange.initiatorId === actorId
    ? { giveBooks: initiatorBooks, receiveBooks: recipientBooks }
    : { giveBooks: recipientBooks, receiveBooks: initiatorBooks };
}

export async function getExchangeTransactions(
  tab: ExchangeTab,
  page: number,
): Promise<{ data: ExchangeItem[]; total: number }> {
  const actor = exchangeActor().id;
  const response = await getExchanges();
  const filtered = response.items.filter(
    (ex) => exchangeTab(ex, actor) === tab,
  );
  const data = await Promise.all(
    filtered.slice((page - 1) * 5, page * 5).map(async (ex) => {
      const initiator = ex.initiatorId === actor;
      const { giveBooks: give, receiveBooks: receive } = await exchangeBooks(
        ex,
        actor,
      );
      return {
        id: ex.id,
        createdAt: ex.createdAt,
        tab,
        status: mapExchangeStatus(ex, actor),
        partner: {
          id: initiator ? ex.recipientId : ex.initiatorId,
          username:
            (initiator
              ? ex.agreement?.recipientBook.ownerDisplayName
              : ex.agreement?.initiatorBooks[0]?.ownerDisplayName) ??
            "Đối tác trao đổi",
        },
        receiveBooks: receive,
        giveBooks: give,
        moneyCompensationType: ex.diffAmount
          ? ex.diffPayerId === actor
            ? ("user_pays" as const)
            : ("other_pays" as const)
          : ("none" as const),
        moneyAmount: ex.diffAmount || undefined,
      };
    }),
  );
  return { data, total: filtered.length };
}
export async function getExchangeCounts(): Promise<
  Record<ExchangeTab, number>
> {
  const actor = exchangeActor().id;
  const response = await getExchanges();
  const counts = { sent: 0, received: 0, active: 0, done: 0 };
  for (const ex of response.items) counts[exchangeTab(ex, actor)]++;
  return counts;
}

export function pendingProposal() {
  return pendingExchangeProposal(session) as
    | {
        initiatorListingId?: string;
        initiatorListingIds?: string[];
        recipientListingId: string;
        deliveryAddressId?: string;
        conversationId?: string;
        expectedConversationVersion?: number;
      }
    | undefined;
}
export function pendingExchange(id: string) {
  return pendingExchangeIntent(session, id);
}
export function retryExchange(id: string) {
  return retryExchangeCommand(
    session,
    id,
    () => crypto.randomUUID(),
    exchangeSchema,
  );
}
export function exchangeCommand(path: string, body: object) {
  if (path === "/exchanges")
    return sendExchangeProposal(
      session,
      body,
      () => crypto.randomUUID(),
      exchangeSchema,
    );
  const match =
    /^\/exchanges\/([^/]+)\/(accept|reject|counter|funding|cancel|ship|receive|complete|dispute)$/.exec(
      path,
    );
  if (!match) throw new Error("Thao tác trao đổi không hợp lệ.");
  return sendExchangeCommand(
    session,
    match[1],
    match[2] as ExchangeCommand,
    body,
    () => crypto.randomUUID(),
    exchangeSchema,
  );
}
export function exchangeError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
    return "Chưa xác nhận được kết quả. Thử lại sẽ gửi cùng thao tác trước, không tạo thêm giao dịch.";
  if (error.status === 429 || error.status === 408)
    return "Chưa xác nhận được kết quả. Chờ một lát rồi thử lại thao tác trước; nội dung và mã yêu cầu được giữ nguyên.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
  if (error.status === 404 || error.status === 403)
    return "Không mở được trao đổi này hoặc bạn không có quyền thực hiện.";
  if (error.code === "InsufficientFunds")
    return "Ví mô phỏng chưa đủ tiền. Kiểm tra số dư rồi thử lại.";
  if (
    error.message &&
    error.message !== "Yêu cầu chưa thực hiện được. Vui lòng thử lại."
  )
    return error.message;
  if (error.status === 409)
    return "Trao đổi đã thay đổi hoặc không còn đủ điều kiện. Tải lại trạng thái trước khi tiếp tục.";
  return "Không thực hiện được thao tác. Kiểm tra thông tin rồi thử lại.";
}
