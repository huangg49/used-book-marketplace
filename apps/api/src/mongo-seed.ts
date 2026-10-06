import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { MongoClient } from 'mongodb';
import { bindCollections } from './database/mongo/collections.js';
import { HANDOVER_POINT_A } from './database/mongo/migrations/auction-constants.js';

// Demo accounts for development/test. Existing accounts, passwords and roles
// are never silently reset (same rule as the former Prisma seed).
if (!['development', 'test'].includes(process.env.NODE_ENV ?? ''))
  throw new Error('Demo seed requires NODE_ENV=development or test.');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set DEV_SEED_PASSWORD to at least 12 characters.');
if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required.');
const client = new MongoClient(process.env.MONGODB_URL);
try {
  await client.connect();
  const c = bindCollections(client.db());
  const passwordHash = await hash(password);
  for (const [role, name] of [
    ['MEMBER', 'Bạn đọc Lật lại'],
    ['STAFF', 'Nhân viên Lật lại'],
    ['ADMIN', 'Quản trị Lật lại'],
    ['TEST_OPERATOR', 'Kiểm thử Lật lại'],
  ] as const) {
    const emailNormalized = `${role.toLowerCase()}@latlai.local`;
    const now = new Date();
    // Insert-if-absent: an existing account keeps its password and roles.
    await c.users.updateOne(
      { emailNormalized },
      {
        $setOnInsert: {
          _id: randomUUID(),
          emailNormalized,
          displayName: name,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
          roles: [{ role, grantedAt: now }],
          lockSeq: 0,
        },
      },
      { upsert: true },
    );
    console.log(`Ready: ${emailNormalized}`);
  }
  // The demo Staff account works at simulated point A (auction intake,
  // inspection and reclaim). Insert-if-absent; never extends or revokes.
  const staff = await c.users.findOne({
    emailNormalized: 'staff@latlai.local',
  });
  if (staff) {
    const now = new Date();
    await c.point_staff_assignments.updateOne(
      { userId: staff._id, pointId: HANDOVER_POINT_A },
      {
        $setOnInsert: {
          _id: randomUUID(),
          userId: staff._id,
          pointId: HANDOVER_POINT_A,
          validFrom: now,
          validTo: null,
          createdAt: now,
        },
      },
      { upsert: true },
    );
    console.log('Ready: staff@latlai.local assigned to HCM-DEMO-01');
  }
} finally {
  await client.close();
}
