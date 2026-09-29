import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { importPostgres } from './database/mongo/import/postgres-import.js';

// One-time PostgreSQL -> MongoDB import (MIG-06). Reads a consistent read-only
// snapshot from SOURCE_DATABASE_URL and writes into the freshly migrated
// MongoDB at MONGODB_MIGRATOR_URL. Never logs URLs, rows or personal data:
// the report holds counts, content hashes and integrity results only.
const source = process.env.SOURCE_DATABASE_URL;
const target = process.env.MONGODB_MIGRATOR_URL;
if (!source || !target) {
  console.error('Set SOURCE_DATABASE_URL and MONGODB_MIGRATOR_URL.');
  process.exit(1);
}
const reportPath = process.argv.find((a) => a.startsWith('--report='));
const pgClient = new pg.Client({ connectionString: source });
const mongo = new MongoClient(target, { serverSelectionTimeoutMS: 5000 });
try {
  await pgClient.connect();
  await mongo.connect();
  const report = await importPostgres(pgClient, mongo, mongo.db(), (line) =>
    console.log(line),
  );
  const ok = !report.mismatches.length && !report.integrity?.failures.length;
  const summary = JSON.stringify(
    { event: 'postgresImport', ok, ...report },
    null,
    2,
  );
  if (reportPath) writeFileSync(reportPath.slice('--report='.length), summary);
  console.log(summary);
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(
    `Import stopped: ${error instanceof Error ? error.message : 'unknown error'}. Drop the target database, migrate it again and re-run; the source was only read.`,
  );
  process.exitCode = 1;
} finally {
  await pgClient.end().catch(() => undefined);
  await mongo.close();
}
