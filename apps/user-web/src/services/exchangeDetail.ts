import { z } from "zod";
import { session } from "./api";
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
  const initiatorIds =
    ex.initiatorListingIds && ex.initiatorListingIds.length > 0
      ? ex.initiatorListingIds
      : [ex.initiatorListingId];
  const recipientIds = [ex.recipientListingId];

  const [initListings, recListings] = await Promise.all([
    Promise.all(initiatorIds.map(exchangeListing)),
    Promise.all(recipientIds.map(exchangeListing)),
  ]);
  const [giveBooks, receiveBooks] = await Promise.all([
    Promise.all(
      (initiator ? initiatorIds : recipientIds).map((bookId, idx) =>
        exchangeBook(
          bookId,
          initiator ? initListings[idx] : recListings[idx],
          initiator && initiatorIds.length === 1 ? ex.recipientDeposit : undefined,
        ),
      ),
    ),
    Promise.all(
      (initiator ? recipientIds : initiatorIds).map((bookId, idx) =>
        exchangeBook(
          bookId,
          initiator ? recListings[idx] : initListings[idx],
          initiator
            ? ex.initiatorDeposit
            : (!initiator && initiatorIds.length === 1 ? ex.recipientDeposit : undefined),
        ),
      ),
    ),
  ]);
  return {
    id: ex.id,
    transactionCode: ex.id.slice(0, 8).toUpperCase(),
    revision: ex.revision,
    createdAt: ex.createdAt,
    status: mapExchangeStatus(ex, actor.id),
    rawStatus: ex.status,
    lastProposedById: ex.lastProposedById ?? ex.initiatorId,
    canViewerAccept:
      ex.status === "Proposed" &&
      (ex.lastProposedById ?? ex.initiatorId) !== actor.id,
    viewerRole: initiator ? "proposer" : "recipient",
    viewer: { id: actor.id, username: actor.displayName },
    partner: {
      id: initiator ? ex.recipientId : ex.initiatorId,
      username:
        (initiator ? recListings[0] : initListings[0])?.seller.displayName ??
        "Đối tác trao đổi",
    },
    receiveBooks,
    giveBooks,
    moneyCompensationType: ex.diffAmount
      ? ex.diffPayerId === actor.id
        ? "user_pays"
        : "other_pays"
      : "none",
    moneyAmount: ex.diffAmount || undefined,
    rejectionReason: ex.rejectionReason ?? undefined,
    fundingDeadline: ex.fundingDeadline ?? undefined,
    proposalExpiresAt: ex.proposalExpiresAt ?? undefined,
    shippingDeadline: ex.shippingDeadline ?? undefined,
    disputedAt: ex.disputedAt ?? undefined,
    disputeReason: ex.disputeReason ?? undefined,
    disputedBy: ex.disputedBy ?? undefined,
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
    inspectionDeadline: ex.inspectionDeadline ?? undefined,
    completedAt: ex.completedAt ?? undefined,
    viewerCompletedAt:
      (initiator ? ex.initiatorCompletedAt : ex.recipientCompletedAt) ??
      undefined,
    partnerCompletedAt:
      (initiator ? ex.recipientCompletedAt : ex.initiatorCompletedAt) ??
      undefined,
    viewerAddress: (initiator ? ex.initiatorAddress : ex.recipientAddress) ?? undefined,
    partnerAddress: (initiator ? ex.recipientAddress : ex.initiatorAddress) ?? undefined,
    viewerShipment: (initiator ? ex.initiatorShipment : ex.recipientShipment) ?? undefined,
    partnerShipment: (initiator ? ex.recipientShipment : ex.initiatorShipment) ?? undefined,
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
export interface AddressSnapshotInput {
  recipientName: string;
  phone: string;
  detail: string;
  localityCode?: string | null;
  serviceAreaCode?: string | null;
}

export function acceptExchange(
  id: string,
  revision: number,
  deliveryAddressId?: string,
) {
  return exchangeCommand(`/exchanges/${id}/accept`, {
    revision,
    ...(deliveryAddressId ? { deliveryAddressId } : {}),
  });
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
export function confirmSent(
  id: string,
  revision: number,
  shipment?: {
    method?: "carrier" | "direct";
    carrierCode?: string;
    carrierName?: string;
    trackingCode?: string;
    meetupLocation?: string;
    notes?: string;
  },
) {
  return exchangeCommand(`/exchanges/${id}/ship`, {
    expectedVersion: revision,
    ...(shipment
      ? {
          method: shipment.method,
          carrierCode: shipment.carrierCode,
          carrierName: shipment.carrierName,
          trackingCode: shipment.trackingCode,
          meetupLocation: shipment.meetupLocation,
          notes: shipment.notes,
        }
      : {}),
  });
}
export function confirmReceived(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/receive`, {
    expectedVersion: revision,
  });
}
export function completeExchange(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/complete`, {
    expectedVersion: revision,
  });
}

export function counterExchange(
  id: string,
  revision: number,
  data: {
    diffAmount: number;
    diffPayer: "initiator" | "recipient" | "none";
    deliveryAddressId?: string;
    note?: string;
  },
) {
  return exchangeCommand(`/exchanges/${id}/counter`, {
    expectedVersion: revision,
    diffAmount: data.diffAmount,
    diffPayer: data.diffPayer,
    ...(data.deliveryAddressId ? { deliveryAddressId: data.deliveryAddressId } : {}),
    ...(data.note ? { note: data.note } : {}),
  });
}

const exchangeMessagesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      exchangeId: z.string(),
      senderId: z.string(),
      body: z.string(),
      sentAt: z.string(),
    }),
  ),
});

export async function getMessages(id: string): Promise<ChatMessage[]> {
  try {
    const actor = exchangeActor();
    const res = await session.request(
      `/exchanges/${id}/messages`,
      exchangeMessagesSchema,
    );
    return res.items.map((m) => {
      let senderRole: "viewer" | "partner" | "system" = "partner";
      if (
        m.body.startsWith("[Đề xuất lại") ||
        m.body.startsWith("[Hệ thống")
      ) {
        senderRole = "system";
      } else if (m.senderId === actor.id) {
        senderRole = "viewer";
      }
      return {
        id: m.id,
        senderRole,
        text: m.body,
        sentAt: m.sentAt,
      };
    });
  } catch (err) {
    console.warn("Could not load exchange messages:", err);
    return [];
  }
}

export async function sendMessage(id: string, text: string): Promise<void> {
  await session.request(
    `/exchanges/${id}/messages`,
    z.object({ id: z.string() }),
    {
      method: "POST",
      body: JSON.stringify({ body: text }),
    },
  );
}

export function reportIssue(
  id: string,
  revision: number,
  reason: string,
) {
  return exchangeCommand(`/exchanges/${id}/dispute`, {
    expectedVersion: revision,
    reason,
  });
}
