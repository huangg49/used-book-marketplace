import { z } from 'zod'
import { session } from '../lib/session'

export const purchaseMessageSchema = z.object({ id: z.string().uuid(), conversationId: z.string().uuid(), senderId: z.string().uuid(), body: z.string().min(1).max(1000), sentAt: z.string() })
export const purchaseConversationSchema = z.object({ id: z.string().uuid(), listingId: z.string().uuid(), buyer: z.object({ id: z.string().uuid(), displayName: z.string() }), seller: z.object({ id: z.string().uuid(), displayName: z.string() }), version: z.number().int(), status: z.enum(['Active', 'Expired', 'Cancelled']), expiresAt: z.string(), createdAt: z.string(), closedAt: z.string().nullable() })
const receiptSchema = z.object({ id: z.string().uuid(), entityType: z.literal('PurchaseConversation'), entityId: z.string().uuid(), listingId: z.string().uuid(), version: z.number().int(), status: z.enum(['Active', 'Expired', 'Cancelled']), expiresAt: z.string(), serverTime: z.string() })
export type PurchaseMessage = z.infer<typeof purchaseMessageSchema>
export type PurchaseConversation = z.infer<typeof purchaseConversationSchema>
export function startPurchaseConversation(listingId: string, expectedVersion: number, key = crypto.randomUUID()) { return session.request(`/listings/${listingId}/purchase-conversations`, receiptSchema, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ expectedVersion }) }) }
export function getPurchaseConversations() { return session.request('/me/purchase-conversations', z.array(purchaseConversationSchema)) }
export function getPurchaseMessages(conversationId: string) { return session.request(`/me/purchase-conversations/${conversationId}/messages`, z.array(purchaseMessageSchema)) }
