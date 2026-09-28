import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MediaWorker } from './modules/media/media-worker.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
const worker = app.get(MediaWorker);
let sweepAt = 0;
try {
  while (!stopping) {
    try {
      if (Date.now() > sweepAt) {
        await worker.cleanup();
        sweepAt = Date.now() + 60_000;
      }
      if (await worker.tick()) continue;
    } catch {
      console.error('Media worker cycle failed; retrying.');
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
} finally {
  await app.close();
}
