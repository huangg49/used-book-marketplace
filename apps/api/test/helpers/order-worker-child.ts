// Dedicated E2E process only. Never accepts the application database or public schema.
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { AppModule } from '../../src/app.module.js';
import { OrderExpiryWorker } from '../../src/modules/orders/order-expiry.service.js';

const url = process.env.TEST_DATABASE_URL!,
  schema = process.env.ORDER_WORKER_TEST_SCHEMA!;
if (
  process.env.NODE_ENV !== 'test' ||
  !new URL(url).pathname.endsWith('_test') ||
  !/^order_http_test_[a-f0-9]{32}$/.test(schema)
)
  throw new Error('Dedicated worker test environment required');
const adapter = await new PrismaPg({
  connectionString: url,
  options: `-c search_path=${schema},public -c timezone=UTC`,
}).connect();
const db = new PrismaClient({
  adapter: new PrismaPg(adapter.underlyingDriver(), { schema }),
});
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(DatabaseService)
  .useValue(db)
  .compile();
try {
  const result = await module.get(OrderExpiryWorker).tick();
  if (result.failed) process.exitCode = 1;
  console.log(JSON.stringify(result));
} finally {
  await module.close();
  await db.$disconnect();
  await adapter.dispose();
}
