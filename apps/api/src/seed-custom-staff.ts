import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { MongoClient } from 'mongodb';
import { bindCollections } from './database/mongo/collections.js';
import { HANDOVER_POINT_A } from './database/mongo/migrations/auction-constants.js';

if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required.');

const email = 'staff@gmail.com';
const password = 'Password123';
const displayName = 'Nhân viên (Staff)';

const client = new MongoClient(process.env.MONGODB_URL);
try {
  await client.connect();
  const c = bindCollections(client.db());
  const passwordHash = await hash(password);
  const now = new Date();

  const existing = await c.users.findOne({ emailNormalized: email.toLowerCase() });
  let userId: string;

  if (existing) {
    userId = existing._id;
    const hasStaffRole = existing.roles.some((r) => r.role === 'STAFF');
    const updatedRoles = hasStaffRole
      ? existing.roles
      : [...existing.roles, { role: 'STAFF' as const, grantedAt: now }];

    await c.users.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash,
          status: 'ACTIVE',
          roles: updatedRoles,
          updatedAt: now,
        },
      },
    );
    console.log(`Updated existing user: ${email}`);
  } else {
    userId = randomUUID();
    await c.users.insertOne({
      _id: userId,
      emailNormalized: email.toLowerCase(),
      displayName,
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
      roles: [
        { role: 'STAFF', grantedAt: now },
        { role: 'MEMBER', grantedAt: now },
      ],
      lockSeq: 0,
    });
    console.log(`Created new staff user: ${email}`);
  }

  // Assign staff to simulated point A for auction intake and inspection
  await c.point_staff_assignments.updateOne(
    { userId, pointId: HANDOVER_POINT_A },
    {
      $setOnInsert: {
        _id: randomUUID(),
        userId,
        pointId: HANDOVER_POINT_A,
        validFrom: now,
        validTo: null,
        createdAt: now,
      },
    },
    { upsert: true },
  );
  console.log(`Assigned ${email} to point ${HANDOVER_POINT_A} (HCM-DEMO-01)`);
} finally {
  await client.close();
}

