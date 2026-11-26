import type { Db } from 'mongodb';
import { index } from '../schema-dsl.js';

// FR-G05: the Admin activity log reads audit_events newest first and filters
// by actor, action or request ID. Indexes only; the append-only validator and
// existing rows are unchanged.
const indexes = [
  index({ createdAt: -1, _id: -1 }, 'audit_events_created_at_idx'),
  index({ actorId: 1, createdAt: -1 }, 'audit_events_actor_id_created_at_idx'),
  index({ action: 1, createdAt: -1 }, 'audit_events_action_created_at_idx'),
  index({ requestId: 1 }, 'audit_events_request_id_idx'),
];

export const auditActivityLogIndexesMigration = {
  id: '0092-audit-activity-log-indexes',
  definition: { collection: 'audit_events', indexes },
  async up(db: Db) {
    await db.collection('audit_events').createIndexes(indexes);
  },
};
