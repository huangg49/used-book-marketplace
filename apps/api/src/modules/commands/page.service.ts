import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { canonicalJson, type Tx } from './command.service.js';
import { DomainError } from './domain-error.js';

@Injectable()
export class PageService {
  constructor(private readonly config: ConfigService) {}
  private sign(value: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update('listing-cursor-v1\0' + value)
      .digest('base64url');
  }
  async select(
    tx: Tx,
    options: {
      from: Prisma.Sql;
      id: Prisma.Sql;
      key: Prisma.Sql;
      kind: 'time' | 'text' | 'number';
      where: Prisma.Sql;
      ascending: boolean;
      scope: unknown;
      limit: number;
      cursor?: string;
    },
  ) {
    const binding = createHash('sha256')
      .update(canonicalJson(options.scope))
      .digest('hex');
    let boundary = Prisma.empty;
    if (options.cursor) {
      try {
        const [encoded, signature, ...extra] = options.cursor.split('.');
        if (extra.length || !encoded || !signature) throw new Error();
        const expected = Buffer.from(this.sign(encoded)),
          actual = Buffer.from(signature);
        if (
          expected.length !== actual.length ||
          !timingSafeEqual(expected, actual)
        )
          throw new Error();
        const decoded = JSON.parse(
          Buffer.from(encoded, 'base64url').toString('utf8'),
        );
        if (
          decoded.scope !== binding ||
          typeof decoded.value !== 'string' ||
          !/^[0-9a-f-]{36}$/.test(decoded.id)
        )
          throw new Error();
        const operator = options.ascending ? Prisma.sql`>` : Prisma.sql`<`;
        const value =
          options.kind === 'time'
            ? Prisma.sql`${decoded.value}::timestamptz`
            : options.kind === 'number'
              ? Prisma.sql`${decoded.value}::integer`
              : Prisma.sql`${decoded.value}::text`;
        boundary = Prisma.sql`AND (${options.key},${options.id}) ${operator} (${value},${decoded.id}::uuid)`;
      } catch {
        throw new DomainError(
          400,
          'VALIDATION_ERROR',
          'Trang tiếp theo không hợp lệ. Hãy tải lại danh sách.',
        );
      }
    }
    const direction = options.ascending ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    // SQL text preserves PostgreSQL microseconds; JS Date would lose cursor precision.
    const rows = await tx.$queryRaw<{ id: string; value: string }[]>(
      Prisma.sql`SELECT ${options.id} AS id,(${options.key})::text AS value FROM ${options.from} WHERE ${options.where} ${boundary} ORDER BY ${options.key} ${direction},${options.id} ${direction} LIMIT ${options.limit + 1}`,
    );
    const selected = rows.slice(0, options.limit),
      last = selected.at(-1);
    let nextCursor: string | null = null;
    if (rows.length > options.limit && last) {
      const payload = Buffer.from(
        canonicalJson({ scope: binding, ...last }),
      ).toString('base64url');
      nextCursor = payload + '.' + this.sign(payload);
    }
    return {
      ids: selected.map((row) => row.id),
      nextCursor,
      serverTime: new Date().toISOString(),
    };
  }
}
