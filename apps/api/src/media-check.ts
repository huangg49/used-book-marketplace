import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { validateEnvironment } from './config/environment.js';
import { MediaStorage, digest } from './modules/media/media-storage.js';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// Read-only by default. --probe writes and deletes one explicitly named temporary image.
let stage = 'environment validation';
try {
  const missing = ['SUPABASE_URL', 'SUPABASE_STORAGE_KEY'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length) {
    console.error(
      `Missing configuration: ${missing.join(', ')}. Save these values in apps/api/.env, then run this command from the repository root with pnpm --filter @used-books/api. Never paste server keys into chat or client env files.`,
    );
    throw new Error();
  }
  const config = new ConfigService(validateEnvironment(process.env));
  const storage = new MediaStorage(config);
  stage = 'private bucket and upload-limit check';
  await storage.check();
  console.log(
    'Storage connected; bucket is private and upload size is bounded.',
  );
  if (process.argv.includes('--probe')) {
    const key = `probe/${randomUUID()}.png`;
    let cleanupFailed = false;
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    try {
      stage = 'probe upload';
      await storage.put(key, bytes, 'image/png');
      stage = 'authenticated read and integrity check';
      if (digest(await storage.read(key, bytes.length)) !== digest(bytes))
        throw new Error();
      stage = 'signed read';
      const signed = await storage.signedRead(key);
      const response = await fetch(signed.url, {
        signal: AbortSignal.timeout(15000),
      });
      if (
        !response.ok ||
        digest(new Uint8Array(await response.arrayBuffer())) !== digest(bytes)
      )
        throw new Error();
      stage = 'anonymous access denial';
      const anonymous = await fetch(
        `${config.get<string>('SUPABASE_URL')}/storage/v1/object/public/${config.get<string>('SUPABASE_MEDIA_BUCKET')}/${key}`,
        { signal: AbortSignal.timeout(15000) },
      );
      if (anonymous.ok) throw new Error();
    } finally {
      try {
        await storage.remove([key]);
      } catch {
        cleanupFailed = true;
        console.error(
          `Probe cleanup failed; remove only this temporary object: ${key}`,
        );
      }
    }
    if (cleanupFailed) {
      stage = 'probe cleanup';
      throw new Error();
    }
    console.log(
      'Live storage probe passed: create, read, signed read, anonymous denial and probe cleanup.',
    );
  }
} catch {
  console.error(
    `Storage check failed at ${stage}. Check private server configuration, bucket permissions, limits and connectivity. Credentials and remote error bodies were not logged.`,
  );
  process.exitCode = 1;
}
