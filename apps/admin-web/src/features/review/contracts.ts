import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { allCategories } from "@used-books/api-contract/catalog-taxonomy";
type Schema = components["schemas"];
const uuid = z.uuid(),
  time = z.iso.datetime({ offset: true }),
  version = z.number().int().positive();
export const metadata = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  publicationYear: z.number().int().nullable(),
  language: z.string(),
  edition: z.string().nullable(),
  category: z.string(),
  categoryId: z
    .custom<Schema["CatalogMetadata"]["categoryId"]>(
      (v) => v === null || allCategories.some((c) => c.id === v),
    )
    .optional(),
  attributes: z
    .record(z.string(), z.array(z.string()))
    .transform((v) => v as Schema["CatalogAttributes"])
    .optional(),
  series: z.string().nullable().optional(),
  isbn: z.string().nullable(),
}) satisfies z.ZodType<Schema["CatalogMetadata"]>;
export const book = metadata.extend({ id: uuid }) satisfies z.ZodType<
  Schema["PublicBook"]
>;
const decisionFields = {
  id: uuid,
  revisionId: uuid,
  reason: z.string().nullable(),
  decidedAt: time,
};
const reviewDecision = z.object({
  ...decisionFields,
  decision: z.enum(["Approve", "Reject"]),
});
export const catalog = z.object({
  id: uuid,
  version,
  status: z.enum(["Pending", "Confirmed", "Rejected"]),
  requesterId: uuid,
  currentRevision: z.object({
    id: uuid,
    number: version,
    metadata,
    submittedAt: time,
  }),
  decisions: z.array(
    z.object({ ...decisionFields, decision: z.enum(["Confirm", "Reject"]) }),
  ),
  createdAt: time,
  updatedAt: time,
}) satisfies z.ZodType<Schema["PrivateCatalogRequest"]>;
const contentBase = z.object({
  bundle: z.object({
    title: z.string(), wholeOnly: z.literal(true), exclusiveOwnershipDeclared: z.literal(true),
    items: z.array(z.object({label: z.string(), condition: z.enum(['LikeNew','Good','Fair','Worn']), notes: z.string()})).min(2).max(50),
  }).nullable().optional(),
  fulfillment: z
    .object({
      originAddressId: uuid,
      originAddressVersion: version,
      method: z.literal("DirectDelivery"),
    })
    .nullable()
    .optional(),
  bookId: uuid.nullable(),
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]).nullable(),
  pages: z.string(),
  coverNote: z.string(),
  notes: z.string(),
  accessories: z.string(),
  description: z.string(),
  readable: z.boolean().nullable(),
  hasMissingPages: z.boolean().nullable(),
  missingEssentialContent: z.boolean().nullable(),
  mediaIds: z.array(uuid).max(8),
});
const price = z.number().int().nullable();
const content = z.discriminatedUnion("mode", [
  contentBase.extend({
    mode: z.literal("Sale"),
    salePrice: price,
    exchangeValue: z.null(),
  }),
  contentBase.extend({
    mode: z.literal("Exchange"),
    salePrice: z.null(),
    exchangeValue: price,
  }),
  contentBase.extend({
    mode: z.literal("Both"),
    salePrice: price,
    exchangeValue: price,
  }),
  contentBase.extend({
    mode: z.null(),
    salePrice: z.null(),
    exchangeValue: z.null(),
  }),
]) satisfies z.ZodType<Schema["DraftContent"]>;
export const revision = z.object({
  fulfillmentStatus: z.enum(["NotConfigured", "Current", "NeedsUpdate"]),
  id: uuid,
  number: version,
  content,
  submittedAt: time.nullable(),
  ownershipDeclaredAt: time.nullable(),
  decision: reviewDecision.nullable(),
}) satisfies z.ZodType<Schema["ListingRevision"]>;
// The price suggestion the seller decided on with this revision (ADR 0028).
export const priceAssistReview = z.object({
  suggestionId: uuid,
  range: z.object({ low: z.number().int(), high: z.number().int() }),
  evidenceLevel: z.enum(["Strong", "Limited", "Insufficient"]),
  model: z.string().nullable(),
  input: z.object({
    condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]).nullable(),
    readable: z.boolean().nullable(),
    hasMissingPages: z.boolean().nullable(),
    missingEssentialContent: z.boolean().nullable(),
  }),
  applied: z.boolean(),
  chosenSalePrice: z.number().int().nullable(),
  withinRange: z.boolean().nullable(),
  decidedAt: time,
  sources: z.array(
    z.object({
      ref: z.string(),
      kind: z.enum([
        "CoverPrice",
        "EditorialReference",
        "InternalAsking",
        "CompletedSale",
        "OnlineRetail",
      ]),
      label: z.string(),
      amount: z.number().int(),
      condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]).nullable(),
      observedAt: time,
      url: z.string().nullable(),
      originGroup: z.string().nullable().optional(),
      excluded: z
        .enum(["Outlier", "Stale", "OtherEdition", "AskingPrice", "DuplicateSource"])
        .nullable(),
    }),
  ),
});
export type PriceAssistReview = z.infer<typeof priceAssistReview>;
export const listing = z.object({
  id: uuid,
  ownerId: uuid,
  version,
  // ADR 0042: Auction listings never reach the marketplace shelf.
  channel: z.enum(["Marketplace", "Auction"]),
  state: z.object({
    moderation: z.enum(["Draft", "PendingReview", "Approved", "Rejected"]),
    visibility: z.enum(["Visible", "Hidden", "Removed"]),
    trade: z.enum([
      "Available",
      "Reserved",
      "Sold",
      "Exchanged",
      "ClosedUnavailable",
    ]),
    deletedAt: time.nullable(),
  }),
  currentRevision: revision,
  latestDecision: reviewDecision.nullable(),
  priceAssist: priceAssistReview.nullable().optional(),
  removalReason: z.string().nullable(),
  catalogStatus: z.enum(["Pending", "Confirmed", "Rejected"]).nullable(),
  createdAt: time,
  updatedAt: time,
}) satisfies z.ZodType<Schema["PrivateListing"]>;
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    serverTime: time,
  });
export const mediaRead = z.object({
  id: uuid,
  url: z
    .url()
    .refine((url) => ["http:", "https:"].includes(new URL(url).protocol)),
  expiresAt: time,
  width: version,
  height: version,
}) satisfies z.ZodType<Schema["MediaRead"]>;
export const receipt = z.object({
  id: uuid,
  entityId: uuid,
  version,
  revisionId: uuid.nullable(),
});
export type Catalog = z.infer<typeof catalog>;
export type Listing = z.infer<typeof listing>;
export type Revision = z.infer<typeof revision>;
export type Metadata = z.infer<typeof metadata>;
export type Kind = "listings" | "catalog-requests";
export type DecisionBody = Schema["DecideCatalog"] | Schema["DecideListing"];
export const checks = {
  bundleContentsVerified: 'Đã đối chiếu đủ các cuốn/tập và ảnh toàn bộ bộ sách',
  catalogMatches: "Ảnh và thông tin khớp với đầu sách",
  photosClear: "Ảnh đủ rõ để xem tình trạng",
  conditionDisclosed: "Tình trạng và khuyết điểm được mô tả",
  readable: "Sách còn đọc được, không thiếu nội dung trọng yếu",
  pricingValid: "Giá bán / giá trị đổi hợp lệ",
  contentAppropriate: "Nội dung phù hợp để đăng",
} as const satisfies Record<keyof Schema["ReviewChecklist"], string>;
export const labels: Record<string, string> = {
  Pending: "Chờ xác nhận",
  Confirmed: "Đã xác nhận",
  PendingReview: "Chờ duyệt",
  Approved: "Đã duyệt",
  Rejected: "Đã từ chối",
  Removed: "Đã gỡ",
  Approve: "Duyệt bài đăng",
  Confirm: "Xác nhận đầu sách",
  Reject: "Từ chối",
  Sale: "Bán",
  Exchange: "Đổi",
  Both: "Bán hoặc đổi",
  LikeNew: "Như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
};
