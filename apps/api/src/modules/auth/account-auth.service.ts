import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, BadRequestException } from '@nestjs/common';
import { hash } from 'argon2';
import { MongoServerError } from 'mongodb';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import type {
  UserDoc,
  AuthActionTokenDoc,
} from '../../database/mongo/documents.js';
import { LoginLimiter } from './login-limiter.service.js';
import { AuthMailService } from './auth-mail.service.js';
import type { RegisterAccountDto } from './account-auth.dto.js';

const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const acknowledgement = {
  message:
    'Nếu email phù hợp với yêu cầu, bạn sẽ nhận được hướng dẫn. Kiểm tra hộp thư và thư rác; có thể gửi lại sau 60 giây.',
};
const eligibleForReset = (user: UserDoc) =>
  !!user.emailVerifiedAt &&
  ['ACTIVE', 'RESTRICTED', 'LOCKED'].includes(user.status);
const invalidLink = () =>
  new BadRequestException({
    code: 'INVALID_AUTH_LINK',
    message:
      'Liên kết đã hết hạn, đã được dùng hoặc không hợp lệ. Hãy yêu cầu một liên kết mới.',
  });

@Injectable()
export class AccountAuthService {
  constructor(
    private readonly mongo: MongoService,
    private readonly limiter: LoginLimiter,
    private readonly mail: AuthMailService,
  ) {}

  async register(body: RegisterAccountDto, ip: string) {
    this.mail.assertAvailable();
    await this.limiter.consume(body.email, ip, 'register');
    // Hash even for duplicates. Never replace an existing account's credentials.
    const passwordHash = await hash(body.password);
    try {
      await this.mongo.tx(async (tx) => {
        if (await tx.c.users.findOne({ emailNormalized: body.email })) return;
        const now = await tx.now();
        const user: UserDoc = {
          _id: randomUUID(),
          emailNormalized: body.email,
          passwordHash,
          displayName: body.displayName,
          status: 'PENDING_VERIFICATION',
          emailVerifiedAt: null,
          roles: [{ role: 'MEMBER', grantedAt: now }],
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        };
        await tx.c.users.insertOne(user);
        await tx.c.auth_events.insertOne({
          _id: randomUUID(),
          userId: user._id,
          action: 'Registered',
          createdAt: now,
        });
        await this.issue(tx, user, 'VerifyEmail', now);
      });
    } catch (error) {
      // Only the normalized-email race is a harmless duplicate registration.
      if (!(
        error instanceof MongoServerError &&
        error.code === 11000 &&
        error.keyPattern?.emailNormalized
      ))
        throw error;
    }
    return acknowledgement;
  }

  async requestLink(
    email: string,
    ip: string,
    purpose: AuthActionTokenDoc['purpose'],
  ) {
    this.mail.assertAvailable();
    await this.limiter.consume(email, ip, purpose);
    // Mail delivery is never awaited here; a minimum response time also masks
    // the ordinary database work difference for known/unknown addresses.
    await Promise.all([
      delay(150),
      this.mongo.tx(async (tx) => {
        const found = await tx.c.users.findOne({ emailNormalized: email });
        if (!found) return;
        await tx.lock('users', [found._id]);
        const user = await tx.c.users.findOne({ _id: found._id });
        if (
          !user ||
          (purpose === 'VerifyEmail'
            ? user.status !== 'PENDING_VERIFICATION' || !!user.emailVerifiedAt
            : !eligibleForReset(user))
        )
          return;
        const now = await tx.now();
        const latest = await tx.c.auth_action_tokens.findOne(
          { userId: user._id, purpose },
          { sort: { createdAt: -1 } },
        );
        if (latest && now.getTime() - latest.createdAt.getTime() < 60_000)
          return;
        await this.issue(tx, user, purpose, now);
      }),
    ]);
    return acknowledgement;
  }

  private async issue(
    tx: Tx,
    user: UserDoc,
    purpose: AuthActionTokenDoc['purpose'],
    now: Date,
  ) {
    await tx.c.auth_action_tokens.updateMany(
      { userId: user._id, purpose, consumedAt: null },
      { $set: { consumedAt: now } },
    );
    const raw = randomBytes(32).toString('base64url');
    const token: AuthActionTokenDoc = {
      _id: randomUUID(),
      userId: user._id,
      purpose,
      tokenHash: digest(raw),
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + (purpose === 'VerifyEmail' ? 30 : 15) * 60_000,
      ),
      consumedAt: null,
    };
    await tx.c.auth_action_tokens.insertOne(token);
    await this.mail.enqueue(
      tx,
      user._id,
      token._id,
      { to: user.emailNormalized, kind: purpose, token: raw },
      now,
      token.expiresAt,
    );
  }
  async verify(token: string, ip: string) {
    await this.limiter.consume(digest(token), ip, 'verify-token');
    await this.consume(token, 'VerifyEmail', async (tx, user, now) => {
      if (user.status !== 'PENDING_VERIFICATION' || user.emailVerifiedAt)
        throw invalidLink();
      await tx.c.users.updateOne(
        { _id: user._id },
        { $set: { status: 'ACTIVE', emailVerifiedAt: now, updatedAt: now } },
      );
      await tx.c.auth_events.insertOne({
        _id: randomUUID(),
        userId: user._id,
        action: 'EmailVerified',
        createdAt: now,
      });
    });
  }
  async reset(token: string, password: string, ip: string) {
    this.mail.assertAvailable();
    await this.limiter.consume(digest(token), ip, 'reset-token');
    const candidate = await this.mongo.c.auth_action_tokens.findOne({
      tokenHash: digest(token),
      purpose: 'ResetPassword',
      consumedAt: null,
    });
    if (!candidate) throw invalidLink();
    // Expiry is decided with Mongo $$NOW after the user lock in consume(),
    // never with the API host clock in this cheap pre-hash lookup.
    const passwordHash = await hash(password);
    await this.consume(token, 'ResetPassword', async (tx, user, now) => {
      if (!eligibleForReset(user)) throw invalidLink();
      await tx.c.users.updateOne(
        { _id: user._id },
        { $set: { passwordHash, updatedAt: now } },
      );
      // The user lock serializes login/refresh; session writes also conflict with revocation.
      await tx.c.auth_sessions.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: now }, $inc: { lockSeq: 1 } },
      );
      await tx.c.auth_events.insertOne({
        _id: randomUUID(),
        userId: user._id,
        action: 'PasswordReset',
        createdAt: now,
      });
      await this.mail.enqueue(
        tx,
        user._id,
        null,
        { to: user.emailNormalized, kind: 'PasswordChanged' },
        now,
        new Date(now.getTime() + 86400_000),
      );
    });
  }
  private async consume(
    token: string,
    purpose: AuthActionTokenDoc['purpose'],
    action: (tx: Tx, user: UserDoc, now: Date) => Promise<void>,
  ) {
    const found = await this.mongo.c.auth_action_tokens.findOne({
      tokenHash: digest(token),
      purpose,
    });
    if (!found) throw invalidLink();
    await this.mongo.tx(async (tx) => {
      await tx.lock('users', [found.userId]);
      const user = await tx.c.users.findOne({ _id: found.userId });
      const now = await tx.now();
      const current = await tx.c.auth_action_tokens.findOne({
        _id: found._id,
        purpose,
        tokenHash: digest(token),
        consumedAt: null,
        expiresAt: { $gt: now },
      });
      if (!user || !current) throw invalidLink();
      await action(tx, user, now);
      await tx.c.auth_action_tokens.updateMany(
        { userId: user._id, purpose, consumedAt: null },
        { $set: { consumedAt: now } },
      );
    });
  }
}
