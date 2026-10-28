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
    ])
    .nullable()
    .optional(),
  cancelledBy: z
    .enum(["Initiator", "Recipient", "System"])
    .nullable()
    .optional(),
  cancelledAt: date,
  lastProposedById: z.string().uuid().nullable().optional(),
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
  return session.request(`/exchanges/${id}`, exchangeSchema);
}

export async function exchangeListing(
  id: string,
): Promise<PublicListing | null> {
  try {
    const listing = await getPublicListing(id);
    if (listing) {
      try {
        localStorage.setItem(`latlai_cached_listing_${id}`, JSON.stringify(listing));
      } catch {}
    }
    return listing;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      try {
        const raw = localStorage.getItem(`latlai_cached_listing_${id}`);
        if (raw) return JSON.parse(raw) as PublicListing;
      } catch {}
      return null;
    }
    throw error;
  }
}
export async function exchangeBook(
  id: string,
  listing: PublicListing | null,
  fallbackPrice?: number,
) {
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
    price: listing?.exchangeValue ?? listing?.salePrice ?? fallbackPrice ?? 0,
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
      const initiatorIds =
        ex.initiatorListingIds && ex.initiatorListingIds.length > 0
          ? ex.initiatorListingIds
          : [ex.initiatorListingId];
      const recipientIds = [ex.recipientListingId];

      const [initListings, recListings] = await Promise.all([
        Promise.all(initiatorIds.map(exchangeListing)),
        Promise.all(recipientIds.map(exchangeListing)),
      ]);
      const [give, receive] = await Promise.all([
        Promise.all(
          (initiator ? initiatorIds : recipientIds).map((bookId, idx) =>
            exchangeBook(
              bookId,
              initiator ? initListings[idx] : recListings[idx],
              initiator && initiatorIds.length === 1 ? ex.recipientDeposit : undefined,
            ),
          ),
        ),
        Promise.all(
          (initiator ? recipientIds : initiatorIds).map((bookId, idx) =>
            exchangeBook(
              bookId,
              initiator ? recListings[idx] : initListings[idx],
              initiator
                ? ex.initiatorDeposit
                : (!initiator && initiatorIds.length === 1 ? ex.recipientDeposit : undefined),
            ),
          ),
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
            (initiator ? recListings[0] : initListings[0])?.seller
              .displayName ?? "Đối tác trao đổi",
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

// Retain unresolved intent across dialog reopening/refresh, in memory only.
const pending = new Map<string, { key: string; body: string; path: string }>();
export function pendingProposal():
  | {
      initiatorListingId?: string;
      initiatorListingIds?: string[];
      recipientListingId: string;
      deliveryAddressId?: string;
    }
  | undefined {
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
