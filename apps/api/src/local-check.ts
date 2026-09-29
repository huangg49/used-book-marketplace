import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { MongoClient } from 'mongodb';
import { validateEnvironment } from './config/environment.js';
import { pendingMigrations } from './database/mongo/migrate.js';
import { migrations } from './database/mongo/migrations/index.js';
import { MediaStorage } from './modules/media/media-storage.js';

// Read-only preflight. Never logs connection URLs, keys or provider/DB error bodies.
let failures = 0;
const pass = (message: string) => console.log(`PASS ${message}`);
const warn = (message: string) => console.log(`WARN ${message}`);
const fail = (message: string) => {
  failures++;
  console.error(`FAIL ${message}`);
};
let config: ConfigService | undefined;
try {
  config = new ConfigService(validateEnvironment(process.env));
  pass('API environment shape is valid.');
} catch {
  fail(
    'API configuration invalid. Check apps/api/.env against .env.example (database, signing secret, port, paired storage URL/key).',
  );
}
const requiredNode = JSON.parse(readFileSync('../../package.json', 'utf8'))
  .engines.node.replace('>=', '')
  .split('.')
  .map(Number) as number[];
const actualNode = process.versions.node.split('.').map(Number);
const comparison =
  actualNode
    .map((part, i) => part - (requiredNode[i] ?? 0))
    .find((value) => value !== 0) ?? 0;
if (comparison < 0)
  fail(
    `Node ${process.versions.node} is below the repository minimum. Use .nvmrc before reproducibility checks.`,
  );
else pass('Node meets the repository minimum.');
try {
  const clientEnv = parse(readFileSync('../mobile-react-native/.env'));
  const url = new URL(
    process.env.EXPO_PUBLIC_API_BASE_URL ??
      clientEnv.EXPO_PUBLIC_API_BASE_URL ??
      '',
  );
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.pathname.endsWith('/api/v1')
  )
    throw new Error();
  if (
    Object.keys(clientEnv).some((name) =>
      /SUPABASE_STORAGE_KEY|SERVICE_ROLE|JWT_ACCESS_SECRET|PAYMENT_SIMULATOR_SECRET|DATABASE_URL|MONGODB_/.test(
        name,
      ),
    )
  ) {
    fail(
      'Server configuration found in the RN env file. Remove it from the client; keep it only in apps/api/.env.',
    );
  } else
    pass(
      'RN API URL is valid; no known server-secret variable names in its env file.',
    );
  if (['localhost', '127.0.0.1'].includes(url.hostname))
    warn(
      'RN URL targets this machine. For Android emulator use 10.0.2.2; for a phone use the trusted LAN address.',
    );
} catch {
  fail(
    'RN environment missing/invalid. Set EXPO_PUBLIC_API_BASE_URL in apps/mobile-react-native/.env.',
  );
}
if (config) {
  const client = new MongoClient(config.get<string>('MONGODB_URL')!, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    const db = client.db();
    await db.command({ ping: 1 });
    pass('Configured MongoDB is reachable as the application user.');
    const hello = await db.command({ hello: 1 });
    if (!hello.setName)
      fail(
        'MongoDB is not a replica set member; transactions need one. Use the compose `mongo` service.',
      );
    const pending = await pendingMigrations(db);
    if (pending.length)
      fail(
        `${pending.length} of ${migrations.length} MongoDB migrations are pending or changed. Run pnpm db:migrate; do not drop the database.`,
      );
    else
      pass(
        `All ${migrations.length} repository migrations match the database checksums.`,
      );
    const queued = await db.collection('media_processing_jobs').countDocuments({
      finishedAt: null,
      availableAt: { $lt: new Date(Date.now() - 300000) },
    });
    if (queued)
      warn(
        `${queued} media jobs have waited over five minutes. Check pnpm dev:media and provider connectivity.`,
      );
    else
      pass('No overdue media jobs. This does not prove a worker is running.');
  } catch {
    fail(
      'Database check failed. Start MongoDB (pnpm infra:up), run pnpm db:bootstrap and pnpm db:migrate, then retry. Existing preview processes may use a different database override.',
    );
  } finally {
    await client.close().catch(() => {});
  }
  if (config.get<string>('SUPABASE_URL')) {
    try {
      await new MediaStorage(config).check();
      pass(
        'Live storage bucket is private and size-bounded (read-only check).',
      );
    } catch {
      fail(
        'Storage check failed. Run pnpm --filter @used-books/api media:check; verify project URL, server key, private bucket and exact byte limit.',
      );
    }
  } else
    warn(
      'Storage is not configured. Draft/auth APIs can run; real image upload cannot.',
    );
  try {
    const response = await fetch(
      `http://127.0.0.1:${config.get<number>('PORT')}/api/v1/health/ready`,
      { signal: AbortSignal.timeout(3000) },
    );
    const body = (await response.json()) as {
      status?: string;
      service?: string;
    };
    if (
      !response.ok ||
      body.status !== 'ok' ||
      body.service !== 'used-book-api'
    )
      throw new Error();
    pass(
      'Local API readiness endpoint responds; independently checked configured DB above.',
    );
  } catch {
    warn('Local API not ready. Start pnpm dev:api after database checks pass.');
  }
}
console.log(
  'Run API, worker and RN in separate terminals: pnpm dev:api / pnpm dev:media / pnpm dev:rn.',
);
process.exitCode = failures ? 1 : 0;
