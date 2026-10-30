import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OrderExpiryWorker } from './modules/orders/order-expiry.service.js';
import { AuctionWorker } from './modules/auctions/auction-worker.service.js';
import { PurchaseExpiryWorker } from './modules/purchases/purchase-expiry.service.js';
import { ExchangeExpiryWorker } from './modules/exchanges/exchange-expiry.service.js';
import { WalletExpiryWorker } from './modules/wallet/wallet-expiry.service.js';
import { ReviewQueries } from './modules/reviews/review-queries.service.js';

const AUCTION_CLOSE_INTERVAL_MS = 5000;
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
const worker = app.get(OrderExpiryWorker);
const auctions = app.get(AuctionWorker);
const purchases = app.get(PurchaseExpiryWorker);
const exchangeExpiry = app.get(ExchangeExpiryWorker);
const walletExpiry = app.get(WalletExpiryWorker);
const reviews = app.get(ReviewQueries);
let nextReviewSweep = 0;
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
    if (start >= nextReviewSweep) {
      try {
        const result = await reviews.publishDue();
        console.log(JSON.stringify({ event: 'reviewPublicationSweep', ...result }));
        nextReviewSweep = Date.now() + 60_000;
      } catch {
        console.error('Review publication sweep failed; retrying next cycle.');
        if (process.argv.includes('--once')) process.exitCode = 1;
      }
    }
    try {
      const result = await walletExpiry.tick();
      if (process.argv.includes('--once') && result.failed)
        process.exitCode = 1;
      if (result.failed)
        console.error(
          'Wallet payment expiry sweep failed; retrying next cycle.',
        );
    } catch {
      console.error('Wallet payment expiry sweep failed; retrying next cycle.');
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
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
    // ADR 0043: between full sweeps, close ended auctions every few seconds
    // so a 60-second Buy Now window ends on time, not up to a minute late.
    let lastClose = Date.now();
    while (!stopping && Date.now() - start < 60000) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (stopping || Date.now() - lastClose < AUCTION_CLOSE_INTERVAL_MS)
        continue;
      lastClose = Date.now();
      try {
        const result = await auctions.closeDue();
        if (result.processed || result.failed)
          console.log(
            JSON.stringify({ event: 'auctionCloseSweep', ...result }),
          );
        if (result.failed)
          console.error(
            'Auction close backlog needs attention; failed records retry with backoff.',
          );
      } catch {
        console.error('Auction close sweep failed; retrying shortly.');
      }
    }
  }
} finally {
  await app.close();
}
