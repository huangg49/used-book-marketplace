import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.integration.ts"], fileParallelism: false, maxWorkers: 1, hookTimeout: 120000, testTimeout: 30000 } });
