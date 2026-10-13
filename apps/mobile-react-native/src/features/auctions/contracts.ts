import { z } from "zod";

export const publicAuctionBook = z.object({
  id: z.string().uuid(),
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string(),
  publicationYear: z.number().nullable().optional(),
  language: z.string(),
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]),
  coverMediaId: z.string().uuid().nullable().optional(),
});

export type PublicAuctionBook = z.infer<typeof publicAuctionBook>;

export const publicAuctionSummary = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  title: z.string(),
  state: z.enum([
    "Active",
    "BuyNowPending",
    "AwaitingWinnerPayment",
    "Sold",
    "Unsold",
    "OnHold",
    "Cancelled",
    "PaymentExpired",
  ]),
  startPrice: z.number().int().min(10000),
  step: z.union([z.literal(10000), z.literal(50000)]),
  buyNowPrice: z.number().int().nullable(),
  currentPrice: z.number().int().nullable(),
  minimumBid: z.number().int().nullable(),
  bidderCount: z.number().int().min(0),
  startAt: z.string(),
  endAt: z.string(),
  pointName: z.string(),
  book: publicAuctionBook.nullable().optional(),
  demoOnly: z.boolean().optional(),
});

export type PublicAuctionSummary = z.infer<typeof publicAuctionSummary>;

export const publicAuctionList = z.object({
  items: z.array(publicAuctionSummary),
  serverTime: z.string(),
});

export type PublicAuctionList = z.infer<typeof publicAuctionList>;
