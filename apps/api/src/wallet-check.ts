import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MongoService } from './database/mongo/mongo.service.js';
import { LedgerService } from './modules/wallet/ledger.service.js';

// Read-only reconciliation in one snapshot transaction; nothing is written, so
// the transaction simply commits empty.
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const result = await app
    .get(MongoService)
    .tx((tx) => app.get(LedgerService).reconcile(tx), { maxRetryMs: 30000 });
  console.log(JSON.stringify({ event: 'walletReconciliation', ...result }));
  if (!result.balanced) process.exitCode = 1;
} catch {
  console.error(
    'Wallet reconciliation failed. Stop financial operations and inspect journal/source integrity; do not edit posted entries.',
  );
  process.exitCode = 1;
} finally {
  await app.close();
}
