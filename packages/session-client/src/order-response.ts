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
type Action = "accept" | "reject" | "cancel";
type Intent = { action: Action; version: number; key: string };
const stores = new WeakMap<
  SessionClient,
  { owner: string | null; generation: number; intents: Map<string, Intent> }
>();
function store(client: SessionClient) {
  let value = stores.get(client);
  if (!value) {
    const identity = () => {
      const s = client.getSnapshot();
      return s.status === "authenticated" ? s.user.id : null;
    };
    value = { owner: identity(), generation: 0, intents: new Map() };
    const current = value;
    client.subscribe(() => {
      const next = identity();
      if (current.owner !== next) {
        current.intents.clear();
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
    s.intents.delete(id);
    return result;
  } catch (error) {
    if (
      s.generation === generation &&
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500
    )
      s.intents.delete(id);
    throw error;
  }
}
