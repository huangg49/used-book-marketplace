import { defineConfig } from 'vitest/config';

// Suites whose module still runs on PostgreSQL during the MongoDB migration
// lane (docs/refactor/MONGODB_PLAN.md). Each package removes its suites from
// this list when they pass on MongoDB. *-migration suites test PostgreSQL SQL
// backstops and are replaced by test/mongo/schema.mongo-spec.ts plus the
// commit-time checks of the owning package.
const pendingMongoPort: string[] = [];

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', ...pendingMongoPort],
    globalSetup: ['./test/mongo-global-setup.ts'],
    setupFiles: ['./test/test-env.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
