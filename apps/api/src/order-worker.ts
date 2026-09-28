import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OrderExpiryWorker } from './modules/orders/order-expiry.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
const worker = app.get(OrderExpiryWorker);
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
    if (process.argv.includes('--once')) break;
    while (!stopping && Date.now() - start < 60000)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await app.close();
}
