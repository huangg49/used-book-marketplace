import type { Db } from 'mongodb';
import type { Document } from 'mongodb';
import { applyCollectionSpecs } from './index.js';
import type { CollectionSpec } from '../schema-dsl.js';
import { and, document, eq, f, gt, gte, isNull, notNull, or, t, unique } from '../schema-dsl.js';
import { settlementChangedSpecs } from './0012-point-order-settlement.js';
import { withSystemOperations } from './0008-auctions.js';

// This is a bounded negotiation, not checkout. Keeping it separate from Orders
// means it cannot accidentally create a payment hold or imply custody.
export const purchaseConversationSpecs: CollectionSpec[] = [
  {
    name: 'purchase_conversations',
    access: 'mutable',
    schema: document({
      _id: t.uuid(), listingId: t.uuid(), listingVersion: t.int(1),
      buyerId: t.uuid(), sellerId: t.uuid(), version: t.int(1),
      status: t.enum('Active', 'Expired', 'Cancelled'), expiresAt: t.date(),
      closedAt: t.ndate(), createdAt: t.date(), updatedAt: t.date(), lockSeq: t.lockSeq(),
    }),
    expr: and(
      { $ne: ['$buyerId', '$sellerId'] }, gt('$expiresAt', '$createdAt'), gte('$updatedAt', '$createdAt'),
      or(
        and(eq('$status', 'Active'), isNull('closedAt')),
        and({ $in: ['$status', ['Expired', 'Cancelled']] }, notNull('closedAt'), gte('$closedAt', '$createdAt')),
      ),
    ),
    indexes: [
      unique({ listingId: 1 }, 'purchase_conversations_one_active_listing', { status: 'Active' }),
      { key: { buyerId: 1, updatedAt: -1, _id: -1 }, name: 'purchase_conversations_buyer_updated_idx' },
      { key: { sellerId: 1, updatedAt: -1, _id: -1 }, name: 'purchase_conversations_seller_updated_idx' },
      { key: { status: 1, expiresAt: 1, _id: 1 }, name: 'purchase_conversations_expiry_idx' },
    ],
  },
  {
    name: 'purchase_messages', access: 'appendOnly',
    schema: document({ _id: t.uuid(), conversationId: t.uuid(), senderId: t.uuid(), body: t.str(1000), sentAt: t.date() }),
    expr: { $gte: [{ $strLenCP: '$body' }, 1] },
    indexes: [
      unique({ conversationId: 1, sentAt: 1, _id: 1 }, 'purchase_messages_conversation_sent_id_key'),
      { key: { conversationId: 1, sentAt: 1, _id: 1 }, name: 'purchase_messages_conversation_sent_idx' },
    ],
  },
];

// The earlier system workers only target workflow contexts. This later migration
// grants exactly one additional system operation, targeted at a listing, without
// loosening the principal rule for any other writer.
const extendSystemPrincipal = (spec: CollectionSpec, field: string) => {
  const changed = withSystemOperations(spec, field, [
    ['PurchaseConversationExpiry', 'expirePurchaseConversation'],
  ]);
  const expr = JSON.parse(JSON.stringify(changed.expr)) as Document;
  let replaced = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return void node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const row = node as Document;
    if (
      row.$ne && Array.isArray(row.$ne) && row.$ne[0] === '$contextId' && row.$ne[1] === null
    ) {
      Object.assign(row, or(notNull('contextId'), and(eq(f('systemActor'), 'PurchaseConversationExpiry'), notNull('listingId'))));
      delete row.$ne;
      replaced++;
      return;
    }
    Object.values(row).forEach(visit);
  };
  visit(expr);
  if (replaced !== 1) throw new Error(`Purchase principal target not found in ${spec.name}`);
  return { ...changed, expr };
};

// These two are last changed by migration 0012. Migration 0013 only creates
// or changes auction-domain collections, so it has no receipt/audit copy.
const latest = (name: string) => {
  const spec = settlementChangedSpecs.find((row) => row.name === name);
  if (!spec) throw new Error(`Missing current ${name} schema`);
  return spec;
};
export const purchaseConversationChangedSpecs = [
  extendSystemPrincipal(latest('mutation_receipts'), 'operation'),
  extendSystemPrincipal(latest('audit_events'), 'action'),
];

export const withPurchaseConversationChanges = (spec: CollectionSpec) =>
  purchaseConversationChangedSpecs.find((s) => s.name === spec.name) ?? spec;

export const purchaseConversationsMigration = {
  id: '0014-purchase-conversations', definition: { collections: purchaseConversationSpecs, changed: purchaseConversationChangedSpecs },
  async up(db: Db) {
    await applyCollectionSpecs(db, [...purchaseConversationSpecs, ...purchaseConversationChangedSpecs]);
  },
};
