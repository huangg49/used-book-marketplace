import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { catalogClassificationFields } from "../drafts/catalog-classification";
type Wire = components["schemas"];
const uuid = z.uuid(),
  time = z.iso.datetime({ offset: true });
const metadata = z.object({
  id: uuid,
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  publicationYear: z.number().int().nullable(),
  language: z.string(),
  edition: z.string().nullable(),
  category: z.string(),
  ...catalogClassificationFields,
  isbn: z.string().nullable(),
});
const base = z.object({
  fulfillment: z
    .object({
      serviceAreaCode: z.literal("HCM-DEMO-v1"),
      name: z.literal("TP.HCM"),
      demoOnly: z.literal(true),
      method: z.literal("DirectDelivery"),
    })
    .nullable(),
  id: uuid,
  revisionId: uuid,
  version: z.number().int(),
  book: metadata,
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]),
  pages: z.string(),
  coverNote: z.string(),
  notes: z.string(),
  accessories: z.string(),
  readable: z.literal(true),
  hasMissingPages: z.boolean(),
  missingEssentialContent: z.literal(false),
  description: z.string(),
  seller: z.object({ id: uuid, displayName: z.string() }),
  photos: z
    .array(
      z.object({
        id: uuid,
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    )
    .min(1)
    .max(8),
  publishedAt: time,
  purchaseAvailability: z.object({
    status: z.enum(["Available", "InNegotiation", "AwaitingPayment", "InTransaction"]),
    expiresAt: time.nullable(),
  }),
});
const price = z.number().int().min(10000).max(1000000);
export const publicListing = z.discriminatedUnion("mode", [
  base.extend({
    mode: z.literal("Sale"),
    salePrice: price,
    exchangeValue: z.null(),
  }),
  base.extend({
    mode: z.literal("Exchange"),
    salePrice: z.null(),
    exchangeValue: price,
  }),
  base.extend({
    mode: z.literal("Both"),
    salePrice: price,
    exchangeValue: price,
  }),
]) satisfies z.ZodType<Wire["PublicListing"]>;
export const publicPage = z.object({
  items: z.array(publicListing),
  nextCursor: z.string().nullable(),
  serverTime: time,
}) satisfies z.ZodType<Wire["PublicListingPage"]>;
export const publicMedia = z.object({
  id: uuid,
  url: z
    .url()
    .refine((url) => ["https:", "http:"].includes(new URL(url).protocol)),
  expiresAt: time,
  width: z.number().positive(),
  height: z.number().positive(),
}) satisfies z.ZodType<Wire["MediaRead"]>;
export type Listing = z.infer<typeof publicListing>;
export const conditions = {
  LikeNew: "Như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
} as const;
export const modes = {
  Sale: "Bán",
  Exchange: "Đổi",
  Both: "Bán hoặc đổi",
} as const;
