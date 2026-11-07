import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";

export const orderResponseStateSchema = z.object({
  id: z.uuid(),
  role: z.enum(["Buyer", "Seller"]),
  version: z.number().int().positive(),
  state: z.string(),
  sellerAcceptanceEnabled: z.boolean(),
  canReject: z.boolean(),
  sellerConfirmationDeadline: z.string().nullable(),
  serverTime: z.string(),
});
export const orderCommandReceiptSchema = z.object({
  id: z.uuid(),
  entityType: z.literal("Order"),
  entityId: z.uuid(),
  version: z.number().int().positive(),
  state: z.string(),
});
type Action = "accept" | "reject" | "cancel" | "pay" | "confirm-receipt";

export type BuyNowOrderInput = {
  quoteId: string;
  expectedQuoteVersion: number;
  expectedListingVersion: number;
  expectedListingRevisionId: string;
};
type CreateIntent = { key: string; body: BuyNowOrderInput };
type Intent = { action: Action; version: number; key: string };

function isDefiniteRejection(error: unknown) {
  // Auth, timeout and rate-limit responses cannot settle an earlier lost ACK.
  // Keep the original intent until its receipt can be recovered.
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 403, 408, 429].includes(error.status)
  );
}

const stores = new WeakMap<
  SessionClient,
  {
    owner: string | null;
    generation: number;
    intents: Map<string, Intent>;
    creates: Map<string, CreateIntent>;
    acknowledged: Map<string, string>;
  }
>();
function store(client: SessionClient) {
  let value = stores.get(client);
  if (!value) {
    const identity = () => {
      const s = client.getSnapshot();
      return s.status === "authenticated" ? s.user.id : null;
    };
    value = {
      owner: identity(),
      generation: 0,
      intents: new Map(),
      creates: new Map(),
      acknowledged: new Map(),
    };
    const current = value;
    client.subscribe(() => {
      const next = identity();
      if (current.owner !== next) {
        current.intents.clear();
        current.creates.clear();
        current.acknowledged.clear();
        current.owner = next;
        current.generation++;
      }
    });
    stores.set(client, value);
  }
  return value;
}
export function pendingOrderResponse(client: SessionClient, id: string) {
  return store(client).intents.get(id)?.action;
}

export function pendingBuyNowOrder(client: SessionClient, listingId: string) {
  return store(client).creates.has(listingId);
}
export function pendingBuyNowOrderInput(client: SessionClient, listingId: string) {
  const body = store(client).creates.get(listingId)?.body;
  return body ? { ...body } : undefined;
}

// Keep an acknowledged ID addressable if checkout closes before its GET finishes.
export function acknowledgedBuyNowOrder(
  client: SessionClient,
  listingId: string,
) {
  return store(client).acknowledged.get(listingId);
}
export function forgetBuyNowOrder(
  client: SessionClient,
  listingId: string,
  orderId: string,
) {
  const s = store(client);
  if (s.acknowledged.get(listingId) === orderId)
    s.acknowledged.delete(listingId);
}

// The quote/version tuple belongs to the original intent, including when a new
// quote is read after navigation. Only a definite rejection permits replacing it.
export async function sendBuyNowOrder(
  client: SessionClient,
  listingId: string,
  body: BuyNowOrderInput | null,
  keyFactory: () => string,
) {
  const s = store(client),
    generation = s.generation;
  if (!s.owner)
    throw new ApiError(401, "SESSION_EXPIRED", "Đăng nhập để tạo đơn.");
  const saved = s.creates.get(listingId);
  if (!saved && !body) throw new Error("Cần báo giá để tạo đơn mới.");
  const attempt = saved ?? { key: keyFactory(), body: { ...body! } };
  s.creates.set(listingId, attempt);
  try {
    const result = await client.request(
      "/orders/buy-now",
      orderCommandReceiptSchema,
      {
        method: "POST",
        headers: { "Idempotency-Key": attempt.key },
        body: JSON.stringify(attempt.body),
      },
    );
    if (s.generation !== generation)
      throw new ApiError(
        401,
        "SESSION_EXPIRED",
        "Phiên tài khoản đã thay đổi.",
      );
    if (s.creates.get(listingId) === attempt) {
      s.acknowledged.set(listingId, result.entityId);
      s.creates.delete(listingId);
    }
    return result;
  } catch (error) {
    if (
      s.generation === generation &&
      s.creates.get(listingId) === attempt &&
      isDefiniteRejection(error)
    )
      s.creates.delete(listingId);
    throw error;
  }
}
// One uncertain decision blocks its opposite even after navigation. The pinned
// version/body/key survive a lost ACK, but never survive a change of account.
export async function sendOrderResponse(
  client: SessionClient,
  id: string,
  action: Action,
  version: number,
  keyFactory: () => string,
) {
  const s = store(client),
    owner = s.owner,
    generation = s.generation;
  if (!owner)
    throw new ApiError(401, "SESSION_EXPIRED", "Đăng nhập để tiếp tục đơn.");
  const attempt = s.intents.get(id) ?? { action, version, key: keyFactory() };
  if (attempt.action !== action)
    throw new Error("Cần xác minh kết quả thao tác trước khi đổi quyết định.");
  s.intents.set(id, attempt);
  try {
    const result = await client.request(
      `/orders/${encodeURIComponent(id)}/${attempt.action}`,
      orderCommandReceiptSchema,
      {
        method: "POST",
        headers: { "Idempotency-Key": attempt.key },
        body: JSON.stringify({ expectedVersion: attempt.version }),
      },
    );
    if (s.generation !== generation)
      throw new ApiError(
        401,
        "SESSION_EXPIRED",
        "Phiên tài khoản đã thay đổi.",
      );
    if (s.intents.get(id) === attempt) s.intents.delete(id);
    return result;
  } catch (error) {
    if (
      s.generation === generation &&
      s.intents.get(id) === attempt &&
      isDefiniteRejection(error)
    )
      s.intents.delete(id);
    throw error;
  }
}
