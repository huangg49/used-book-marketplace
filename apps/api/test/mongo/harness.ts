import { MongoClient } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import { bootstrapRoles } from '../../src/database/mongo/roles.js';
import { mongoDatabaseName } from '../../src/database/mongo/transaction.js';

// QA-only credentials for the per-database least-privilege users.
export const TEST_APP_PASSWORD = 'local-test-app-password-0001';
export const TEST_MIGRATOR_PASSWORD = 'local-test-migrator-password-01';

export function withCredentials(url: string, user: string, password: string) {
  const match =
    /^(mongodb(?:\+srv)?:\/\/)(?:[^@/]*@)?([^/]+)\/([^?]*)(?:\?(.*))?$/.exec(
      url,
    );
  if (!match) throw new Error('Unsupported MongoDB URL.');
  const [, scheme, hosts, database, query = ''] = match;
  const params = new URLSearchParams(query);
  params.set('authSource', decodeURIComponent(database));
  return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(password)}@${hosts}/${database}?${params}`;
}

export const testUrl = (database: string) => {
  const root = process.env.MONGO_TEST_URL!;
  if (!database.endsWith('_test'))
    throw new Error('Test database must end in _test.');
  return root.replace(/\/[^/?]*(\?|$)/, `/${database}$1`);
};

// Drops the QA database, recreates app/migrator users and applies migrations.
export async function prepareDatabase(rootUrl: string) {
  if (!mongoDatabaseName(rootUrl).endsWith('_test'))
    throw new Error('Refusing to prepare a database not ending in _test.');
  const root = new MongoClient(rootUrl);
  try {
    await root.connect();
    const db = root.db();
    await db.dropDatabase();
    await bootstrapRoles(db, {
      app: TEST_APP_PASSWORD,
      migrator: TEST_MIGRATOR_PASSWORD,
    });
  } finally {
    await root.close();
  }
  const migratorUrl = withCredentials(
    rootUrl,
    'latlai_migrator',
    TEST_MIGRATOR_PASSWORD,
  );
  const migrator = new MongoClient(migratorUrl);
  try {
    await migrator.connect();
    await migrate(migrator, migrator.db());
  } finally {
    await migrator.close();
  }
  return {
    appUrl: withCredentials(rootUrl, 'latlai_app', TEST_APP_PASSWORD),
    migratorUrl,
  };
}
