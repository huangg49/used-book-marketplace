import { Injectable } from '@nestjs/common';
import type { components } from '@used-books/api-contract';
import type { Filter } from 'mongodb';
import type { UserDoc } from '../../database/mongo/documents.js';
import {
  MongoCommandService,
  admin,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoPageService,
  regexLiteral,
} from '../commands/mongo-page.service.js';

type OperationsUser = components['schemas']['OperationsUser'];
// PostgreSQL ordered the RoleCode enum by declaration, not alphabetically.
const ROLE_ORDER = ['MEMBER', 'STAFF', 'ADMIN', 'TEST_OPERATOR'];

@Injectable()
export class OperationsUsersService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly pages: MongoPageService,
  ) {}

  private async target(tx: Tx, id: string) {
    const user = await tx.c.users.findOne({ _id: id });
    if (!user) throw notFound();
    return user;
  }
  private project(user: UserDoc): OperationsUser {
    return {
      id: user._id,
      email: user.emailNormalized,
      displayName: user.displayName,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      roles: user.roles
        .map((r) => r.role)
        .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
  detail(auth: Actor, id: string) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['OperationsAccount']> => {
        admin(actor);
        const user = await this.target(tx, id),
          lock = user.administrativeLock;
        return {
          user: this.project(user),
          version: user.version ?? 1,
          lock: lock
            ? { ...lock, createdAt: lock.createdAt.toISOString() }
            : null,
        };
      },
    );
  }
  history(auth: Actor, id: string, query: Record<string, string | number>) {
    return this.commands.read(
      auth,
      async (tx, actor): Promise<Wire['AccountControlEventPage']> => {
        admin(actor);
        await this.target(tx, id);
        const page = await this.pages.page(
          tx.c.audit_events,
          [
            {
              $match: {
                accountId: id,
                action: { $in: ['lockUserAccount', 'unlockUserAccount'] },
              },
            },
            { $project: { key: '$createdAt' } },
          ],
          {
            kind: 'time',
            ascending: false,
            scope: {
              operation: 'listAccountControlHistory',
              actor: actor._id,
              target: id,
            },
            limit: Number(query.limit),
            cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
          },
        );
        const rows = await tx.c.audit_events
            .find({ _id: { $in: page.ids } })
            .toArray(),
          byId = new Map(rows.map((r) => [r._id, r]));
        return {
          items: page.ids.flatMap((id) => {
            const r = byId.get(id);
            return r
              ? [
                  {
                    id: r._id,
                    actorId: r.actorId!,
                    action:
                      r.action === 'lockUserAccount'
                        ? ('AccountLocked' as const)
                        : ('AccountUnlocked' as const),
                    fromStatus: r.before!.status as UserDoc['status'],
                    toStatus: r.after!.state as UserDoc['status'],
                    reason: r.reason!,
                    scope: 'NewTransactions' as const,
                    unlockCondition: r.after!.unlockCondition as string | null,
                    relatedReference: r.after!.relatedReference as
                      string | null,
                    createdAt: r.createdAt.toISOString(),
                  },
                ]
              : [];
          }),
          nextCursor: page.nextCursor,
          serverTime: page.serverTime,
        };
      },
    );
  }
  change(
    context: CommandContext,
    id: string,
    body: Wire['LockUserAccount'] | Wire['UnlockUserAccount'],
    locking: boolean,
  ) {
    return this.commands.runAccount(
      context,
      locking ? 'lockUserAccount' : 'unlockUserAccount',
      id,
      body,
      {
        discover: async () => [id],
        authorize: async (tx, actor) => {
          admin(actor);
          if (actor._id === id)
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Không thể tự khóa hoặc mở tài khoản của chính mình.',
            );
          return this.target(tx, id);
        },
        mutate: async (tx, _actor, user) => {
          if ((user.version ?? 1) !== body.expectedVersion) throw conflict();
          const now = await tx.now();
          let status: UserDoc['status'],
            control: {
              scope: 'NewTransactions';
              unlockCondition: string | null;
              relatedReference: string | null;
            };
          if (locking) {
            if (!['ACTIVE', 'RESTRICTED'].includes(user.status))
              throw invalidState(
                'Chỉ khóa tài khoản đang hoạt động hoặc hạn chế.',
              );
            const b = body as Wire['LockUserAccount'];
            status = 'LOCKED';
            const lock = {
              scope: 'NewTransactions' as const,
              restoreStatus: user.status as 'ACTIVE' | 'RESTRICTED',
              reason: b.reason,
              unlockCondition: b.unlockCondition,
              relatedReference: b.relatedReference,
              actorId: context.auth.user.id,
              createdAt: now,
            };
            await tx.c.users.updateOne(
              { _id: id },
              { $set: { administrativeLock: lock } },
            );
            control = lock;
          } else {
            if (user.status !== 'LOCKED')
              throw invalidState('Tài khoản hiện không bị khóa.');
            const b = body as Wire['UnlockUserAccount'];
            if (
              user.administrativeLock &&
              user.administrativeLock.restoreStatus !== b.restoreStatus
            )
              throw invalidState(
                'Phải khôi phục trạng thái được ghi trước khi khóa.',
              );
            status = b.restoreStatus;
            control = {
              scope: 'NewTransactions',
              unlockCondition: user.administrativeLock?.unlockCondition ?? null,
              relatedReference:
                user.administrativeLock?.relatedReference ?? null,
            };
            await tx.c.users.updateOne(
              { _id: id },
              { $unset: { administrativeLock: '' } },
            );
          }
          const version = (user.version ?? 1) + 1;
          await tx.c.users.updateOne(
            { _id: id },
            { $set: { status, version, updatedAt: now } },
          );
          return {
            entityType: 'UserAccount' as const,
            entityId: id,
            accountId: id,
            version,
            state: status,
            before: { status: user.status },
            reason: body.reason,
            accountControl: control,
            event: locking ? 'AccountLocked' : 'AccountUnlocked',
          };
        },
      },
    );
  }

  list(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      admin(actor);
      const q = typeof query.q === 'string' ? query.q.toLowerCase() : undefined;
      const status =
        typeof query.status === 'string' ? query.status : undefined;
      const role = typeof query.role === 'string' ? query.role : undefined;
      const filter: Filter<UserDoc> = {};
      if (q) {
        // ILIKE '%q%' on email or display name, case-insensitive.
        const pattern = { $regex: regexLiteral(q), $options: 'i' };
        filter.$or = [{ emailNormalized: pattern }, { displayName: pattern }];
      }
      if (status) filter.status = status as UserDoc['status'];
      if (role) filter['roles.role'] = role as UserDoc['roles'][number]['role'];
      const page = await this.pages.page(
        tx.c.users,
        [{ $match: filter }, { $project: { key: '$createdAt' } }],
        {
          kind: 'time',
          ascending: false,
          scope: {
            operation: 'listOperationsUsers',
            actor: actor._id,
            q: q ?? null,
            status: status ?? null,
            role: role ?? null,
          },
          limit: Number(query.limit),
          cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
        },
      );
      const users = await tx.c.users.find({ _id: { $in: page.ids } }).toArray();
      const byId = new Map(users.map((user) => [user._id, user]));
      return {
        items: page.ids.flatMap((id) => {
          const user = byId.get(id);
          if (!user) return [];
          const entry: OperationsUser = {
            id: user._id,
            email: user.emailNormalized,
            displayName: user.displayName,
            status: user.status,
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
            roles: user.roles
              .map(({ role }) => role)
              .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          };
          return [entry];
        }),
        nextCursor: page.nextCursor,
        serverTime: page.serverTime,
      };
    });
  }
}
