import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OrderExpiryWorker } from './modules/orders/order-expiry.service.js';
import { AuctionWorker } from './modules/auctions/auction-worker.service.js';
import { PurchaseExpiryWorker } from './modules/purchases/purchase-expiry.service.js';
import { ExchangeExpiryWorker } from './modules/exchanges/exchange-expiry.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
const worker = app.get(OrderExpiryWorker);
const auctions = app.get(AuctionWorker);
const purchases = app.get(PurchaseExpiryWorker);
const exchangeExpiry = app.get(ExchangeExpiryWorker);
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
try {
  while (!stopping) {
    const start = Date.now();
    try {
      const result = await worker.tick();
      if (process.argv.includes('--once') && result.failed)
        process.exitCode = 1;
      console.log(JSON.stringify({ event: 'orderExpirySweep', ...result }));
      if (result.failed || result.oldestLagSeconds > 120)
        console.error(
          'Order expiry backlog needs attention; pending work will retry.',
        );
      if (
        result.openPickupReviews > 0 ||
        result.openCarrierReviews > 0 ||
        result.openDeliveryReviews > 0
      )
        console.warn(
          'Open fulfillment verification tasks require custody review; funds and books remain held.',
        );
    } catch {
      console.error('Order expiry sweep failed; retrying next cycle.');
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    try {
      const result = await purchases.tick();
      if (process.argv.includes('--once') && result.failed) process.exitCode = 1;
      console.log(JSON.stringify({ event: 'purchaseConversationExpirySweep', ...result }));
    } catch {
      console.error('Purchase conversation expiry sweep failed; retrying next cycle.');
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    try {
      const result = await exchangeExpiry.tick();
      if (process.argv.includes('--once') && result.failed) process.exitCode = 1;
      console.log(JSON.stringify({ event: 'exchangeExpirySweep', ...result }));
    } catch {
      console.error('Exchange expiry sweep failed; retrying next cycle.');
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    // Auction close/payment/drop-off deadlines; a failure here never blocks
    // the Order sweep above and is retried next cycle.
    try {
      const result = await auctions.tick();
      if (process.argv.includes('--once') && result.failed)
        process.exitCode = 1;
      console.log(JSON.stringify({ event: 'auctionSweep', ...result }));
      // `failures` names each failed record (step, id, error class/message).
      if (result.failed || result.backedOff || result.oldestLagSeconds > 120)
        console.error(
          'Auction deadline backlog needs attention; failed records retry with backoff.',
        );
      if (result.onHold > 0)
        console.warn('Auctions on hold need an independent Admin decision.');
    } catch {
      console.error('Auction sweep failed; retrying next cycle.');
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    if (process.argv.includes('--once')) break;
    while (!stopping && Date.now() - start < 60000)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await app.close();
}
