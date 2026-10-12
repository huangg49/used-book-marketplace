import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import { MongoServerError } from 'mongodb';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import type {
  UserDoc,
  AuthActionTokenDoc,
  AuthOtpChallengeDoc,
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
    private readonly config: ConfigService,
  ) {}

  async register(body: RegisterAccountDto, ip: string, otp = false) {
    this.mail.assertAvailable();
    await this.limiter.consume(body.email, ip, 'register');
    // Hash even for duplicates. Never replace an existing account's credentials.
    const passwordHash = await hash(body.password);
    const challengeId = randomUUID();
    try {
      await this.mongo.tx(async (tx) => {
        if (await tx.c.users.findOne({ emailNormalized: body.email })) {
          if (otp)
            await this.issueOtp(
              tx,
              null,
              body.email,
              'VerifyEmail',
              challengeId,
              await tx.now(),
            );
          return;
        }
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
        if (otp)
          await this.issueOtp(
            tx,
            user,
            body.email,
            'VerifyEmail',
            challengeId,
            now,
          );
        else await this.issue(tx, user, 'VerifyEmail', now);
      });
    } catch (error) {
      // Only the normalized-email race is a harmless duplicate registration.
      if (!(
        error instanceof MongoServerError &&
        error.code === 11000 &&
        error.keyPattern?.emailNormalized
      ))
        throw error;
      if (otp)
        await this.mongo.tx(async (tx) => {
          await this.issueOtp(
            tx,
            null,
            body.email,
            'VerifyEmail',
            challengeId,
            await tx.now(),
          );
        });
    }
    return otp ? this.otpAcknowledgement(challengeId) : acknowledgement;
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
        if (await this.otpCooldown(tx, user._id, purpose, now)) return;
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
    await tx.c.auth_otp_challenges.updateMany(
      { userId: user._id, purpose, consumedAt: null },
      { $set: { consumedAt: now } },
    );
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
      await tx.c.auth_otp_challenges.updateMany(
        { userId: user._id, purpose, consumedAt: null },
        { $set: { consumedAt: now } },
      );
    });
  }

  private otpAcknowledgement(challengeId: string) {
    return {
      challengeId,
      expiresIn: 300,
      resendAfter: 60,
      message:
        'Nếu email phù hợp, bạn sẽ nhận được mã 6 số. Kiểm tra cả thư rác. Mã có hiệu lực 5 phút.',
    };
  }
  // Six-digit codes must not be stored with an unkeyed digest: they have only
  // one million possibilities. Purpose + random challenge bind this HMAC.
  private otpDigest(value: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('AUTH_MAIL_ENCRYPTION_KEY'),
    )
      .update('latlai:auth-otp:v1:')
      .update(value)
      .digest('hex');
  }
  private codeMatches(row: AuthOtpChallengeDoc, code: string) {
    return timingSafeEqual(
      Buffer.from(row.codeHash, 'hex'),
      Buffer.from(this.otpDigest(`${row._id}:${row.purpose}:${code}`), 'hex'),
    );
  }
  private async otpCooldown(
    tx: Tx,
    userId: string,
    purpose: AuthOtpChallengeDoc['purpose'],
    now: Date,
  ) {
    const last = await tx.c.auth_otp_challenges.findOne(
      { userId, purpose },
      { sort: { createdAt: -1 } },
    );
    return !!last && now.getTime() - last.createdAt.getTime() < 60_000;
  }
  private async issueOtp(
    tx: Tx,
    user: UserDoc | null,
    email: string,
    purpose: AuthOtpChallengeDoc['purpose'],
    challengeId: string,
    now: Date,
  ) {
    const code = randomInt(1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + 300_000);
    if (user) {
      await tx.c.auth_otp_challenges.updateMany(
        { userId: user._id, purpose, consumedAt: null },
        { $set: { consumedAt: now } },
      );
      await tx.c.auth_action_tokens.updateMany(
        { userId: user._id, purpose, consumedAt: null },
        { $set: { consumedAt: now } },
      );
    }
    await tx.c.auth_otp_challenges.insertOne({
      _id: challengeId,
      userId: user?._id ?? null,
      emailHash: this.otpDigest(`email:${email}`),
      purpose,
      codeHash: this.otpDigest(`${challengeId}:${purpose}:${code}`),
      attempts: 0,
      lockSeq: 0,
      createdAt: now,
      expiresAt,
      consumedAt: null,
    });
    if (user)
      await this.mail.enqueue(
        tx,
        user._id,
        null,
        { to: user.emailNormalized, kind: purpose, code, challengeId },
        now,
        expiresAt,
      );
  }
  async requestOtp(
    email: string,
    purpose: AuthOtpChallengeDoc['purpose'],
    ip: string,
  ) {
    this.mail.assertAvailable();
    await this.limiter.consume(email, ip, purpose);
    const challengeId = randomUUID();
    await Promise.all([
      delay(150),
      this.mongo.tx(async (tx) => {
        const found = await tx.c.users.findOne({ emailNormalized: email });
        if (found) await tx.lock('users', [found._id]);
        const user = found
          ? await tx.c.users.findOne({ _id: found._id })
          : null;
        const now = await tx.now();
        let eligible =
          !!user &&
          (purpose === 'VerifyEmail'
            ? user.status === 'PENDING_VERIFICATION' && !user.emailVerifiedAt
            : eligibleForReset(user));
        if (user && eligible) {
          const link = await tx.c.auth_action_tokens.findOne(
            { userId: user._id, purpose },
            { sort: { createdAt: -1 } },
          );
          eligible =
            !(link && now.getTime() - link.createdAt.getTime() < 60_000) &&
            !(await this.otpCooldown(tx, user._id, purpose, now));
        }
        // Never reveal or invalidate the genuine challenge on a cooldown request.
        // Decoys have the same expiry, wrong-attempt budget and generic response.
        await this.issueOtp(
          tx,
          eligible ? user : null,
          email,
          purpose,
          challengeId,
          now,
        );
      }),
    ]);
    return this.otpAcknowledgement(challengeId);
  }
  async consumeOtp(
    body: { challengeId: string; code: string },
    purpose: AuthOtpChallengeDoc['purpose'],
    ip: string,
    password?: string,
  ) {
    if (purpose === 'ResetPassword') this.mail.assertAvailable();
    await this.limiter.consume(body.challengeId, ip, 'otp-code');
    const found = await this.mongo.c.auth_otp_challenges.findOne({
      _id: body.challengeId,
    });
    let passwordHash: string | undefined;
    if (
      password &&
      found &&
      found.purpose === purpose &&
      !found.consumedAt &&
      found.attempts < 5 &&
      this.codeMatches(found, body.code)
    )
      passwordHash = await hash(password);
    const result = await this.mongo.tx(
      async (tx): Promise<'ok' | 'invalid' | 'exhausted'> => {
        if (!found) return 'invalid';
        if (found.userId) await tx.lock('users', [found.userId]);
        await tx.lock('auth_otp_challenges', [found._id]);
        const row = await tx.c.auth_otp_challenges.findOne({ _id: found._id });
        const now = await tx.now();
        if (!row || row.purpose !== purpose || row.expiresAt <= now)
          return 'invalid';
        if (row.attempts >= 5) return 'exhausted';
        if (row.consumedAt) return 'invalid';
        if (!this.codeMatches(row, body.code) || !row.userId) {
          const attempts = row.attempts + 1;
          await tx.c.auth_otp_challenges.updateOne(
            { _id: row._id },
            {
              $set: {
                attempts,
                ...(attempts === 5 ? { consumedAt: now } : {}),
              },
            },
          );
          return attempts === 5 ? 'exhausted' : 'invalid';
        }
        const user = await tx.c.users.findOne({ _id: row.userId });
        if (
          !user ||
          (purpose === 'VerifyEmail'
            ? user.status !== 'PENDING_VERIFICATION' || !!user.emailVerifiedAt
            : !eligibleForReset(user))
        )
          return 'invalid';
        if (purpose === 'VerifyEmail') {
          await tx.c.users.updateOne(
            { _id: user._id },
            {
              $set: { status: 'ACTIVE', emailVerifiedAt: now, updatedAt: now },
            },
          );
        } else {
          if (!passwordHash) return 'invalid';
          await tx.c.users.updateOne(
            { _id: user._id },
            { $set: { passwordHash, updatedAt: now } },
          );
          await tx.c.auth_sessions.updateMany(
            { userId: user._id, revokedAt: null },
            { $set: { revokedAt: now }, $inc: { lockSeq: 1 } },
          );
          await this.mail.enqueue(
            tx,
            user._id,
            null,
            { to: user.emailNormalized, kind: 'PasswordChanged' },
            now,
            new Date(now.getTime() + 86400_000),
          );
        }
        await tx.c.auth_events.insertOne({
          _id: randomUUID(),
          userId: user._id,
          action: purpose === 'VerifyEmail' ? 'EmailVerified' : 'PasswordReset',
          createdAt: now,
        });
        await tx.c.auth_otp_challenges.updateMany(
          { userId: user._id, purpose, consumedAt: null },
          { $set: { consumedAt: now } },
        );
        await tx.c.auth_action_tokens.updateMany(
          { userId: user._id, purpose, consumedAt: null },
          { $set: { consumedAt: now } },
        );
        return 'ok';
      },
    );
    // Throw only AFTER the transaction commits, or wrong-attempt increments
    // would roll back and allow unlimited guesses.
    if (result !== 'ok')
      throw new BadRequestException({
        code: result === 'exhausted' ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID',
        message:
          result === 'exhausted'
            ? 'Mã đã bị khóa sau 5 lần thử sai. Hãy yêu cầu mã mới.'
            : 'Mã chưa đúng, đã hết hạn hoặc đã được dùng. Kiểm tra mã hoặc yêu cầu mã mới.',
      });
  }
}
