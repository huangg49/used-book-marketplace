import { Injectable } from '@nestjs/common';
import type { components } from '@used-books/api-contract';
import { Prisma } from '../../generated/prisma/client.js';
import {
  CommandService,
  admin,
  type Actor,
} from '../commands/command.service.js';
import { likeLiteral } from '../commands/contract-input.service.js';
import { PageService } from '../commands/page.service.js';

type OperationsUser = components['schemas']['OperationsUser'];

@Injectable()
export class OperationsUsersService {
  constructor(
    private readonly commands: CommandService,
    private readonly pages: PageService,
  ) {}

  list(auth: Actor, query: Record<string, string | number>) {
    return this.commands.read(auth, async (tx, actor) => {
      admin(actor);
      const q = typeof query.q === 'string' ? query.q.toLowerCase() : undefined;
      const status = typeof query.status === 'string' ? query.status : undefined;
      const role = typeof query.role === 'string' ? query.role : undefined;
      const search = q
        ? Prisma.sql`AND (u.email_normalized ILIKE ${`%${likeLiteral(q)}%`} ESCAPE '\\' OR u.display_name ILIKE ${`%${likeLiteral(q)}%`} ESCAPE '\\')`
        : Prisma.empty;
      const roleFilter = role
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role::text=${role})`
        : Prisma.empty;
      const statusFilter = status
        ? Prisma.sql`AND u.status::text=${status}`
        : Prisma.empty;
      const page = await this.pages.select(tx, {
        from: Prisma.sql`users u`,
        id: Prisma.sql`u.id`,
        key: Prisma.sql`u.created_at`,
        kind: 'time',
        ascending: false,
        where: Prisma.sql`TRUE ${search} ${statusFilter} ${roleFilter}`,
        scope: {
          operation: 'listOperationsUsers',
          actor: actor.id,
          q: q ?? null,
          status: status ?? null,
          role: role ?? null,
        },
        limit: Number(query.limit),
        cursor: typeof query.cursor === 'string' ? query.cursor : undefined,
      });
      const users = await tx.user.findMany({
        where: { id: { in: page.ids } },
        include: { roles: { orderBy: { role: 'asc' } } },
      });
      const byId = new Map(users.map((user) => [user.id, user]));
      return {
        items: page.ids.flatMap((id) => {
          const user = byId.get(id);
          if (!user) return [];
          const entry: OperationsUser = {
            id: user.id,
            email: user.emailNormalized,
            displayName: user.displayName,
            status: user.status,
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
            roles: user.roles.map(({ role }) => role),
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
