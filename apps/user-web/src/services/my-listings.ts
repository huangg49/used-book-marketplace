import { z } from "zod";
import { session } from "./api";

const mediaReadSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  expiresAt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

export const myListingSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int(),
    // ADR 0042: older servers omit it; their listings are marketplace ones.
    channel: z.enum(["Marketplace", "Auction"]).default("Marketplace"),
    catalogStatus: z
      .enum(["Pending", "Confirmed", "Rejected"])
      .nullable()
      .optional(),
    latestDecision: z
      .object({ reason: z.string().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
    removalReason: z.string().nullable().optional(),
    state: z.object({
      moderation: z.enum(["Draft", "PendingReview", "Approved", "Rejected"]),
      visibility: z.enum(["Visible", "Hidden", "Removed"]),
      trade: z.enum(["Available", "Reserved", "Exchanged", "Sold"]),
    }),
    currentRevision: z
      .object({
        id: z.string().uuid(),
        bookId: z.string().nullable().optional(),
        content: z
          .object({
            bookId: z.string().nullable().optional(),
            title: z.string().nullable().optional(), // In case it's in content
            author: z.string().nullable().optional(),
            salePrice: z.number().int().nullable().optional(),
            exchangeValue: z.number().int().nullable().optional(),
            mode: z.enum(["Sale", "Exchange", "Both"]).nullable().optional(),
            condition: z
              .enum(["LikeNew", "Good", "Fair", "Worn"])
              .nullable()
              .optional(),
            mediaIds: z.array(z.string().uuid()).optional(),
          })
          .passthrough(),
      })
      .passthrough(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const myListingPageSchema = z.object({
  items: z.array(myListingSchema),
  nextCursor: z.string().nullable(),
});

export type MyListing = z.infer<typeof myListingSchema>;

export function getMyListings(
  moderation?: string,
  cursor?: string,
  limit = 20,
  channel: "Marketplace" | "Auction" = "Marketplace",
) {
  const query = new URLSearchParams({ limit: String(limit), channel });
  if (moderation) query.set("moderation", moderation);
  if (cursor) query.set("cursor", cursor);
  return session.request(`/me/listings?${query}`, myListingPageSchema);
}

export function getMyListing(id: string) {
  return session.request(`/me/listings/${id}`, myListingSchema);
}


const bookIdentitySchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
});
const privateBookSchema = z.object({
  currentRevision: z.object({ metadata: bookIdentitySchema }),
});

export async function getMyBookIdentity(
  bookId: string,
  status?: MyListing["catalogStatus"],
) {
  if (status === "Confirmed")
    return session.request(`/catalog/books/${bookId}`, bookIdentitySchema);
  const request = await session.request(
    `/me/catalog-requests/${bookId}`,
    privateBookSchema,
  );
  return request.currentRevision.metadata;
}

export function getMyPhoto(listingId: string, mediaId: string) {
  return session.request(
    `/me/listings/${listingId}/media/${mediaId}/read`,
    mediaReadSchema,
  );
}
