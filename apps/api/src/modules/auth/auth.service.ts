import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { components } from '@used-books/api-contract';
import type { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../database/database.service.js';
import { LoginLimiter } from './login-limiter.service.js';

type UserWithRoles = Prisma.UserGetPayload<{ include: { roles: true } }>;
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
    private readonly db: DatabaseService,
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
      id: user.id,
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
      sub: user.id,
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
    const user = await this.db.user.findUnique({
      where: { emailNormalized: email },
      include: { roles: true },
    });
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
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: user.id },
        include: { roles: true },
      });
      if (!this.allowed(current) || current.passwordHash !== user.passwordHash)
        throw invalidSession();
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const refreshToken = randomBytes(32).toString('base64url');
      const session = await tx.authSession.create({
        data: {
          userId: current.id,
          refreshTokenHash: tokenHash(refreshToken),
          expiresAt: new Date(clock.now.getTime() + SESSION_MS),
        },
      });
      return this.tokens(current, session.id, refreshToken);
    });
  }

  async refresh(refreshToken: string) {
    const hash = tokenHash(refreshToken);
    const session = await this.db.authSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: { include: { roles: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !this.allowed(session.user)
    )
      throw invalidSession();
    return this.db.$transaction(async (tx) => {
      // Same user -> session order as feature commands; recheck after all waits.
      await tx.$queryRaw`SELECT id FROM users WHERE id=${session.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${session.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: session.userId },
        include: { roles: true },
      });
      if (!this.allowed(current)) throw invalidSession();
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const replacement = randomBytes(32).toString('base64url');
      const result = await tx.authSession.updateMany({
        where: {
          id: session.id,
          refreshTokenHash: hash,
          revokedAt: null,
          expiresAt: { gt: clock.now },
        },
        data: { refreshTokenHash: tokenHash(replacement) },
      });
      if (result.count !== 1) throw invalidSession();
      return this.tokens(current, session.id, replacement);
    });
  }

  async logout(refreshToken: string) {
    await this.db.authSession.updateMany({
      where: { refreshTokenHash: tokenHash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
    const session = await this.db.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { roles: true } } },
    });
    if (!session || !this.allowed(session.user)) throw invalidSession();
    return { sessionId: session.id, user: this.publicUser(session.user) };
  }
}
