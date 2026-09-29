import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MongoService } from './database/mongo/mongo.service.js';
import { checkIntegrity } from './integrity/integrity.js';

// Read-only whole-database integrity sweep (all commit-time invariants plus
// simulated-capital conservation). Prints counts and aggregate ids only.
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const report = await app
    .get(MongoService)
    .tx((tx) => checkIntegrity(tx), { maxRetryMs: 30000 });
  console.log(JSON.stringify({ event: 'integrityCheck', ...report }));
  if (report.failures.length) process.exitCode = 1;
} catch {
  console.error('Integrity check could not complete; nothing was changed.');
  process.exitCode = 1;
} finally {
  await app.close();
}
