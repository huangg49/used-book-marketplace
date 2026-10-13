import { z } from "zod";

export const publicBook = z.object({
  bookId: z.string().uuid(),
  title: z.string(),
  coverMediaIds: z.array(z.string().uuid()).max(10),
  authors: z.array(z.string()).max(10),
  publisher: z.string(),
  publishedYear: z.number().int().nullable(),
  isbn: z.string().nullable(),
  language: z.string().nullable(),
});

export const publicListing = z.object({
  listingId: z.string().uuid(),
  bookId: z.string().uuid(),
  mode: z.enum(["Sale", "Exchange", "Both"]),
  price: z.number().int().min(0).max(100_000_000),
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]),
  sellerId: z.string().uuid(),
});

export const wishlistItem = z.object({
  id: z.string().uuid(),
  subjectType: z.enum(["CATALOG_BOOK", "LISTING"]),
  subjectId: z.string().uuid(),
  wantsToExchange: z.boolean(),
  receiveNotifications: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  book: z.any().optional(),
  listing: z.any().optional(),
});

export const wishlistPage = z.object({
  items: z.array(wishlistItem),
  nextCursor: z.string().nullable(),
});

export type WishlistItem = z.infer<typeof wishlistItem>;
