import { z } from "zod";

// Auction reads and commands (OpenAPI 0.35.0, tag Auctions). Auto ceilings are
// never public; the caller's own ceiling only comes from participation.

// The inspected intake revision (PublicAuctionBook); only the fields the list
// shows are kept. Photos are read through /auctions/{id}/photos/{mediaId}.
export const publicAuctionBook = z.object({
  revisionId: z.string().uuid(),
  authors: z.array(z.string()),
  condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]),
  photos: z.array(
    z.object({
      id: z.string().uuid(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  ),
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
  // Null once the book is no longer eligible for public reads.
  book: publicAuctionBook.nullable().optional(),
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

export const myAuctionPage = z.object({
  items: z.array(
    z.object({
      auction: publicAuctionSummary,
      role: z.enum(["Seller", "Bidder"]),
      leading: z.boolean(),
      won: z.boolean(),
      needsPayment: z.boolean(),
      paymentDeadline: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  serverTime: z.string(),
});
export type MyAuctionPage = z.infer<typeof myAuctionPage>;
export type MyAuctionItem = MyAuctionPage["items"][number];

export const pointOrderStates = [
  "AwaitingPayment",
  "Fulfilling",
  "ReadyForCollection",
  "Inspection",
  "ResolutionPending",
  "ReturnPending",
  "Completed",
  "Cancelled",
  "PaymentExpired",
] as const;
export const pointOrder = z.object({
  id: z.string().uuid(),
  auctionId: z.string().uuid().nullable(),
  title: z.string(),
  pointName: z.string(),
  role: z.enum(["Buyer", "Seller"]),
  state: z.enum(pointOrderStates),
  version: z.number().int(),
  amounts: z.object({ bookPrice: z.number().int(), buyerTotal: z.number().int() }),
  paymentDeadline: z.string().nullable(),
  paidAt: z.string().nullable(),
  // Condition check at the point (FR-T02): never an authenticity claim.
  report: z.object({
    outcome: z.literal("Pass"),
    inspectedAt: z.string(),
    note: z.string().nullable(),
    scope: z.string(),
  }),
  acceptanceDeadline: z.string().nullable(),
  collectionDeadline: z.string().nullable(),
  inspectionDeadline: z.string().nullable(),
  returnDeadline: z.string().nullable(),
  serverTime: z.string(),
});
export type PointOrder = z.infer<typeof pointOrder>;

export const codeIssued = z.object({
  receipt: auctionReceipt.extend({ codeExpiresAt: z.string().nullable() }),
  // Null on a replay: a code is shown once and never stored in receipts.
  code: z.string().regex(/^[0-9]{6}$/).nullable(),
});
export type CodeIssued = z.infer<typeof codeIssued>;

export const handoverPoints = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      displayAddress: z.string(),
      status: z.enum(["Active", "Paused", "Closed"]),
      capacity: z.number().int(),
      availableSlots: z.number().int(),
      demoOnly: z.literal(true),
    }),
  ),
});
export type HandoverPoint = z.infer<typeof handoverPoints>["items"][number];

export const intakeStates = [
  "AwaitingDropoff",
  "Received",
  "NeedsEvidence",
  "Passed",
  "Auctioning",
  "ReclaimRequired",
  "Reclaimed",
  "Cancelled",
  "Sold",
] as const;
export const myIntake = z.object({
  id: z.string().uuid(),
  auctionId: z.string().uuid().nullable(),
  state: z.enum(intakeStates),
  version: z.number().int(),
  listingId: z.string().uuid(),
  title: z.string(),
  pointId: z.string().uuid(),
  startPrice: z.number().int(),
  step: z.union([z.literal(10000), z.literal(50000)]),
  buyNowPrice: z.number().int().nullable(),
  dropoffDeadline: z.string(),
  inspectionOutcome: z.enum(["Pass", "Fail", "NeedsEvidence"]).nullable(),
  inspectionNote: z.string().nullable(),
  reclaimReason: z.string().nullable(),
  // N4-12: the point asked for evidence (POL-09, 48 hours, one answer).
  evidenceDeadline: z.string().nullable(),
  evidenceSubmittedAt: z.string().nullable(),
});
export type MyIntake = z.infer<typeof myIntake>;
export const myIntakes = z.object({ items: z.array(myIntake) });
export const intakeReceipt = z.object({
  id: z.string().uuid(),
  intakeId: z.string().uuid(),
  version: z.number().int(),
  state: z.string(),
});
