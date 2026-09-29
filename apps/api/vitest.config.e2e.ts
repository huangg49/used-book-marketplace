import { defineConfig } from 'vitest/config';

// Suites whose module still runs on PostgreSQL during the MongoDB migration
// lane (docs/refactor/MONGODB_PLAN.md). Each package removes its suites from
// this list when they pass on MongoDB. *-migration suites test PostgreSQL SQL
// backstops and are replaced by test/mongo/schema.mongo-spec.ts plus the
// commit-time checks of the owning package.
const pendingMongoPort = [
  // MIG-04 catalog/listing/media/address
  'test/catalog-drafts.e2e-spec.ts',
  'test/listing-review.e2e-spec.ts',
  'test/listing-schema.e2e-spec.ts',
  'test/media.e2e-spec.ts',
  'test/addresses.e2e-spec.ts',
  'test/fulfillment-migration.e2e-spec.ts',
  // MIG-05 quote/order/wallet/shipment (gated on money/permission review)
  'test/quotes.e2e-spec.ts',
  'test/quote-migration.e2e-spec.ts',
  'test/orders.e2e-spec.ts',
  'test/order-migration.e2e-spec.ts',
  'test/obligations.e2e-spec.ts',
  'test/order-payment.e2e-spec.ts',
  'test/order-payment-migration.e2e-spec.ts',
  'test/order-preparation.e2e-spec.ts',
  'test/packaging-evidence.e2e-spec.ts',
  'test/shipments.e2e-spec.ts',
  'test/carrier-pickup.e2e-spec.ts',
  'test/delivery-overdue.e2e-spec.ts',
  'test/wallet.e2e-spec.ts',
  'test/wallet-migration.e2e-spec.ts',
];

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
