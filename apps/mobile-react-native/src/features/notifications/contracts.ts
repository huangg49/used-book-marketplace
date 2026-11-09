import { z } from "zod";
import type { components } from "@used-books/api-contract";

export const memberNotification = z.object({
  id: z.string().uuid(),
  // Every kind in the contract: one unknown kind would fail the whole page.
  kind: z.enum([
    "AuctionOutbid",
    "AuctionFundsHeld",
    "AuctionFundsReleased",
    "AuctionBiddingStarted",
    "AuctionNotEnoughBidders",
    "AuctionDepositForfeited",
    "AuctionRescheduled",
    "AuctionResumed",
    "AuctionSecondChanceOffered",
    "AuctionDepositShareReceived",
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
    "ExchangeReceived", "ExchangeCompleted", "ExchangeCancelled", "ExchangeRejected", "ExchangeDisputed",
    "WithdrawalUpdated", "SupportUpdated", "ReviewModerated",
  ]),
  title: z.string(),
  body: z.string(),
  targetType: z.enum(["Auction", "Exchange", "Order", "SupportCase", "TransactionReview", "Withdrawal"]),
  targetId: z.string().uuid(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});

export type MemberNotification = z.infer<typeof memberNotification>;
// Fails to compile when the contract gains or drops a kind this list lacks.
type ContractKind = components["schemas"]["MemberNotification"]["kind"];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const notificationKindsMatchContract: Same<MemberNotification["kind"], ContractKind> = true;

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
