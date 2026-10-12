import type { ExchangeDetail, ChatMessage } from "../lib/mock/exchangeDetail";
import {
  exchangeActor,
  getExchange,
  exchangeListing,
  exchangeBook,
  mapExchangeStatus,
  exchangeCommand,
} from "./exchange";

export async function getExchangeDetail(id: string): Promise<ExchangeDetail> {
  const actor = exchangeActor();
  const ex = await getExchange(id);
  const initiator = ex.initiatorId === actor.id;
  const [init, rec] = await Promise.all([
    exchangeListing(ex.initiatorListingId),
    exchangeListing(ex.recipientListingId),
  ]);
  const [give, receive] = await Promise.all([
    exchangeBook(
      initiator ? ex.initiatorListingId : ex.recipientListingId,
      initiator ? init : rec,
    ),
    exchangeBook(
      initiator ? ex.recipientListingId : ex.initiatorListingId,
      initiator ? rec : init,
    ),
  ]);
  return {
    id: ex.id,
    transactionCode: ex.id.slice(0, 8).toUpperCase(),
    revision: ex.revision,
    createdAt: ex.createdAt,
    status: mapExchangeStatus(ex, actor.id),
    rawStatus: ex.status,
    viewerRole: initiator ? "proposer" : "recipient",
    viewer: { id: actor.id, username: actor.displayName },
    partner: {
      id: initiator ? ex.recipientId : ex.initiatorId,
      username:
        (initiator ? rec : init)?.seller.displayName ?? "Đối tác trao đổi",
    },
    receiveBooks: [receive],
    giveBooks: [give],
    moneyCompensationType: ex.diffAmount
      ? ex.diffPayerId === actor.id
        ? "user_pays"
        : "other_pays"
      : "none",
    moneyAmount: ex.diffAmount || undefined,
    rejectionReason: ex.rejectionReason ?? undefined,
    fundingDeadline: ex.fundingDeadline ?? undefined,
    proposalExpiresAt: ex.proposalExpiresAt ?? undefined,
    viewerFundedAt:
      (initiator ? ex.initiatorFundedAt : ex.recipientFundedAt) ?? undefined,
    viewerFundingAmount:
      (initiator ? ex.initiatorDeposit : ex.recipientDeposit) +
      (ex.diffPayerId === actor.id ? ex.diffAmount : 0),
    viewerShipping: {
      sentAt:
        (initiator ? ex.initiatorShippedAt : ex.recipientShippedAt) ??
        undefined,
      receivedAt:
        (initiator ? ex.initiatorReceivedAt : ex.recipientReceivedAt) ??
        undefined,
    },
    partnerShipping: {
      sentAt:
        (initiator ? ex.recipientShippedAt : ex.initiatorShippedAt) ??
        undefined,
      receivedAt:
        (initiator ? ex.recipientReceivedAt : ex.initiatorReceivedAt) ??
        undefined,
    },
    hasViewerReviewed: false,
    closedBy:
      ex.cancelledBy === "System" || !ex.cancelledBy
        ? undefined
        : ex.cancelledBy === (initiator ? "Initiator" : "Recipient")
          ? "viewer"
          : "partner",
  };
}
export function cancelExchange(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/cancel`, {
    expectedVersion: revision,
  });
}
export function acceptExchange(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/accept`, { revision });
}
export function rejectExchange(id: string, revision: number, reason: string) {
  return exchangeCommand(`/exchanges/${id}/reject`, {
    expectedVersion: revision,
    reason,
  });
}
export function fundExchange(id: string) {
  return exchangeCommand(`/exchanges/${id}/funding`, {});
}
export function confirmSent(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/ship`, {
    expectedVersion: revision,
  });
}
export function confirmReceived(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/receive`, {
    expectedVersion: revision,
  });
}
// No exchange chat/report endpoint exists yet. Never fake successful writes.
export async function getMessages(_id: string): Promise<ChatMessage[]> {
  return [];
}
export async function sendMessage(_id: string, _text: string): Promise<void> {
  throw new Error("Nhắn tin trao đổi chưa khả dụng.");
}
export async function reportIssue(
  _id: string,
  _type: string,
  _description: string,
): Promise<void> {
  throw new Error("Báo cáo trao đổi chưa khả dụng.");
}
