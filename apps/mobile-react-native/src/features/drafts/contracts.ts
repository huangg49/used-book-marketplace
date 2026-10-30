import { z } from "zod";
import { bookCondition } from "./book-condition";
const uuid = z.string().uuid();
export const draftContent = z.object({
  fulfillment: z
    .object({
      originAddressId: uuid,
      originAddressVersion: z.number().int().positive(),
      method: z.literal("DirectDelivery"),
    })
    .nullable()
    .optional(),
  bookId: uuid.nullable(),
  mode: z.enum(["Sale", "Exchange", "Both"]).nullable(),
  condition: bookCondition.nullable(),
  pages: z.string(),
  coverNote: z.string(),
  notes: z.string(),
  accessories: z.string(),
  description: z.string(),
  readable: z.boolean().nullable(),
  hasMissingPages: z.boolean().nullable(),
  missingEssentialContent: z.boolean().nullable(),
  salePrice: z.number().int().nullable(),
  exchangeValue: z.number().int().nullable(),
  exchangePreferences: z
    .object({
      targetCategory: z.string().nullable().optional(),
      targetAuthor: z.string().nullable().optional(),
      targetDescription: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  mediaIds: z.array(uuid).max(8),
});
// ADR 0042: Auction listings are created by the auction flow and never reach
// the marketplace. Older servers omit the field; their listings are marketplace.
export const listingChannel = z.enum(["Marketplace", "Auction"]);
export type ListingChannel = z.infer<typeof listingChannel>;
export const privateDraft = z.object({
  id: uuid,
  version: z.number().int(),
  channel: listingChannel.default("Marketplace"),
  createdAt: z.string(),
  catalogStatus: z.enum(["Pending", "Confirmed", "Rejected"]).nullable(),
  latestDecision: z
    .object({
      decision: z.enum(["Approve", "Reject"]),
      reason: z.string().nullable(),
      revisionId: uuid,
    })
    .nullable(),
  removalReason: z.string().nullable(),
  state: z.object({
    moderation: z.string(),
    visibility: z.string(),
    trade: z.string(),
    deletedAt: z.string().nullable(),
  }),
  currentRevision: z.object({
    id: uuid,
    content: draftContent,
    fulfillmentStatus: z
      .enum(["NotConfigured", "Current", "NeedsUpdate"])
      .optional(),
  }),
});
export const draftPage = z.object({
  items: z.array(privateDraft),
  nextCursor: z.string().nullable(),
});
export type PrivateDraft = z.infer<typeof privateDraft>;
export const receipt = z.object({
  id: uuid,
  entityId: uuid,
  version: z.number().int(),
  state: z.unknown(),
});
export const media = z.object({
  id: uuid,
  listingId: uuid,
  version: z.number().int(),
  status: z.enum(["Pending", "Processing", "Ready", "Failed"]),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int(),
  failureCode: z.string().nullable(),
  createdAt: z.string(),
});
export const mediaPage = z.object({
  items: z.array(media),
  nextCursor: z.string().nullable(),
});
export const mediaRead = z.object({
  id: uuid,
  url: z.string().url(),
  expiresAt: z.string(),
  width: z.number(),
  height: z.number(),
});
export const ticket = z.object({
  mediaId: uuid,
  method: z.literal("PUT"),
  path: z
    .string()
    .regex(/^\/listings\/[a-f0-9-]+\/media\/[a-f0-9-]+\/content$/),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
  maxBytes: z.number(),
});
export type Draft = z.infer<typeof privateDraft>;
export type Content = z.infer<typeof draftContent>;
export type Media = z.infer<typeof media>;
export const emptyContent: z.infer<typeof draftContent> = {
  bookId: null,
  mode: null,
  condition: null,
  pages: "",
  coverNote: "",
  notes: "",
  accessories: "",
  description: "",
  readable: null,
  hasMissingPages: null,
  missingEssentialContent: null,
  salePrice: null,
  exchangeValue: null,
  exchangePreferences: null,
  mediaIds: [],
};
