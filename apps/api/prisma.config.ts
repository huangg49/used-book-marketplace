import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const localDatabaseUrl =
  'postgresql://usedbooks:usedbooks_dev@localhost:5432/usedbooks?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Code generation does not connect to the database. Keeping a local-only
    // default lets clean CI runners generate the client before compiling.
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
