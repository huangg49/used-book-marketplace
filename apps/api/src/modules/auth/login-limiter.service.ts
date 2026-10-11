import { createHmac } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoService } from '../../database/mongo/mongo.service.js';

const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class LoginLimiter {
  constructor(
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
  ) {}

  async consume(email: string, ip: string, scope = 'login') {
    const now = Date.now();
    const window = Math.floor(now / WINDOW_MS);
    const expiresAt = new Date((window + 1) * WINDOW_MS);
    const keys = [`email:${email}`, `ip:${ip}`]
      .map((identity) =>
        createHmac(
          'sha256',
          this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        )
          .update(scope === 'login' ? `${window}:${identity}` : `${scope}:${window}:${identity}`)
          .digest('hex'),
      )
      .sort();
    // Both counters move in one transaction, in sorted key order: concurrent
    // requests serialize on the first counter, so every request gets the same
    // rank on both (as the PostgreSQL row locks guaranteed).
    const counters = await this.mongo.tx(async (tx) => {
      const values = [];
      for (const key of keys)
        values.push(
          await tx.c.login_attempts.findOneAndUpdate(
            { _id: key },
            { $inc: { attempts: 1 }, $setOnInsert: { expiresAt } },
            { upsert: true, returnDocument: 'after' },
          ),
        );
      return values;
    });
    await this.mongo.c.login_attempts.deleteMany({
      expiresAt: { $lt: new Date(now) },
    });
    if (counters.some((counter) => (counter?.attempts ?? 0) > 5)) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message:
            scope === 'login' ? 'Bạn đã thử đăng nhập nhiều lần. Vui lòng thử lại sau 15 phút.' : 'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
        },
        429,
      );
    }
  }
}
