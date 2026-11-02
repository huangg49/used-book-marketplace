import { z } from "zod";

export const exchangeBookSnapshotSchema = z.object({
  listingId: z.string().uuid(),
  listingVersion: z.number().int().positive(),
  revisionId: z.string().uuid(),
  ownerId: z.string().uuid(),
  bookId: z.string().uuid(),
  ownerDisplayName: z.string(),
  catalogRevisionId: z.string().uuid(),
  book: z
    .object({
      title: z.string(),
      authors: z.array(z.string()),
      isbn: z.string().nullable(),
      edition: z.string().nullable(),
      publisher: z.string().nullable(),
      publicationYear: z.number().nullable(),
      language: z.string(),
      category: z.string(),
    })
    .passthrough(),
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]),
  description: z.string(),
  pages: z.string(),
  coverNote: z.string(),
  notes: z.string(),
  accessories: z.string(),
  readable: z.boolean(),
  hasMissingPages: z.boolean(),
  missingEssentialContent: z.boolean(),
  exchangeValue: z.number().int().positive(),
  mediaIds: z.array(z.string().uuid()).min(1).max(8),
});
export const exchangeAgreementSchema = z.object({
  initiatorBooks: z.array(exchangeBookSnapshotSchema).min(1).max(5),
  recipientBook: exchangeBookSnapshotSchema,
});
export type ExchangeBookSnapshot = z.infer<typeof exchangeBookSnapshotSchema>;
