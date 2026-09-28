import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DatabaseService } from './database/database.service.js';
import { LedgerService } from './modules/wallet/ledger.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const result = await app.get(DatabaseService).$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return app.get(LedgerService).reconcile(tx);
    },
    { isolationLevel: 'RepeatableRead', timeout: 30000 },
  );
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
