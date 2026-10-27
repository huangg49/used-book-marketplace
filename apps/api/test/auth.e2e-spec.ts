import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { hash } from 'argon2';
import request from 'supertest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { Roles } from '../src/modules/auth/roles.guard.js';

@Controller('test-admin')
class AdminProbe {
  @Get('default-private')
  defaultPrivate() {
    return { ok: true };
  }

  @Get()
  @Roles('ADMIN')
  get() {
    return { ok: true };
  }
}

const contract = parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@used-books/api-contract/openapi.yaml',
    ),
    'utf8',
  ),
);
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);
ajv.addSchema({ $id: 'contract', components: contract.components });
const validates = (schema: string, body: unknown) => {
  const validate = ajv.compile({
    $ref: `contract#/components/schemas/${schema}`,
  });
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
};

describe('authentication with MongoDB', () => {
  let app: INestApplication;
  let db: MongoFixtures;
  const email = `auth-${randomUUID()}@example.com`;
  const password = 'Integration-test-password-42';
  let userId: string;
  let passwordHash: string;
  const login = () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [AdminProbe],
    }).compile();
    app = module.createNestApplication();
    configureApp(app, { logRequests: false });
    await app.init();
    db = await MongoFixtures.connect();
    passwordHash = await hash(password);
  });
  beforeEach(async () => {
    // The test-env guard permits only databases whose names end in _test.
    await db.c.login_attempts.deleteMany({});
    const existing = await db.c.users.findOne({ emailNormalized: email });
    if (existing) {
      await db.c.users.updateOne(
        { _id: existing._id },
        {
          $set: { status: 'ACTIVE', emailVerifiedAt: new Date() },
          $pull: { roles: { role: 'ADMIN' } },
          $inc: { lockSeq: 1 },
        },
      );
      userId = existing._id;
    } else
      userId = (
        await db.user({
          email,
          displayName: 'Integration Reader',
          passwordHash,
        })
      )._id;
    await db.c.auth_sessions.deleteMany({ userId });
  });
  afterAll(async () => {
    if (db) {
      await db.removeUsers([userId]);
      await db.c.login_attempts.deleteMany({});
      await db.close();
    }
    await app?.close();
  });

  it('serves the shared contract and checks real database readiness', async () => {
    const docs = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(docs.body.paths).toEqual(contract.paths);
    const ready = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    validates('HealthResponse', ready.body);
  });

  it('allows repeated demo logins but still rejects wrong passwords and disabled users', async () => {
    const config = app.get(ConfigService);
    const previousEnv = config.get('NODE_ENV');
    const previousOverride = config.get('LOGIN_RATE_LIMIT_DISABLED');
    config.set('NODE_ENV', 'development');
    config.set('LOGIN_RATE_LIMIT_DISABLED', 'true');
    try {
      for (let i = 0; i < 8; i++) await login().expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Wrong-demo-password-42' })
        .expect(401);
      await db.setStatus(userId, 'DISABLED');
      await login().expect(401);
      expect(await db.c.login_attempts.countDocuments()).toBe(0);
    } finally {
      config.set('NODE_ENV', previousEnv);
      config.set('LOGIN_RATE_LIMIT_DISABLED', previousOverride);
    }
  });

  it('protects new endpoints by default and rejects expired or wrong-audience JWTs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/test-admin/default-private')
      .expect(401);
    const result = await login().expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/test-admin/default-private')
      .auth(result.body.accessToken, { type: 'bearer' })
      .expect(200);
    const session = (await db.c.auth_sessions.findOne({ userId }))!;
    const jwt = app.get(JwtService);
    for (const options of [
      { expiresIn: -1 },
      { audience: 'another-application' },
    ]) {
      const token = await jwt.signAsync(
        { sub: userId, sid: session._id },
        options,
      );
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
  });

  it('normalizes email, returns the public profile, stores only a token hash, and revokes access on logout', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ` ${email.toUpperCase()} `, password })
      .expect(200);
    validates('AuthTokens', result.body);
    const stored = (await db.c.auth_sessions.findOne({ userId }))!;
    expect(stored.refreshTokenHash).not.toBe(result.body.refreshToken);
    expect(stored.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(result.body.accessToken, { type: 'bearer' })
      .expect(200);
    validates('CurrentUser', me.body);
    expect(me.body.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: result.body.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: result.body.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(result.body.accessToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: result.body.refreshToken })
      .expect(401);
  });

  it('allows exactly one concurrent refresh and rejects token replay', async () => {
    const result = await login().expect(200);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: result.body.refreshToken }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 401)).toHaveLength(7);
    const winner = responses.find((r) => r.status === 200)!;
    validates('AuthTokens', winner.body);
    expect(winner.body.refreshToken).not.toBe(result.body.refreshToken);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: winner.body.refreshToken })
      .expect(200);
  });

  it('keeps locked sessions limited to profile/obligations and reads current roles rather than JWT claims', async () => {
    const result = await login().expect(200);
    const token = result.body.accessToken;
    await request(app.getHttpServer())
      .get('/api/v1/test-admin')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await db.addRole(userId, 'ADMIN');
    await request(app.getHttpServer())
      .get('/api/v1/test-admin')
      .auth(token, { type: 'bearer' })
      .expect(200);
    await db.removeRole(userId, 'ADMIN');
    await request(app.getHttpServer())
      .get('/api/v1/test-admin')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await db.setStatus(userId, 'LOCKED');
    const profile = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(profile.body.status).toBe('LOCKED');
    validates('CurrentUser', profile.body);
    await request(app.getHttpServer())
      .get('/api/v1/test-admin/default-private')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: result.body.refreshToken })
      .expect(200);
    const lockedLogin = await login().expect(200);
    expect(lockedLogin.body.user.status).toBe('LOCKED');
  });

  it('rejects expired sessions even if an access token is still signed correctly', async () => {
    const result = await login().expect(200);
    await db.c.auth_sessions.updateMany(
      { userId },
      { $set: { expiresAt: new Date(0) } },
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(result.body.accessToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: result.body.refreshToken })
      .expect(401);
  });

  it('validates bodies, rejects anonymous requests, and returns contract errors with a request ID', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, roles: ['ADMIN'] })
      .expect(400);
    validates('ApiError', bad.body);
    expect(bad.headers['x-request-id']).toBe(bad.body.requestId);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong' })
      .expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth('forged', { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'bad' })
      .expect(400);
  });

  it('enforces the login limit atomically under concurrent attempts', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'wrong' }),
      ),
    );
    expect(responses.filter((r) => r.status === 401)).toHaveLength(5);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(3);
    validates('ApiError', responses.find((r) => r.status === 429)!.body);
  });
});
