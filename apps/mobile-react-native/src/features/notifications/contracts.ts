import { z } from "zod";

export const memberNotification = z.object({
  id: z.string().uuid(),
  kind: z.enum([
    "AuctionOutbid",
    "AuctionWon",
    "AuctionSold",
    "AuctionBoughtNow",
    "AuctionUnsold",
    "AuctionCancelled",
    "AuctionOnHold",
    "AuctionPaymentExpired",
    "AuctionPaid",
    "OrderBuyNowPaid",
    "ExchangeProposed", "ExchangeAccepted", "ExchangeFunded", "ExchangeShipped",
    "ExchangeReceived", "ExchangeCompleted", "ExchangeCancelled", "ExchangeRejected",
  ]),
  title: z.string(),
  body: z.string(),
  targetType: z.enum(["Auction", "Exchange", "Order"]),
  targetId: z.string().uuid(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});

export type MemberNotification = z.infer<typeof memberNotification>;

export const memberNotificationPage = z.object({
  items: z.array(memberNotification),
  unreadCount: z.number().int().min(0),
  nextCursor: z.string().nullable(),
});

export type MemberNotificationPage = z.infer<typeof memberNotificationPage>;

export const markNotificationsReadResult = z.object({
  unreadCount: z.number().int().min(0),
});

export type MarkNotificationsReadResult = z.infer<
  typeof markNotificationsReadResult
>;
