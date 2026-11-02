import type { Db, Document } from 'mongodb';
import { document, index, t, type CollectionSpec } from '../schema-dsl.js';

export function withMemberProfiles(spec: CollectionSpec): CollectionSpec {
  if (spec.name === 'users')
    return {
      ...spec,
      schema: {
        ...spec.schema,
        properties: {
          ...spec.schema.properties,
          version: t.int(1),
          contactPhone: t.nstr(20),
          avatarId: t.nuuid(),
        },
      },
    };
  if (!['mutation_receipts', 'audit_events'].includes(spec.name)) return spec;
  const extend = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const next = node.map(extend);
      return next.includes('$listingId') &&
        next.includes('$topupId') &&
        !next.includes('$accountId')
        ? [...next, '$accountId']
        : next;
    }
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, extend(v)]),
      );
    return node;
  };
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: { ...spec.schema.properties, accountId: t.nuuid() },
    },
    expr: extend(spec.expr) as Document,
  };
}
export const memberProfileSpecs: CollectionSpec[] = [
  {
    name: 'profile_avatars',
    access: 'deletable',
    schema: document({
      _id: t.uuid(),
      ownerId: t.uuid(),
      version: t.int(1),
      lockSeq: t.lockSeq(),
      state: t.enum('Pending', 'Ready', 'Attached', 'Retired', 'Deleting'),
      mimeType: t.enum('image/jpeg', 'image/png', 'image/webp'),
      byteSize: t.int(1, 2000000),
      sha256: t.sha(),
      storageKey: t.str(120),
      inFlightUntil: t.ndate(),
      gcAt: t.ndate(),
      createdAt: t.date(),
      updatedAt: t.date(),
    }),
    indexes: [
      index({ ownerId: 1, state: 1 }, 'profile_avatar_owner_state_idx'),
      index({ gcAt: 1 }, 'profile_avatar_gc_idx'),
    ],
  },
  {
    name: 'member_email_changes',
    access: 'mutable',
    schema: document({
      _id: t.uuid(),
      userId: t.uuid(),
      version: t.int(1),
      lockSeq: t.lockSeq(),
      emailNormalized: t.str(254),
      previousEmailHash: t.sha(),
      passwordFingerprint: t.sha(),
      codeHash: t.sha(),
      attempts: t.int(0, 5),
      state: t.enum('Pending', 'Verified', 'Cancelled', 'Exhausted'),
      createdAt: t.date(),
      expiresAt: t.date(),
      gcAt: t.date(),
    }),
    indexes: [
      index({ userId: 1, createdAt: -1 }, 'member_email_change_user_idx'),
      {
        key: { gcAt: 1 },
        name: 'member_email_change_gc_idx',
        expireAfterSeconds: 0,
      },
    ],
  },
];
// Registry supplies the already loaded legacy shapes. This avoids adding a
// static registry -> migration -> legacy migration -> registry import cycle.
// The definition and checksum remain identical to the initial QA migration.
export function createMemberProfilesMigration(previous: CollectionSpec[]) {
  const changed = previous.map(withMemberProfiles);
  return {
    id: '0047-member-profiles',
    definition: {
      collections: [...changed, ...memberProfileSpecs],
      legacy: 'optional-profile-fields-default-version-one-no-backfill-v1',
    },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, [...changed, ...memberProfileSpecs]);
    },
  };
}
