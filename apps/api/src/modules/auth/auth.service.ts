import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { components } from '@used-books/api-contract';
import { randomUUID } from 'node:crypto';
import type {
  AuthSessionDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { LoginLimiter } from './login-limiter.service.js';

type UserWithRoles = UserDoc;
export type CurrentUser = components['schemas']['CurrentUser'];
const ACCESS_SECONDS = 900;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const invalidSession = () =>
  new UnauthorizedException({
    code: 'SESSION_EXPIRED',
    message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  });

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: string;
  constructor(
    private readonly mongo: MongoService,
    private readonly jwt: JwtService,
    private readonly limiter: LoginLimiter,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash(randomBytes(32));
  }

  private allowed(user: UserWithRoles | null): user is UserWithRoles {
    return (
      !!user?.emailVerifiedAt &&
      ['ACTIVE', 'RESTRICTED', 'LOCKED'].includes(user.status)
    );
  }

  private publicUser(user: UserWithRoles): CurrentUser {
    return {
      id: user._id,
      email: user.emailNormalized,
      displayName: user.displayName,
      status: user.status as CurrentUser['status'],
      roles: user.roles.map(({ role }) => role),
    };
  }

  private async tokens(
    user: UserWithRoles,
    sessionId: string,
    refreshToken: string,
  ): Promise<components['schemas']['AuthTokens']> {
    const accessToken = await this.jwt.signAsync({
      sub: user._id,
      sid: sessionId,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_SECONDS,
      user: this.publicUser(user),
    };
  }

  async login(email: string, password: string, ip: string) {
    await this.limiter.consume(email, ip);
    const user = await this.mongo.c.users.findOne({ emailNormalized: email });
    const valid = await argon2.verify(
      user?.passwordHash ?? this.dummyHash,
      password,
    );
    if (!valid || !this.allowed(user)) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message:
          'Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được phép đăng nhập.',
      });
    }
    return this.mongo.tx(async (tx) => {
      // Lock, then re-read: a concurrent password/status change wins or waits.
      await tx.lock('users', [user._id]);
      const current = await tx.c.users.findOne({ _id: user._id });
      if (!this.allowed(current) || current.passwordHash !== user.passwordHash)
        throw invalidSession();
      const now = await tx.now();
      const refreshToken = randomBytes(32).toString('base64url');
      const session: AuthSessionDoc = {
        _id: randomUUID(),
        userId: current._id,
        refreshTokenHash: tokenHash(refreshToken),
        expiresAt: new Date(now.getTime() + SESSION_MS),
        revokedAt: null,
        createdAt: now,
        lockSeq: 0,
      };
      await tx.c.auth_sessions.insertOne(session);
      return this.tokens(current, session._id, refreshToken);
    });
  }

  async refresh(refreshToken: string) {
    const hash = tokenHash(refreshToken);
    const session = await this.mongo.c.auth_sessions.findOne({
      refreshTokenHash: hash,
    });
    const owner =
      session && (await this.mongo.c.users.findOne({ _id: session.userId }));
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !this.allowed(owner ?? null)
    )
      throw invalidSession();
    return this.mongo.tx(async (tx) => {
      // Same user -> session order as feature commands; recheck after all waits.
      await tx.lock('users', [session.userId]);
      await tx.lock('auth_sessions', [session._id]);
      const current = await tx.c.users.findOne({ _id: session.userId });
      if (!this.allowed(current)) throw invalidSession();
      const now = await tx.now();
      const replacement = randomBytes(32).toString('base64url');
      const result = await tx.c.auth_sessions.updateOne(
        {
          _id: session._id,
          refreshTokenHash: hash,
          revokedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { refreshTokenHash: tokenHash(replacement) } },
      );
      if (result.matchedCount !== 1) throw invalidSession();
      return this.tokens(current, session._id, replacement);
    });
  }

  async logout(refreshToken: string) {
    // A plain write to the session document: it waits for, or conflicts with,
    // any command holding that session's lock (ADR 0027).
    await this.mongo.c.auth_sessions.updateOne(
      { refreshTokenHash: tokenHash(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  async authenticate(accessToken: string) {
    let claims: { sub?: unknown; sid?: unknown };
    try {
      claims = await this.jwt.verifyAsync(accessToken);
    } catch {
      throw invalidSession();
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string')
      throw invalidSession();
    if (
      ![claims.sub, claims.sid].every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        ),
      )
    )
      throw invalidSession();
    // One aggregate reads session and user from the same snapshot.
    const [session] = await this.mongo.c.auth_sessions
      .aggregate<AuthSessionDoc & { users: UserDoc[] }>([
        {
          $match: {
            _id: claims.sid.toLowerCase(),
            userId: claims.sub.toLowerCase(),
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
        { $limit: 1 },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'users',
          },
        },
      ])
      .toArray();
    const sessionUser = session?.users[0] ?? null;
    if (!session || !this.allowed(sessionUser)) throw invalidSession();
    return { sessionId: session._id, user: this.publicUser(sessionUser) };
  }
}
