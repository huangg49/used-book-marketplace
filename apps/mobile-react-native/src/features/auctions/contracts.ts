import { z } from "zod";

// Auction reads and commands (OpenAPI 0.35.0, tag Auctions). Auto ceilings are
// never public; the caller's own ceiling only comes from participation.

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

export const auctionStates = [
  "Active",
  "BuyNowPending",
  "AwaitingWinnerPayment",
  "Sold",
  "Unsold",
  "OnHold",
  "Cancelled",
  "PaymentExpired",
] as const;
export type AuctionState = (typeof auctionStates)[number];

export const publicAuctionSummary = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  title: z.string(),
  state: z.enum(auctionStates),
  startPrice: z.number().int().min(10000),
  step: z.union([z.literal(10000), z.literal(50000)]),
  buyNowPrice: z.number().int().nullable(),
  currentPrice: z.number().int().nullable(),
  minimumBid: z.number().int().nullable(),
  bidderCount: z.number().int().min(0),
  startAt: z.string(),
  endAt: z.string(),
  pointName: z.string(),
  // The detail read returns a richer book; only the summary fields are used here.
  book: z.unknown().optional(),
  demoOnly: z.boolean().optional(),
});

export type PublicAuctionSummary = z.infer<typeof publicAuctionSummary>;

export const publicAuctionList = z.object({
  items: z.array(publicAuctionSummary),
  serverTime: z.string(),
});

export type PublicAuctionList = z.infer<typeof publicAuctionList>;

export const publicAuction = z.object({
  auction: publicAuctionSummary,
  leaderAlias: z.number().int().nullable(),
  history: z.array(
    z.object({
      price: z.number().int(),
      bidderAlias: z.number().int(),
      at: z.string(),
    }),
  ),
  serverTime: z.string(),
});
export type PublicAuction = z.infer<typeof publicAuction>;

export const participation = z.object({
  auctionId: z.string().uuid(),
  alias: z.number().int().nullable(),
  mode: z.enum(["Manual", "Auto"]).nullable(),
  ownLevel: z.number().int().nullable(),
  boughtNow: z.boolean(),
  leading: z.boolean(),
  state: z.enum(auctionStates),
  currentPrice: z.number().int().nullable(),
  minimumBid: z.number().int().nullable(),
  won: z.boolean(),
  orderId: z.string().uuid().nullable(),
  finalPrice: z.number().int().nullable(),
  paymentDeadline: z.string().nullable(),
  serverTime: z.string(),
});
export type Participation = z.infer<typeof participation>;

export const auctionReceipt = z.object({
  id: z.string().uuid(),
  entityType: z.enum(["AuctionIntake", "Auction", "PointOrder"]),
  entityId: z.string().uuid(),
  auctionId: z.string().uuid().nullable(),
  orderId: z.string().uuid().nullable(),
  version: z.number().int(),
  state: z.string(),
  currentPrice: z.number().int().nullable(),
  minimumBid: z.number().int().nullable(),
  leading: z.boolean().nullable(),
  serverTime: z.string(),
});
export type AuctionReceipt = z.infer<typeof auctionReceipt>;
