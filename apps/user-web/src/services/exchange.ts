import { z } from "zod";
import { ApiError } from "@used-books/session-client";
import { session } from "./api";
import type {
  ExchangeTab,
  ExchangeItem,
  ExchangeStatus,
} from "../lib/mock/exchangeMine";
import {
  getPublicListing,
  getPublicPhoto,
  type PublicListing,
} from "./public-listings";

const date = z.string().nullable().optional();
export const exchangeSchema = z.object({
  id: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  initiatorListingId: z.string().uuid(),
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
  initiatorFundedAt: date,
  recipientFundedAt: date,
  initiatorShippedAt: date,
  recipientShippedAt: date,
  initiatorReceivedAt: date,
  recipientReceivedAt: date,
  rejectionReason: z.string().nullable().optional(),
  cancelReason: z
    .enum([
      "CancelledByUser",
      "FundingExpired",
      "ProposalExpired",
      "ListingUnavailable",
    ])
    .nullable()
    .optional(),
  cancelledBy: z
    .enum(["Initiator", "Recipient", "System"])
    .nullable()
    .optional(),
  cancelledAt: date,
});
export const exchangePageSchema = z.object({
  items: z.array(exchangeSchema),
  nextCursor: z.string().nullable(),
});
export type Exchange = z.infer<typeof exchangeSchema>;

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
    case "Delivered":
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
        ex.cancelReason === "ProposalExpired"
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
  return session.request(`/exchanges/${id}`, exchangeSchema);
}

// Accepted listings can cease being public. Never substitute demo books.
export async function exchangeListing(
  id: string,
): Promise<PublicListing | null> {
  try {
    return await getPublicListing(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export async function exchangeBook(id: string, listing: PublicListing | null) {
  let coverUrl: string | undefined;
  if (listing?.photos[0]) {
    try {
      coverUrl = (await getPublicPhoto(id, listing.photos[0].id)).url;
    } catch {
      /* Cover failure does not change transaction facts. */
    }
  }
  return {
    id,
    title: listing?.book.title ?? "Bài đăng hiện không công khai",
    author: listing?.book.authors.join(", ") ?? "Chưa có thông tin",
    coverUrl,
    condition: listing?.condition ?? "Chưa có thông tin",
  };
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
      const [init, rec] = await Promise.all([
        exchangeListing(ex.initiatorListingId),
        exchangeListing(ex.recipientListingId),
      ]);
      const [give, receive] = await Promise.all([
        exchangeBook(
          initiator ? ex.initiatorListingId : ex.recipientListingId,
          initiator ? init : rec,
        ),
        exchangeBook(
          initiator ? ex.recipientListingId : ex.initiatorListingId,
          initiator ? rec : init,
        ),
      ]);
      return {
        id: ex.id,
        createdAt: ex.createdAt,
        tab,
        status: mapExchangeStatus(ex, actor),
        partner: {
          id: initiator ? ex.recipientId : ex.initiatorId,
          username:
            (initiator ? rec : init)?.seller.displayName ?? "Đối tác trao đổi",
        },
        receiveBooks: [receive],
        giveBooks: [give],
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

// Retain unresolved intent across dialog reopening/refresh, in memory only.
const pending = new Map<string, { key: string; body: string; path: string }>();
export function pendingProposal():
  { initiatorListingId: string; recipientListingId: string } | undefined {
  const state = session.getSnapshot();
  if (state.status !== "authenticated") return undefined;
  const intent = pending.get(`${state.user.id}:/exchanges`);
  return intent ? JSON.parse(intent.body) : undefined;
}
export function pendingExchange(id: string) {
  const actor = session.getSnapshot();
  if (actor.status !== "authenticated") return undefined;
  return [...pending.entries()].find(([slot]) =>
    slot.startsWith(`${actor.user.id}:/exchanges/${id}/`),
  )?.[1];
}
export async function retryExchange(id: string) {
  const intent = pendingExchange(id);
  if (!intent) return getExchange(id);
  return exchangeCommand(intent.path, JSON.parse(intent.body));
}
let identity: string | undefined;
session.subscribe(() => {
  const state = session.getSnapshot();
  const next = state.status === "authenticated" ? state.user.id : undefined;
  if (next !== identity) pending.clear();
  identity = next;
});
export async function exchangeCommand(path: string, body: object) {
  const id = path.match(/^\/exchanges\/([^/]+)\//)?.[1];
  const previous = id ? pendingExchange(id) : undefined;
  if (previous && previous.path !== path)
    throw new Error("Hãy thử lại thao tác chưa rõ kết quả trước.");
  const slot = `${exchangeActor().id}:${path}`;
  const intent = pending.get(slot) ?? {
    key: crypto.randomUUID(),
    body: JSON.stringify(body),
    path,
  };
  pending.set(slot, intent);
  try {
    const result = await session.request(intent.path, exchangeSchema, {
      method: "POST",
      headers: { "Idempotency-Key": intent.key },
      body: intent.body,
    });
    if (id && result.id !== id)
      throw new Error("Unconfirmed exchange response");
    pending.delete(slot);
    return result;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.code !== "IdempotencyConflict"
    )
      pending.delete(slot);
    throw error;
  }
}
export function exchangeError(error: unknown) {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
    return "Chưa xác nhận được kết quả. Thử lại sẽ gửi cùng thao tác trước, không tạo thêm giao dịch.";
  if (error.status === 401)
    return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
  if (error.status === 404 || error.status === 403)
    return "Không mở được trao đổi này hoặc bạn không có quyền thực hiện.";
  if (error.code === "InsufficientFunds")
    return "Ví mô phỏng chưa đủ tiền. Kiểm tra số dư rồi thử lại.";
  if (error.status === 409)
    return "Trao đổi đã thay đổi hoặc không còn đủ điều kiện. Tải lại trạng thái trước khi tiếp tục.";
  return "Không thực hiện được thao tác. Kiểm tra thông tin rồi thử lại.";
}
