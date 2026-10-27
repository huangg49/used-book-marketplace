import { z } from "zod";
import { session } from "../lib/session";

const itemSchema = z.object({
  subjectType: z.literal("LISTING"),
  subjectId: z.string().uuid(),
});
const pageSchema = z.object({
  items: z.array(itemSchema),
  nextCursor: z.string().nullable(),
});

export async function getSavedListingIds(): Promise<string[]> {
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ subjectType: "LISTING", limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const page = await session.request(`/me/wishlist?${query}`, pageSchema);
    page.items.forEach((item) => ids.add(item.subjectId));
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor))
      throw new Error("Repeated wishlist cursor");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...ids];
}

export async function setListingSaved(listingId: string, saved: boolean) {
  const path = `/me/wishlist/listings/${encodeURIComponent(listingId)}`;
  if (saved) {
    await session.request(path, itemSchema, {
      method: "PUT",
      body: JSON.stringify({
        wantsToExchange: false,
        receiveNotifications: false,
      }),
    });
  } else {
    await session.request(path, z.void(), { method: "DELETE" });
  }
}
