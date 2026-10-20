import { z } from "zod";

export const purchaseMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  body: z.string().min(1).max(1000),
  sentAt: z.string(),
});

export const conversationProposalSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["Mode", "Price"]),
  proposedById: z.string().uuid(),
  mode: z.enum(["Negotiation", "Exchange"]).nullable(),
  amount: z.number().int().nullable(),
  listingRevisionId: z.string().uuid(),
  createdAt: z.string(),
});

export const conversationTermsSchema = z.object({
  mode: z.enum(["Negotiation", "Exchange"]),
  pendingProposal: conversationProposalSchema.nullable(),
  agreedPrice: z.number().int().nullable(),
  agreedListingRevisionId: z.string().uuid().nullable(),
  activeExchangeId: z.string().uuid().nullable(),
  exchangeIds: z.array(z.string().uuid()),
  locked: z.boolean(),
});

export const conversationEventSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  actorId: z.string().uuid(),
  kind: z.enum([
    "ModeProposed",
    "ModeAccepted",
    "PriceProposed",
    "PriceAccepted",
    "ProposalDeclined",
    "ExchangeLinked",
  ]),
  mode: z.enum(["Negotiation", "Exchange"]).nullable(),
  amount: z.number().int().nullable(),
  exchangeId: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export const purchaseConversationSchema = z.object({
  terms: conversationTermsSchema.nullable().optional(),
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  buyer: z.object({ id: z.string().uuid(), displayName: z.string() }),
  seller: z.object({ id: z.string().uuid(), displayName: z.string() }),
  version: z.number().int(),
  status: z.enum(["Active", "Expired", "Cancelled", "OrderCreated"]),
  expiresAt: z.string().nullable(),
  hasQuote: z.boolean(),
  quotePreview: z
    .object({
      destination: z.object({
        recipientName: z.string(),
        phone: z.string(),
        serviceAreaCode: z.literal("HCM-DEMO-v1"),
        localityCode: z.string(),
        detail: z.string(),
      }),
      shippingFee: z.number().int(),
      expiresAt: z.string(),
    })
    .nullable(),
  orderId: z.string().uuid().nullable(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
});

export const receiptSchema = z.object({
  id: z.string().uuid(),
  entityType: z.literal("PurchaseConversation"),
  entityId: z.string().uuid(),
  listingId: z.string().uuid(),
  version: z.number().int(),
  status: z.enum(["Active", "Expired", "Cancelled", "OrderCreated"]),
  expiresAt: z.string().nullable(),
  serverTime: z.string(),
});

export const orderReceiptSchema = z.object({
  id: z.string().uuid(),
  entityType: z.literal("Order"),
  entityId: z.string().uuid(),
  contextId: z.string().uuid(),
  version: z.number().int(),
  state: z.string(),
  paymentDeadline: z.string(),
  serverTime: z.string(),
  affectedListings: z.array(
    z.object({ id: z.string().uuid(), version: z.number().int() }),
  ),
});

export type PurchaseMessage = z.infer<typeof purchaseMessageSchema>;
export type PurchaseConversation = z.infer<typeof purchaseConversationSchema>;
export type ConversationEvent = z.infer<typeof conversationEventSchema>;
export type ConversationProposal = z.infer<typeof conversationProposalSchema>;
export type ConversationTerms = z.infer<typeof conversationTermsSchema>;

export type TermsProposalBody = {
  expectedVersion: number;
  kind: "Mode" | "Price" | "RequestExchange";
  mode?: "Negotiation" | "Exchange";
  amount?: number;
};

export type TermsResponseBody = {
  expectedVersion: number;
  proposalId: string;
  accept: boolean;
};
