import type { Db } from 'mongodb';
import type { CollectionSpec } from '../schema-dsl.js';
import {
  and,
  document,
  eq,
  isNull,
  notNull,
  or,
  t,
  unique,
} from '../schema-dsl.js';
import { applyCollectionSpecs } from './index.js';

const proposal = document({
  id: t.uuid(),
  kind: t.enum('Mode', 'Price'),
  proposedById: t.uuid(),
  mode: t.nenum('Negotiation', 'Exchange'),
  amount: t.nint(10000, 1000000),
  listingRevisionId: t.uuid(),
  createdAt: t.date(),
});
export const conversationAgreementSpecs: CollectionSpec[] = [
  {
    name: 'conversation_terms',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      mode: t.enum('Negotiation', 'Exchange'),
      pendingProposal: { ...proposal, bsonType: ['object', 'null'] },
      agreedPrice: t.nint(10000, 1000000),
      agreedListingRevisionId: t.nuuid(),
      activeExchangeId: t.nuuid(),
      lockSeq: t.lockSeq(),
    }),
    expr: and(
      or(
        and(isNull('agreedPrice'), isNull('agreedListingRevisionId')),
        and(notNull('agreedPrice'), notNull('agreedListingRevisionId')),
      ),
      or(eq('$mode', 'Negotiation'), isNull('agreedPrice')),
      or(
        isNull('pendingProposal'),
        and(
          eq('$pendingProposal.kind', 'Mode'),
          notNull('pendingProposal.mode'),
          isNull('pendingProposal.amount'),
          { $ne: ['$mode', '$pendingProposal.mode'] },
        ),
        and(
          eq('$pendingProposal.kind', 'Price'),
          eq('$mode', 'Negotiation'),
          isNull('pendingProposal.mode'),
          notNull('pendingProposal.amount'),
        ),
      ),
    ),
    indexes: [
      unique({ activeExchangeId: 1 }, 'conversation_terms_exchange_key', {
        activeExchangeId: { $type: 'string' },
      }),
    ],
  },
  {
    name: 'conversation_events',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      conversationId: t.uuid(),
      actorId: t.uuid(),
      kind: t.enum(
        'ModeProposed',
        'ModeAccepted',
        'PriceProposed',
        'PriceAccepted',
        'ProposalDeclined',
        'ExchangeLinked',
      ),
      mode: t.nenum('Negotiation', 'Exchange'),
      amount: t.nint(10000, 1000000),
      exchangeId: t.nuuid(),
      createdAt: t.date(),
    }),
    indexes: [
      {
        key: { conversationId: 1, createdAt: 1, _id: 1 },
        name: 'conversation_events_timeline_idx',
      },
    ],
  },
  {
    name: 'conversation_exchange_links',
    access: 'appendOnly',
    schema: document({
      _id: t.uuid(),
      conversationId: t.uuid(),
      createdAt: t.date(),
    }),
    indexes: [
      {
        key: { conversationId: 1, createdAt: 1 },
        name: 'conversation_exchange_links_history_idx',
      },
    ],
  },
];
// Additive: historical conversation/message/order snapshots are left intact.
export const conversationAgreementsMigration = {
  id: '0032-conversation-agreements',
  definition: conversationAgreementSpecs,
  async up(db: Db) {
    await applyCollectionSpecs(db, conversationAgreementSpecs);
  },
};
