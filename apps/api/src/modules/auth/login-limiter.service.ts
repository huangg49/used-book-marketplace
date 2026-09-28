import { createHmac } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service.js';

const WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class LoginLimiter {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async consume(email: string, ip: string) {
    const now = Date.now();
    const window = Math.floor(now / WINDOW_MS);
    const expiresAt = new Date((window + 1) * WINDOW_MS);
    const keys = [`email:${email}`, `ip:${ip}`]
      .map((identity) =>
        createHmac(
          'sha256',
          this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        )
          .update(`${window}:${identity}`)
          .digest('hex'),
      )
      .sort();
    // Atomic increments survive concurrent requests and multiple API processes.
    const counters = await this.db.$transaction(
      keys.map((key) =>
        this.db.loginAttempt.upsert({
          where: { key },
          create: { key, expiresAt },
          update: { attempts: { increment: 1 } },
        }),
      ),
    );
    await this.db.loginAttempt.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    if (counters.some((counter) => counter.attempts > 5)) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message:
            'Bạn đã thử đăng nhập nhiều lần. Vui lòng thử lại sau 15 phút.',
        },
        429,
      );
    }
  }
}
