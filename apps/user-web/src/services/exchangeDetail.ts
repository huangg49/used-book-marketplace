import { z } from "zod";
import { session } from "./api";
import type { ExchangeDetail, ChatMessage } from "../lib/mock/exchangeDetail";
import {
  exchangeActor,
  getExchange,
  exchangeBooks,
  mapExchangeStatus,
  exchangeCommand,
  exchangeAcknowledged,
  exchangeIdentity,
} from "./exchange";

export async function getExchangeDetail(id: string): Promise<ExchangeDetail> {
  const identity = exchangeIdentity();
  const actor = exchangeActor();
  let ex;
  try {
    ex = await getExchange(id);
  } catch (error) {
    if (exchangeIdentity() !== identity) throw error;
    ex = exchangeAcknowledged(id);
    if (!ex) throw error;
  }
  if (exchangeIdentity() !== identity)
    throw new Error("Phiên tài khoản đã thay đổi.");
  const initiator = ex.initiatorId === actor.id;
  const { giveBooks, receiveBooks } = await exchangeBooks(ex, actor.id);
  if (exchangeIdentity() !== identity)
    throw new Error("Phiên tài khoản đã thay đổi.");
  return {
    id: ex.id,
    transactionCode: ex.id.slice(0, 8).toUpperCase(),
    revision: ex.revision,
    createdAt: ex.createdAt,
    status: mapExchangeStatus(ex, actor.id),
    rawStatus: ex.status,
    returnResolution: ex.returnResolution,
    demoShippingAdvanceAvailable: ex.demoShippingAdvanceAvailable,
    demoDeadline: ex.demoDeadline,
    outboundDeliveryVerification: ex.outboundDeliveryVerification,
    hasAgreementSnapshot: Boolean(ex.agreement),
    lastProposedById: ex.lastProposedById ?? ex.initiatorId,
    canViewerAccept:
      ex.status === "Proposed" &&
      (ex.lastProposedById ?? ex.initiatorId) !== actor.id,
    viewerRole: initiator ? "proposer" : "recipient",
    viewer: { id: actor.id, username: actor.displayName },
    partner: {
      id: initiator ? ex.recipientId : ex.initiatorId,
      username:
        (initiator
          ? ex.agreement?.recipientBook.ownerDisplayName
          : ex.agreement?.initiatorBooks[0]?.ownerDisplayName) ??
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
    negotiatedDiffAmount: ex.negotiatedDiffAmount ?? undefined,
    rejectionReason: ex.rejectionReason ?? undefined,
    fundingDeadline: ex.fundingDeadline ?? undefined,
    proposalExpiresAt: ex.proposalExpiresAt ?? undefined,
    shippingDeadline: ex.shippingDeadline ?? undefined,
    disputedAt: ex.disputedAt ?? undefined,
    disputeReason: ex.disputeReason ?? undefined,
    disputedBy: ex.disputedBy ?? undefined,
    resolutionDecision: ex.resolutionDecision ?? undefined,
    resolutionReason: ex.resolutionReason ?? undefined,
    resolvedBy: ex.resolvedBy ?? undefined,
    resolvedAt: ex.resolvedAt ?? undefined,
    cancelReason: ex.cancelReason ?? undefined,
    cancellationRequestedBy: ex.cancellationRequestedBy ?? undefined,
    cancellationRequestedAt: ex.cancellationRequestedAt ?? undefined,
    viewerFundedAt:
      (initiator ? ex.initiatorFundedAt : ex.recipientFundedAt) ?? undefined,
    partnerFundedAt:
      (initiator ? ex.recipientFundedAt : ex.initiatorFundedAt) ?? undefined,
    viewerFundingAmount:
      (initiator ? ex.initiatorDeposit : ex.recipientDeposit) +
      (ex.diffPayerId === actor.id ? ex.diffAmount : 0),
    viewerDeposit: initiator ? ex.initiatorDeposit : ex.recipientDeposit,
    partnerDeposit: initiator ? ex.recipientDeposit : ex.initiatorDeposit,
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
    viewerInspectionDeadline:
      (initiator
        ? ex.initiatorInspectionDeadline
        : ex.recipientInspectionDeadline) ?? undefined,
    partnerInspectionDeadline:
      (initiator
        ? ex.recipientInspectionDeadline
        : ex.initiatorInspectionDeadline) ?? undefined,
    completedAt: ex.completedAt ?? undefined,
    viewerCompletedAt:
      (initiator ? ex.initiatorCompletedAt : ex.recipientCompletedAt) ??
      undefined,
    partnerCompletedAt:
      (initiator ? ex.recipientCompletedAt : ex.initiatorCompletedAt) ??
      undefined,
    viewerAddress:
      (initiator ? ex.initiatorAddress : ex.recipientAddress) ?? undefined,
    partnerAddress:
      (initiator ? ex.recipientAddress : ex.initiatorAddress) ?? undefined,
    viewerShipment:
      (initiator ? ex.initiatorShipment : ex.recipientShipment) ?? undefined,
    partnerShipment:
      (initiator ? ex.recipientShipment : ex.initiatorShipment) ?? undefined,
    hasViewerReviewed: false,
    failedAtStep:
      ex.status === "Cancelled"
        ? ex.cancelReason === "ShippingExpired"
          ? 3
          : 2
        : undefined,
    closedBy:
      ex.cancelledBy === "System" || !ex.cancelledBy
        ? undefined
        : ex.cancelledBy === "Both"
          ? "both"
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
    packagingPhotoUrl?: string;
    packagingVideoUrl?: string;
    packagingPhotoName?: string;
    packagingVideoName?: string;
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
          packagingPhotoUrl: shipment.packagingPhotoUrl,
          packagingVideoUrl: shipment.packagingVideoUrl,
          packagingPhotoName: shipment.packagingPhotoName,
          packagingVideoName: shipment.packagingVideoName,
        }
      : {}),
  });
}
export function confirmReceived(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/receive`, {
    expectedVersion: revision,
  });
}
export function advanceDemoShipping(id: string, revision: number) {
  return exchangeCommand(`/exchanges/${id}/demo-advance-shipping`, {
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
    listingIds?: string[];
    negotiatedDiffAmount?: number;
    diffPayerId?: string | null;
    deliveryAddressId?: string;
    note?: string;
  },
) {
  return exchangeCommand(`/exchanges/${id}/counter`, {
    expectedVersion: revision,
    ...(data.listingIds ? { listingIds: data.listingIds } : {}),
    ...(data.negotiatedDiffAmount !== undefined
      ? { negotiatedDiffAmount: data.negotiatedDiffAmount }
      : {}),
    ...(data.diffPayerId !== undefined
      ? { diffPayerId: data.diffPayerId }
      : {}),
    ...(data.deliveryAddressId
      ? { deliveryAddressId: data.deliveryAddressId }
      : {}),
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
  olderCursor: z.string().nullable().optional(),
});

export async function getMessages(id: string): Promise<ChatMessage[]> {
  return (await readMessages(id)).items;
}

export function getMessagePage(id: string, before?: string) {
  const query = new URLSearchParams({ limit: "40" });
  if (before !== undefined) query.set("before", before);
  return readMessages(id, `?${query}`);
}

async function readMessages(id: string, search = "") {
  const actor = exchangeActor();
  const res = await session.request(
    `/exchanges/${id}/messages${search}`,
    exchangeMessagesSchema,
  );
  return {
    items: res.items.map((message): ChatMessage => ({
      id: message.id,
      senderRole: message.senderId === actor.id ? "viewer" : "partner",
      text: message.body,
      sentAt: message.sentAt,
    })),
    olderCursor: res.olderCursor ?? null,
  };
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

export function reportIssue(id: string, revision: number, reason: string) {
  return exchangeCommand(`/exchanges/${id}/dispute`, {
    expectedVersion: revision,
    reason,
  });
}
