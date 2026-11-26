import { Injectable } from '@nestjs/common';
import type { components } from '@used-books/api-contract';
import type { Filter } from 'mongodb';
import type { AuditEventDoc, UserDoc } from '../../database/mongo/documents.js';
import { DomainError, type Wire } from '../commands/domain-error.js';
import {
  MongoCommandService,
  requireActive,
  type Actor,
  type CurrentActor,
} from '../commands/mongo-command.service.js';
import { MongoPageService, regexLiteral } from '../commands/mongo-page.service.js';
import { redactReason, redactSnapshot } from './audit-redaction.js';

type EntityType = components['schemas']['AuditEntityType'];
type RoleCode = components['schemas']['RoleCode'];
type TargetField = Extract<keyof AuditEventDoc, `${string}Id`>;

// audit_events stores exactly one target field per row (baseline validator).
export const AUDIT_TARGETS: Record<EntityType, TargetField> = {
  Listing: 'listingId',
  Book: 'bookId',
  Media: 'mediaId',
  AddressBook: 'addressBookId',
  Quote: 'quoteId',
  Context: 'contextId',
  Topup: 'topupId',
  Point: 'pointId',
  Withdrawal: 'withdrawalId',
  SupportCase: 'supportCaseId',
  Account: 'accountId',
  Review: 'reviewId',
};
const ROLE_ORDER: RoleCode[] = ['MEMBER', 'STAFF', 'ADMIN', 'TEST_OPERATOR'];

export interface AuditQuery {
  limit: number;
  cursor?: string;
  actorRole?: 'Operations' | 'STAFF' | 'ADMIN' | 'All';
  actorId?: string;
  entityType?: EntityType;
  entityId?: string;
  action?: string;
  requestId?: string;
  eventId?: string;
  reason?: string;
  from?: string;
  to?: string;
}

function requireAdmin(actor: CurrentActor) {
  requireActive(actor);
  if (!actor.roles.some((r) => r.role === 'ADMIN'))
    throw new DomainError(403, 'FORBIDDEN', 'Chỉ quản trị viên được xem nhật ký hoạt động.');
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
  ) {}

  list(auth: Actor, query: AuditQuery) {
    return this.commands.read(auth, async (tx, actor): Promise<Wire['AuditEventPage']> => {
      requireAdmin(actor);
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      if (from && to && from > to)
        throw new DomainError(400, 'VALIDATION_ERROR', 'Thời gian bắt đầu phải trước thời gian kết thúc.');

      const match: Filter<AuditEventDoc> = {};
      const role = query.actorRole ?? 'Operations';
      if (role !== 'All') {
        const roles = role === 'Operations' ? ['STAFF', 'ADMIN'] : [role];
        const operators = await tx.c.users
          .find({ 'roles.role': { $in: roles } } as Filter<UserDoc>, { projection: { _id: 1 } })
          .toArray();
        const ids = operators.map((u) => u._id);
        match.actorId = query.actorId
          ? ids.includes(query.actorId) ? query.actorId : { $in: [] }
          : { $in: ids };
      } else if (query.actorId) match.actorId = query.actorId;

      if (query.entityType) {
        const field = AUDIT_TARGETS[query.entityType];
        (match as Record<string, unknown>)[field] = query.entityId ?? { $type: 'string' };
      } else if (query.entityId) {
        match.$or = Object.values(AUDIT_TARGETS).map((field) => ({ [field]: query.entityId }));
      }
      if (query.action) match.action = query.action;
      if (query.requestId) match.requestId = query.requestId;
      if (query.eventId) match._id = query.eventId;
      if (query.reason) match.reason = { $regex: regexLiteral(query.reason), $options: 'i' };
      if (from || to) match.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

      const { cursor, limit, ...filters } = query;
      const page = await this.pages.page(
        tx.c.audit_events,
        [{ $match: match }, { $project: { key: '$createdAt' } }],
        {
          kind: 'time',
          ascending: false,
          scope: { operation: 'listAuditEvents', actor: actor._id, filters: { ...filters, actorRole: role } },
          limit: Number(limit),
          cursor: typeof cursor === 'string' ? cursor : undefined,
        },
      );
      const rows = await tx.c.audit_events.find({ _id: { $in: page.ids } }).toArray();
      const byId = new Map(rows.map((r) => [r._id, r]));
      const actorIds = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
      const users = actorIds.length
        ? await tx.c.users
            .find({ _id: { $in: actorIds } }, { projection: { _id: 1, displayName: 1, roles: 1 } })
            .toArray()
        : [];
      const people = new Map(users.map((u) => [u._id, u]));

      return {
        items: page.ids.flatMap((id) => {
          const r = byId.get(id);
          if (!r) return [];
          const person = r.actorId ? people.get(r.actorId) : undefined;
          const before = redactSnapshot(r.before);
          const after = redactSnapshot(r.after);
          const target = (Object.entries(AUDIT_TARGETS) as [EntityType, TargetField][])
            .find(([, field]) => typeof r[field] === 'string');
          return [
            {
              id: r._id,
              createdAt: r.createdAt.toISOString(),
              action: r.action,
              actor: {
                kind: r.actorId ? ('User' as const) : ('System' as const),
                id: r.actorId,
                displayName: person?.displayName ?? null,
                roles: (person?.roles ?? [])
                  .map((x) => x.role as RoleCode)
                  .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
                systemActor: r.systemActor,
              },
              entity: target ? { type: target[0], id: r[target[1]] as string } : null,
              reason: redactReason(r.reason),
              requestId: r.requestId,
              receiptId: r.receiptId,
              before: before.snapshot,
              after: after.snapshot,
              redactedFields: before.redacted + after.redacted,
            },
          ];
        }),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
}
