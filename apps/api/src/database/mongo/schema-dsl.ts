import type { Document, IndexDescription } from 'mongodb';

// Small helpers to write $jsonSchema validators and single-document $expr
// checks (the MongoDB replacement for PostgreSQL CHECK constraints).

export const UUID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
export const SHA256_PATTERN = '^[a-f0-9]{64}$';
export const HOUR_MS = 3_600_000;

type Schema = Record<string, unknown>;
const clean = (value: Schema) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

export const t = {
  uuid: (): Schema => ({ bsonType: 'string', pattern: UUID_PATTERN }),
  nuuid: (): Schema => ({
    bsonType: ['string', 'null'],
    pattern: UUID_PATTERN,
  }),
  str: (maxLength?: number, pattern?: string): Schema =>
    clean({ bsonType: 'string', maxLength, pattern }),
  nstr: (maxLength?: number, pattern?: string): Schema =>
    clean({ bsonType: ['string', 'null'], maxLength, pattern }),
  int: (minimum?: number, maximum?: number): Schema =>
    clean({ bsonType: 'int', minimum, maximum }),
  nint: (minimum?: number, maximum?: number): Schema =>
    clean({ bsonType: ['int', 'null'], minimum, maximum }),
  date: (): Schema => ({ bsonType: 'date' }),
  ndate: (): Schema => ({ bsonType: ['date', 'null'] }),
  bool: (): Schema => ({ bsonType: 'bool' }),
  nbool: (): Schema => ({ bsonType: ['bool', 'null'] }),
  enum: (...values: string[]): Schema => ({ bsonType: 'string', enum: values }),
  nenum: (...values: string[]): Schema => ({
    bsonType: ['string', 'null'],
    enum: [...values, null],
  }),
  object: (): Schema => ({ bsonType: 'object' }),
  nobject: (): Schema => ({ bsonType: ['object', 'null'] }),
  sha: (): Schema => ({ bsonType: 'string', pattern: SHA256_PATTERN }),
  nsha: (): Schema => ({
    bsonType: ['string', 'null'],
    pattern: SHA256_PATTERN,
  }),
  lockSeq: (): Schema => ({ bsonType: ['int', 'long'], minimum: 0 }),
};

// Every listed property is required (nullable columns are stored as null, never
// omitted) and unknown fields are rejected.
export function document(properties: Record<string, Schema>): Document {
  return {
    bsonType: 'object',
    required: Object.keys(properties),
    additionalProperties: false,
    properties,
  };
}

// $expr building blocks. Fields are always present, so `$eq: [field, null]`
// is an exact IS NULL test.
export const f = (name: string) => `$${name}`;
export const and = (...xs: unknown[]) => ({ $and: xs });
export const or = (...xs: unknown[]) => ({ $or: xs });
export const not = (x: unknown) => ({ $not: [x] });
export const eq = (a: unknown, b: unknown) => ({ $eq: [a, b] });
export const ne = (a: unknown, b: unknown) => ({ $ne: [a, b] });
export const gt = (a: unknown, b: unknown) => ({ $gt: [a, b] });
export const gte = (a: unknown, b: unknown) => ({ $gte: [a, b] });
export const lt = (a: unknown, b: unknown) => ({ $lt: [a, b] });
export const lte = (a: unknown, b: unknown) => ({ $lte: [a, b] });
export const isNull = (name: string) => eq(f(name), null);
export const notNull = (name: string) => ne(f(name), null);
export const oneOf = (x: unknown, values: unknown[]) => ({ $in: [x, values] });
export const between = (x: unknown, lo: unknown, hi: unknown) =>
  and(gte(x, lo), lte(x, hi));
export const plusMs = (name: string, ms: number) => ({ $add: [f(name), ms] });
// PostgreSQL btrim() trims spaces only; mirror that exactly.
export const trimmed = (name: string) => ({
  $trim: { input: f(name), chars: ' ' },
});
export const trimLen = (name: string) => ({ $strLenCP: trimmed(name) });
export const nonNullCount = (...names: string[]) => ({
  $size: {
    $filter: { input: names.map(f), cond: { $ne: ['$$this', null] } },
  },
});
const digit = (value: unknown, index: unknown) => ({
  $toInt: { $substrCP: [value, index, 1] },
});

// ISBN-13 check digit over a 13-digit string expression.
export function isbn13Valid(value: unknown) {
  const weighted = {
    $reduce: {
      input: { $range: [0, 12] },
      initialValue: 0,
      in: {
        $add: [
          '$$value',
          {
            $multiply: [
              digit(value, '$$this'),
              { $cond: [eq({ $mod: ['$$this', 2] }, 1), 3, 1] },
            ],
          },
        ],
      },
    },
  };
  return and(
    { $regexMatch: { input: value, regex: '^97[89][0-9]{10}$' } },
    eq(
      { $mod: [{ $subtract: [10, { $mod: [weighted, 10] }] }, 10] },
      digit(value, 12),
    ),
  );
}

// ISBN-10 with its mod-11 check (X = 10), as latlai_isbn13 accepted.
export function isbn10Valid(value: unknown) {
  const weighted = {
    $reduce: {
      input: { $range: [0, 10] },
      initialValue: 0,
      in: {
        $add: [
          '$$value',
          {
            $multiply: [
              { $subtract: [10, '$$this'] },
              {
                $cond: [
                  eq({ $substrCP: [value, '$$this', 1] }, 'X'),
                  10,
                  digit(value, '$$this'),
                ],
              },
            ],
          },
        ],
      },
    },
  };
  return and(
    { $regexMatch: { input: value, regex: '^[0-9]{9}[0-9X]$' } },
    eq({ $mod: [weighted, 11] }, 0),
  );
}

export type AccessClass =
  // find + insert only: the database refuses updates/deletes (immutability backstop).
  | 'appendOnly'
  // find + insert + update; deletes refused.
  | 'mutable'
  // find + insert + update + remove, only where the application deletes rows.
  | 'deletable'
  // find only: reference data written by migrations.
  | 'reference';

export interface CollectionSpec {
  name: string;
  schema: Document;
  expr?: Document;
  indexes: IndexDescription[];
  access: AccessClass;
}

export const unique = (
  key: IndexDescription['key'],
  name: string,
  partialFilterExpression?: Document,
): IndexDescription =>
  clean({
    key,
    name,
    unique: true,
    partialFilterExpression,
  }) as unknown as IndexDescription;
export const index = (
  key: IndexDescription['key'],
  name: string,
  partialFilterExpression?: Document,
): IndexDescription =>
  clean({ key, name, partialFilterExpression }) as unknown as IndexDescription;
// PostgreSQL UNIQUE allows many NULLs; MongoDB needs a partial filter for that.
export const uniqueWhenSet = (field: string, name: string) =>
  unique({ [field]: 1 }, name, { [field]: { $type: 'string' } });
