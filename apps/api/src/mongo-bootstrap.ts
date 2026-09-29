import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { mongoDatabaseName } from './database/mongo/transaction.js';
import { bootstrapRoles } from './database/mongo/roles.js';

// One-time/idempotent: creates the least-privilege app and migrator users in the
// application database. Run with a user administrator; secrets come from env.
const adminUrl = process.env.MONGODB_ADMIN_URL;
const database = process.env.MONGODB_DATABASE;
const app = process.env.MONGODB_APP_PASSWORD ?? '';
const migrator = process.env.MONGODB_MIGRATOR_PASSWORD ?? '';
if (!adminUrl || !database) {
  console.error('Set MONGODB_ADMIN_URL and MONGODB_DATABASE.');
  process.exit(1);
}
if (mongoDatabaseName(adminUrl) && mongoDatabaseName(adminUrl) !== 'admin')
  console.log('Note: roles are created in MONGODB_DATABASE, not the URL path.');
const client = new MongoClient(adminUrl, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  await bootstrapRoles(client.db(database), { app, migrator });
  console.log(`Roles and users are ready in ${database}.`);
} catch (error) {
  console.error(
    `Bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
