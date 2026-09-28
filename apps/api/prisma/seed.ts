import 'dotenv/config';
import { hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
  throw new Error('Demo seed requires NODE_ENV=development or test.');
}
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set DEV_SEED_PASSWORD to at least 12 characters.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    options: '-c timezone=UTC',
  }),
});
try {
  const passwordHash = await hash(password);
  for (const [role, name] of [
    ['MEMBER', 'Bạn đọc Lật lại'],
    ['STAFF', 'Nhân viên Lật lại'],
    ['ADMIN', 'Quản trị Lật lại'],
    ['TEST_OPERATOR', 'Kiểm thử Lật lại'],
  ] as const) {
    const emailNormalized = `${role.toLowerCase()}@latlai.local`;
    // Existing accounts and their passwords/roles are never silently reset.
    await db.user.upsert({
      where: { emailNormalized },
      update: {},
      create: {
        emailNormalized,
        displayName: name,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        roles: { create: { role } },
      },
    });
    console.log(`Ready: ${emailNormalized}`);
  }
} finally {
  await db.$disconnect();
}
