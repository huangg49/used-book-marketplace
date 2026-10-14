import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { MongoClient } from 'mongodb';
import { bindCollections } from './database/mongo/collections.js';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? ''))
  throw new Error('Seed requires NODE_ENV=development or test.');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set DEV_SEED_PASSWORD to at least 12 characters.');
if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required.');

const CUSTOM_USERS = [
  { email: 'nguyendai@latlai.local', displayName: 'Nguyen Dai' },
  { email: 'nguyentu@latlai.local',  displayName: 'Nguyen Tu'  },
] as const;

const client = new MongoClient(process.env.MONGODB_URL);
try {
  await client.connect();
  const c = bindCollections(client.db());
  const passwordHash = await hash(password);

  for (const { email, displayName } of CUSTOM_USERS) {
    const now = new Date();
    const result = await c.users.updateOne(
      { emailNormalized: email },
      {
        $setOnInsert: {
          _id: randomUUID(),
          emailNormalized: email,
          displayName,
          passwordHash,
          status: 'ACTIVE' as const,
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
          roles: [{ role: 'MEMBER' as const, grantedAt: now }],
          lockSeq: 0,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      console.log(`Created : ${email} (${displayName})`);
    } else {
      console.log(`Existed : ${email} — không thay đổi`);
    }
  }

  console.log(`\nPassword cho cả 2 tài khoản: ${password}`);
  console.log('Login tại: http://localhost:5174/login');
} finally {
  await client.close();
}
