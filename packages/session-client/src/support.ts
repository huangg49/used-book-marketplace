import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { ApiError, type SessionClient } from "./session-client";
import { transactionReviewSchema } from "./reviews";

export const supportKinds = {
  Feedback: "Góp ý",
  Bug: "Báo lỗi",
  Violation: "Báo cáo vi phạm",
  TransactionIssue: "Phản ánh giao dịch",
} as const;
export const supportStates = {
  Open: "Đã tiếp nhận",
  InReview: "Đang xem xét",
  AwaitingMember: "Chờ bạn bổ sung",
  Answered: "Đã phản hồi",
  Closed: "Đã đóng",
} as const;
export const supportTargets = {
  DirectOrder: "Đơn mua bán",
  Exchange: "Trao đổi sách",
  PointOrder: "Đơn thắng đấu giá",
  Auction: "Phiên đấu giá",
  Listing: "Bài đăng",
  Review: "Đánh giá",
  Member: "Thành viên",
} as const;
export function supportRelatedState(state: string) {
  const labels: Record<string, string> = {
    AwaitingPayment: "Chờ thanh toán",
    PendingSellerConfirmation: "Chờ người bán xác nhận",
    Funding: "Chờ đặt cọc",
    Preparing: "Đang chuẩn bị sách",
    InTransit: "Đang giao nhận",
    Delivered: "Đã nhận sách",
    Inspection: "Đang kiểm tra sách",
    SettlementPending: "Đang quyết toán",
    Completed: "Đã hoàn tất",
    ResolutionPending: "Chờ giải quyết tranh chấp",
    Cancelled: "Đã hủy",
    Rejected: "Đã từ chối",
    PaymentExpired: "Hết hạn thanh toán",
    Expired: "Đã hết hạn",
    Proposed: "Chờ phản hồi đề xuất",
    Pending: "Chờ phản hồi",
    // Auction states (ADR 0078 flags).
    Active: "Phiên đang mở",
    BuyNowPending: "Đã có người mua ngay",
    AwaitingWinnerPayment: "Chờ người thắng thanh toán",
    Sold: "Phiên đã bán",
    Unsold: "Phiên không bán được",
    OnHold: "Phiên tạm dừng để xem xét",
  };
  return labels[state] ?? "Xem tình trạng chi tiết tại giao dịch";
}
export const supportSummarySchema = z.object({
  id: z.uuid(),
  kind: z.enum(["Feedback", "Bug", "Violation", "TransactionIssue"]),
  title: z.string(),
  reporterId: z.uuid(),
  reporterName: z.string(),
  target: z
    .object({
      type: z.enum([
        "DirectOrder",
        "Exchange",
        "PointOrder",
        "Auction",
        "Listing",
        "Review",
        "Member",
      ]),
      id: z.uuid(),
    })
    .nullable(),
  assigneeId: z.uuid().nullable(),
  state: z.enum(["Open", "InReview", "AwaitingMember", "Answered", "Closed"]),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const supportPageSchema = z.object({
  items: z.array(supportSummarySchema),
  nextCursor: z.string().nullable(),
  serverTime: z.iso.datetime(),
});
export const supportTargetOptionSchema: z.ZodType<
  components["schemas"]["SupportTargetOption"]
> = z.object({
  target: supportSummarySchema.shape.target.unwrap(),
  label: z.string(),
  description: z.string().nullable(),
  partnerName: z.string().nullable(),
  createdAt: z.iso.datetime().nullable(),
  state: z.string().nullable(),
});
export const supportTargetOptionsPageSchema = z.object({
  items: z.array(supportTargetOptionSchema),
  nextCursor: z.string().nullable(),
  serverTime: z.iso.datetime(),
});
export type SupportTargetOption = z.infer<typeof supportTargetOptionSchema>;
export const supportDetailSchema = z.object({
  case: supportSummarySchema,
  messages: z.array(
    z.object({
      id: z.uuid(),
      authorId: z.uuid(),
      authorName: z.string(),
      role: z.enum(["Member", "Admin", "System"]),
      internal: z.boolean(),
      text: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
  canManage: z.boolean(),
  canReply: z.boolean(),
  relatedState: z.string().nullable(),
  relatedAuctionId: z.uuid().nullable(),
  review: transactionReviewSchema.nullable(),
  serverTime: z.iso.datetime(),
});
export const supportReceiptSchema: z.ZodType<
  components["schemas"]["SupportCaseReceipt"]
> = z.object({
  id: z.uuid(),
  entityType: z.literal("SupportCase"),
  entityId: z.uuid(),
  version: z.number().int().positive(),
  state: z.enum(["Open", "InReview", "AwaitingMember", "Answered", "Closed"]),
  serverTime: z.iso.datetime(),
});
export type SupportCase = z.infer<typeof supportSummarySchema>;
export type SupportDetail = z.infer<typeof supportDetailSchema>;
export type SupportPage = z.infer<typeof supportPageSchema>;
export type SupportDraft = {
  kind: SupportCase["kind"];
  title: string;
  description: string;
  targetType: NonNullable<SupportCase["target"]>["type"] | "";
  targetId: string;
};
type Intent = { path: string; body: string; key: string; generation: number };
type Store = {
  owner: string | undefined;
  generation: number;
  intents: Map<string, Intent>;
  flights: Map<string, Promise<components["schemas"]["SupportCaseReceipt"]>>;
  drafts: Map<string, SupportDraft>;
};
const stores = new WeakMap<SessionClient, Store>();
function store(client: SessionClient) {
  let s = stores.get(client);
  if (!s) {
    const snapshot = client.getSnapshot();
    s = {
      owner: snapshot.status === "authenticated" ? snapshot.user.id : undefined,
      generation: 0,
      intents: new Map(),
      flights: new Map(),
      drafts: new Map(),
    };
    const value = s;
    client.subscribe(() => {
      const next = client.getSnapshot();
      if (next.status === "loading" || next.status === "unavailable") return;
      const owner = next.status === "authenticated" ? next.user.id : undefined;
      if (owner !== value.owner) {
        value.owner = owner;
        value.generation++;
        value.intents.clear();
        value.flights.clear();
        value.drafts.clear();
      }
    });
    stores.set(client, s);
  }
  return s;
}
export function supportDraft(
  client: SessionClient,
  scope: string,
  value?: SupportDraft | null,
) {
  const s = store(client);
  if (value === null) s.drafts.delete(scope);
  else if (value) s.drafts.set(scope, value);
  return s.drafts.get(scope);
}
export const pendingSupportIntent = (client: SessionClient, scope: string) =>
  store(client).intents.has(scope);
export function pendingSupportCreateDraft(
  client: SessionClient,
): SupportDraft | undefined {
  const intent = store(client).intents.get("support:create");
  if (!intent || intent.path !== "/me/support-cases") return;
  const body = JSON.parse(
    intent.body,
  ) as components["schemas"]["CreateSupportCase"];
  return {
    kind: body.kind,
    title: body.title,
    description: body.description,
    targetType: body.target?.type ?? "",
    targetId: body.target?.id ?? "",
  };
}
export function supportError(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Chưa xác nhận được kết quả. Nội dung vẫn được giữ; thử lại yêu cầu đã gửi.";
}
export function sendSupportIntent(
  client: SessionClient,
  scope: string,
  path: string,
  body: unknown,
  keyFactory: () => string,
) {
  const s = store(client),
    generation = s.generation;
  if (!s.owner || client.getSnapshot().status !== "authenticated")
    return Promise.reject(
      new ApiError(
        401,
        "SESSION_EXPIRED",
        "Đăng nhập để tiếp tục yêu cầu hỗ trợ.",
      ),
    );
  const previous = s.flights.get(scope);
  if (previous) return previous;
  let intent = s.intents.get(scope);
  if (!intent) {
    intent = {
      path,
      body: JSON.stringify(body),
      key: keyFactory(),
      generation,
    };
    s.intents.set(scope, intent);
  }
  const pinned = intent;
  const run = (async () => {
    try {
      const result = await client.request(pinned.path, supportReceiptSchema, {
        method: "POST",
        headers: { "Idempotency-Key": pinned.key },
        body: pinned.body,
      });
      if (s.generation !== generation)
        throw new ApiError(
          401,
          "SESSION_CHANGED",
          "Phiên tài khoản đã thay đổi.",
        );
      const target = /\/support-cases\/([0-9a-f-]{36})\//.exec(
        pinned.path,
      )?.[1];
      if (target && result.entityId !== target)
        throw new Error("Unexpected support receipt");
      if (s.intents.get(scope) === pinned) s.intents.delete(scope);
      return result;
    } catch (error) {
      if (
        s.generation === generation &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        ![401, 403, 408, 429].includes(error.status)
      )
        s.intents.delete(scope);
      throw error;
    } finally {
      if (s.generation === generation) s.flights.delete(scope);
    }
  })();
  s.flights.set(scope, run);
  return run;
}

// ADR 0078: the auction flag. The seller and members who registered or bid send a
// support case about the auction to the Admin queue; it never changes the auction,
// the deposits or the holds by itself.
export const auctionFlagCategories = [
  {
    id: "SuspiciousBidding",
    label: "Nghi ngờ trả giá gian lận",
    kind: "Violation",
    hint: "Ví dụ: một tài khoản lạ liên tục đẩy giá, hoặc người bán tự trả giá cho phiên của mình.",
  },
  {
    id: "WrongDescription",
    label: "Sách hoặc mô tả không đúng",
    kind: "Violation",
    hint: "Ảnh, tình trạng hoặc thông tin sách khác với bản đã kiểm tra tại điểm.",
  },
  {
    id: "MoneyIssue",
    label: "Tiền cọc, khoản giữ hoặc thanh toán",
    kind: "TransactionIssue",
    hint: "Tiền chưa được hoàn, bị giữ sai số tiền hoặc thanh toán không được ghi nhận.",
  },
  {
    id: "AppError",
    label: "Lỗi khi trả giá hoặc hiển thị",
    kind: "Bug",
    hint: "Nút không hoạt động, giá hoặc thời gian hiển thị sai so với thực tế.",
  },
  {
    id: "Other",
    label: "Vấn đề khác",
    kind: "Feedback",
    hint: "Mô tả điều bạn gặp và điều bạn cần Admin hỗ trợ.",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  kind: SupportCase["kind"];
  hint: string;
}[];
export type AuctionFlagCategory = (typeof auctionFlagCategories)[number];
export const AUCTION_FLAG_MIN_TEXT = 10;
export const auctionFlagScope = (auctionId: string) =>
  `support:auction:${auctionId}`;
export const auctionFlagCasesPath = (auctionId: string) =>
  `/me/support-cases?${new URLSearchParams({ targetType: "Auction", targetId: auctionId, limit: "20" })}`;
/** The member's own case on this auction that is still open, if any. */
export const openAuctionFlag = (page: SupportPage | undefined) =>
  page?.items.find((item) => item.state !== "Closed") ?? null;
export function auctionFlagBody(
  category: AuctionFlagCategory,
  auction: { id: string; title: string },
  description: string,
): components["schemas"]["CreateSupportCase"] {
  return {
    kind: category.kind,
    title: `${category.label}: ${auction.title}`.slice(0, 160),
    description: description.trim(),
    target: { type: "Auction", id: auction.id },
  };
}
