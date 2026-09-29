import { MongoServerError, type Db, type Document } from 'mongodb';
import { currentCollections } from './migrations/index.js';
import type { AccessClass, CollectionSpec } from './schema-dsl.js';

// Least-privilege database roles (MIG-02). The API/workers connect as
// `latlai_app`; only `latlai_migrator` may create collections, change
// validators or indexes. Append-only collections grant no update/remove, which
// replaces the PostgreSQL immutability triggers for every application writer.

export const APP_ROLE = 'latlai_app';
export const MIGRATOR_ROLE = 'latlai_migrator';

const ACTIONS: Record<AccessClass, string[]> = {
  appendOnly: ['find', 'insert'],
  mutable: ['find', 'insert', 'update'],
  deletable: ['find', 'insert', 'update', 'remove'],
  reference: ['find'],
};

export function appPrivileges(
  database: string,
  specs: CollectionSpec[] = currentCollections(),
): Document[] {
  return [
    ...specs.map((spec) => ({
      resource: { db: database, collection: spec.name },
      actions: ACTIONS[spec.access],
    })),
    // Startup check that the schema is current.
    {
      resource: { db: database, collection: '_migrations' },
      actions: ['find'],
    },
  ];
}

async function upsert(
  db: Db,
  create: Document,
  update: Document,
  duplicateCode: number,
) {
  try {
    await db.command(create);
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== duplicateCode)
      throw error;
    await db.command(update);
  }
}

// Idempotent: creates or updates roles and users in the application database.
// Must run with a user administrator; passwords come from the caller's env.
export async function bootstrapRoles(
  db: Db,
  passwords: { app: string; migrator: string },
) {
  const privileges = appPrivileges(db.databaseName);
  await upsert(
    db,
    { createRole: APP_ROLE, privileges, roles: [] },
    { updateRole: APP_ROLE, privileges, roles: [] },
    51002,
  );
  const migratorRoles = [
    { role: 'dbAdmin', db: db.databaseName },
    { role: 'readWrite', db: db.databaseName },
  ];
  await upsert(
    db,
    { createRole: MIGRATOR_ROLE, privileges: [], roles: migratorRoles },
    { updateRole: MIGRATOR_ROLE, privileges: [], roles: migratorRoles },
    51002,
  );
  for (const [user, role, pwd] of [
    ['latlai_app', APP_ROLE, passwords.app],
    ['latlai_migrator', MIGRATOR_ROLE, passwords.migrator],
  ] as const) {
    if (pwd.length < 16)
      throw new Error(`Password for ${user} must have at least 16 characters.`);
    await upsert(
      db,
      { createUser: user, pwd, roles: [{ role, db: db.databaseName }] },
      { updateUser: user, pwd, roles: [{ role, db: db.databaseName }] },
      51003,
    );
  }
}
