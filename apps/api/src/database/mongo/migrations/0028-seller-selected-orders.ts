import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import { and, document, eq, f, gte, isNull, notNull, or, t, unique } from '../schema-dsl.js';
import { applyCollectionSpecs } from './index.js';
import { purchaseConversationSpecs } from './0014-purchase-conversations.js';

export const sellerSelectedConversationSpecs = purchaseConversationSpecs.map((spec): CollectionSpec => {
  if (spec.name !== 'purchase_conversations') return spec;
  return {
    ...spec,
    schema: document({
      _id: t.uuid(), listingId: t.uuid(), listingVersion: t.int(1),
      buyerId: t.uuid(), sellerId: t.uuid(), version: t.int(1),
      status: t.enum('Active', 'Expired', 'Cancelled', 'OrderCreated'),
      expiresAt: t.ndate(), quoteId: t.nuuid(), orderId: t.nuuid(),
      closedAt: t.ndate(), createdAt: t.date(), updatedAt: t.date(), lockSeq: t.lockSeq(),
    }),
    expr: and(
      { $ne: ['$buyerId', '$sellerId'] },
      gte('$updatedAt', '$createdAt'),
      or(isNull('expiresAt'), { $gt: [f('expiresAt'), f('createdAt')] }),
      or(
        and(eq('$status', 'Active'), isNull('closedAt'), isNull('orderId')),
        and({ $in: ['$status', ['Expired', 'Cancelled']] }, notNull('closedAt'), isNull('orderId'), gte('$closedAt', '$createdAt')),
        and(eq('$status', 'OrderCreated'), notNull('closedAt'), notNull('orderId'), gte('$closedAt', '$createdAt')),
      ),
    ),
    indexes: [
      unique({ listingId: 1, buyerId: 1 }, 'purchase_conversations_one_active_buyer_listing', { status: 'Active' }),
      unique({ orderId: 1 }, 'purchase_conversations_order_id_key', { orderId: { $type: 'string' } }),
      { key: { buyerId: 1, updatedAt: -1, _id: -1 }, name: 'purchase_conversations_buyer_updated_idx' },
      { key: { sellerId: 1, updatedAt: -1, _id: -1 }, name: 'purchase_conversations_seller_updated_idx' },
      { key: { status: 1, expiresAt: 1, _id: 1 }, name: 'purchase_conversations_expiry_idx' },
    ],
  };
});

export const withSellerSelectedConversations = (spec: CollectionSpec) =>
  sellerSelectedConversationSpecs.find((row) => row.name === spec.name) ?? spec;

export const sellerSelectedOrdersMigration = {
  id: '0028-seller-selected-orders',
  definition: sellerSelectedConversationSpecs,
  async up(db: Db) {
    await db.collection('purchase_conversations').dropIndex('purchase_conversations_one_active_listing').catch((error: { code?: number }) => {
      if (error.code !== 27) throw error;
    });
    await applyCollectionSpecs(db, sellerSelectedConversationSpecs);
    await db.collection('purchase_conversations').updateMany(
      { quoteId: { $exists: false } },
      { $set: { quoteId: null, orderId: null } },
    );
  },
};
