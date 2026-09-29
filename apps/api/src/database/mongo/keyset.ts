import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Document } from 'mongodb';
import { canonicalJson } from '../../common/canonical-json.js';
import { DomainError } from '../../modules/commands/domain-error.js';
import type { BoundCollection } from './collections.js';

// Keyset pagination over an aggregation pipeline whose output documents carry
// `_id` and `key`. Order is (key, _id) in one direction, so equal timestamps
// never skip or repeat rows. Cursors are signed and bound to the query scope.
//
// v2: MongoDB dates have millisecond precision and text keys compare by binary
// order of the stored normalized key. PostgreSQL (v1) cursors carried
// microsecond text and are rejected deliberately (400), never reinterpreted.
const CURSOR_DOMAIN = 'listing-cursor-v2\0';

export type KeyKind = 'time' | 'text' | 'number';
export interface KeysetOptions {
  kind: KeyKind;
  ascending: boolean;
  scope: unknown;
  limit: number;
  cursor?: string;
}

const invalidCursor = () =>
  new DomainError(
    400,
    'VALIDATION_ERROR',
    'Trang tiếp theo không hợp lệ. Hãy tải lại danh sách.',
  );

export class Keyset {
  constructor(private readonly secret: string) {}

  private sign(value: string) {
    return createHmac('sha256', this.secret)
      .update(CURSOR_DOMAIN + value)
      .digest('base64url');
  }

  private decode(cursor: string, binding: string, kind: KeyKind) {
    try {
      const [encoded, signature, ...extra] = cursor.split('.');
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
      ) as { scope?: unknown; id?: unknown; value?: unknown };
      if (
        decoded.scope !== binding ||
        typeof decoded.value !== 'string' ||
        typeof decoded.id !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(decoded.id)
      )
        throw new Error();
      let value: Date | number | string = decoded.value;
      if (kind === 'time') {
        value = new Date(decoded.value);
        if (
          Number.isNaN(value.getTime()) ||
          value.toISOString() !== decoded.value
        )
          throw new Error();
      } else if (kind === 'number') {
        value = Number(decoded.value);
        if (!Number.isSafeInteger(value) || String(value) !== decoded.value)
          throw new Error();
      }
      return { id: decoded.id, value };
    } catch {
      throw invalidCursor();
    }
  }

  async page<T extends Document>(
    collection: BoundCollection<T>,
    pipeline: Document[],
    options: KeysetOptions,
  ): Promise<{ ids: string[]; nextCursor: string | null; serverTime: string }> {
    const binding = createHash('sha256')
      .update(canonicalJson(options.scope))
      .digest('hex');
    const op = options.ascending ? '$gt' : '$lt';
    const stages = [...pipeline];
    if (options.cursor) {
      const { id, value } = this.decode(options.cursor, binding, options.kind);
      stages.push({
        $match: {
          $or: [{ key: { [op]: value } }, { key: value, _id: { [op]: id } }],
        },
      });
    }
    const direction = options.ascending ? 1 : -1;
    stages.push(
      { $sort: { key: direction, _id: direction } },
      { $limit: options.limit + 1 },
      { $project: { _id: 1, key: 1 } },
    );
    const rows = await collection
      .aggregate<{ _id: string; key: Date | number | string }>(stages)
      .toArray();
    const selected = rows.slice(0, options.limit),
      last = selected.at(-1);
    let nextCursor: string | null = null;
    if (rows.length > options.limit && last) {
      const value =
        last.key instanceof Date ? last.key.toISOString() : String(last.key);
      const payload = Buffer.from(
        canonicalJson({ scope: binding, id: last._id, value }),
      ).toString('base64url');
      nextCursor = payload + '.' + this.sign(payload);
    }
    return {
      ids: selected.map((row) => row._id),
      nextCursor,
      serverTime: new Date().toISOString(),
    };
  }
}
