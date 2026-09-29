// Dedicated E2E process only. Never accepts a database not ending in _test.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module.js';
import { mongoDatabaseName } from '../../src/database/mongo/transaction.js';
import { OrderExpiryWorker } from '../../src/modules/orders/order-expiry.service.js';

// MONGODB_URL is the least-privilege app user on this run's E2E database,
// inherited from the parent test process (test/test-env.ts).
const url = process.env.MONGODB_URL ?? '';
if (
  process.env.NODE_ENV !== 'test' ||
  process.env.ORDER_WORKER_TEST !== '1' ||
  !mongoDatabaseName(url).endsWith('_test')
)
  throw new Error('Dedicated worker test environment required');
// Same startup as src/order-worker.ts (one --once sweep).
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const result = await app.get(OrderExpiryWorker).tick();
  if (result.failed) process.exitCode = 1;
  console.log(JSON.stringify(result));
} finally {
  await app.close();
}
