import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
import {
  accountIdentity,
  pendingAccountCommand,
  pendingAccountCommandPath,
  readAccountResource,
  sendAccountCommand,
} from "./account-commands";
export function cartSchema<T extends z.ZodType>(listing: T) {
  return z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    items: z
      .array(
        z.object({
          listingId: z.uuid(),
          quantity: z.literal(1),
          addedAt: z.iso.datetime({ offset: true }),
          priceAtAdd: z.number().int().nonnegative(),
          listing: listing.nullable(),
          canBuy: z.boolean(),
        }),
      )
      .max(50),
    serverTime: z.iso.datetime({ offset: true }),
  });
}
const cartVersion = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export const cartIntentSlot = "member-cart";
export function pendingCartCommand(client: SessionClient) {
  return pendingAccountCommand(client, cartIntentSlot);
}
export function readCart<T>(client: SessionClient, schema: z.ZodType<T>) {
  return readAccountResource<T>(client, "/me/cart", schema);
}
export async function changeCart(
  client: SessionClient,
  input:
    | { action: "add"; listingId: string; listingVersion: number }
    | { action: "remove"; listingId: string }
    | null,
  keyFactory: () => string,
) {
  const path = pendingAccountCommandPath(client, cartIntentSlot);
  if (path)
    return sendAccountCommand(client, cartIntentSlot, path, null, keyFactory);
  if (!input) throw new Error("Không có thao tác giỏ đang chờ.");
  const identity = accountIdentity(client),
    current = await readCart(client, cartVersion);
  if (accountIdentity(client) !== identity)
    throw new ApiError(401, "SESSION_CHANGED", "Phiên tài khoản đã thay đổi.");
  return sendAccountCommand(
    client,
    cartIntentSlot,
    `/me/cart/${input.action}`,
    {
      expectedVersion: current.version,
      listingId: input.listingId,
      ...(input.action === "add"
        ? { expectedListingVersion: input.listingVersion }
        : {}),
    },
    keyFactory,
    { entityType: "Cart", entityId: current.id },
  );
}
