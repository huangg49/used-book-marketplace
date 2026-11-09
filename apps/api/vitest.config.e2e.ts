import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**'],
    globalSetup: ['./test/mongo-global-setup.ts'],
    setupFiles: ['./test/test-env.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    // Some integration specs reconcile the full retained ledger after earlier suites.
    testTimeout: 30_000,
  },
});
