import { z } from "zod";
import { session } from "./api";

const publicListingSchema = z.object({
  id: z.string().uuid(),
  revisionId: z.string().uuid(),
  version: z.number().int(),
  book: z.object({
    id: z.string().uuid(),
    title: z.string(),
    authors: z.array(z.string()),
    publisher: z.string().nullable(),
    publicationYear: z.number().int().nullable(),
    language: z.string(),
    edition: z.string().nullable(),
    category: z.string(),
    isbn: z.string().nullable(),
    categoryId: z.string().nullable().optional(),
    attributes: z.record(z.string(), z.array(z.string())).optional(),
    series: z.string().nullable().optional(),
  }),
  mode: z.enum(["Sale", "Exchange", "Both"]),
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]),
  pages: z.string(),
  coverNote: z.string(),
  notes: z.string(),
  accessories: z.string(),
  readable: z.literal(true),
  hasMissingPages: z.boolean(),
  missingEssentialContent: z.literal(false),
  description: z.string(),
  salePrice: z.number().int().nullable(),
  exchangeValue: z.number().int().nullable(),
  seller: z.object({ id: z.string().uuid(), displayName: z.string() }),
  photos: z.array(
    z.object({
      id: z.string().uuid(),
      width: z.number().int(),
      height: z.number().int(),
    }),
  ),
  publishedAt: z.string(),
  fulfillment: z
    .object({
      serviceAreaCode: z.literal("HCM-DEMO-v1"),
      name: z.literal("TP.HCM"),
      demoOnly: z.literal(true),
      method: z.literal("DirectDelivery"),
      locality: z.object({ code: z.string(), label: z.string() }).optional(),
    })
    .nullable(),
  purchaseAvailability: z.object({
    status: z.enum(["Available", "InNegotiation", "AwaitingPayment", "InTransaction"]),
    expiresAt: z.string().nullable(),
  }),
});

export type PublicListing = z.infer<typeof publicListingSchema>;
export const publicListingPageSchema = z.object({
  items: z.array(publicListingSchema),
  nextCursor: z.string().nullable(),
  serverTime: z.string(),
});
const mediaReadSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  expiresAt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

export function getPublicListings(query: URLSearchParams) {
  const suffix = query.toString();
  return session.publicRequest(
    `/listings${suffix ? `?${suffix}` : ""}`,
    publicListingPageSchema,
  );
}
export function getPublicListing(id: string) {
  return session.publicRequest(`/listings/${id}`, publicListingSchema);
}
export function getPublicPhoto(listingId: string, mediaId: string) {
  return session.publicRequest(
    `/listings/${listingId}/media/${mediaId}/read`,
    mediaReadSchema,
  );
}
