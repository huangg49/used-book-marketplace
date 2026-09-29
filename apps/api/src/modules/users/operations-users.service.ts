import { Injectable } from '@nestjs/common';
import type { components } from '@used-books/api-contract';
import type { Filter } from 'mongodb';
import type { UserDoc } from '../../database/mongo/documents.js';
import {
  MongoCommandService,
  admin,
  type Actor,
} from '../commands/mongo-command.service.js';
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
