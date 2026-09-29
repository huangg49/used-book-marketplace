import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/mongo/**/*.mongo-spec.ts'],
    setupFiles: ['./test/mongo/mongo-test-env.ts'],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
