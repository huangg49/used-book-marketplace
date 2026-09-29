import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import type {
  CatalogBookDoc,
  RoleCode,
  UserDoc,
} from '../src/database/mongo/documents.js';
import { DomainError } from '../src/modules/commands/domain-error.js';
import {
  MongoCommandService,
  member,
  type Actor,
  type CommandContext,
} from '../src/modules/commands/mongo-command.service.js';
import type { Tx } from '../src/database/mongo/transaction.js';
import { MongoFixtures } from './helpers/mongo-fixtures.js';

// MIG-03: the MongoDB command executor with the real app user, validators and
// Nest wiring. Mutations touch a catalog document as a neutral target.

let app: INestApplication;
let commands: MongoCommandService;
let db: MongoFixtures;
const users: string[] = [];
const books: string[] = [];

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  commands = app.get(MongoCommandService);
  db = await MongoFixtures.connect();
});
afterAll(async () => {
  for (const name of ['mutation_receipts', 'audit_events'] as const)
    await db.c[name].deleteMany({ bookId: { $in: books } });
  await db.c.catalog_books.deleteMany({ _id: { $in: books } });
  await db.removeUsers(users);
  await db.close();
  await app.close();
});

const code = (error: unknown) =>
  error instanceof DomainError
    ? (error.getResponse() as { code: string }).code
    : String(error);

async function actor(
  roles: RoleCode[] = ['MEMBER'],
  status: UserDoc['status'] = 'ACTIVE',
): Promise<Actor> {
  const user = await db.user({ roles, status });
  users.push(user._id);
  const sessionId = randomUUID();
  await db.c.auth_sessions.insertOne({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: randomUUID().replace(/-/g, '').repeat(2),
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    createdAt: new Date(),
    lockSeq: 0,
  });
  return {
    sessionId,
    user: {
      id: user._id,
      email: user.emailNormalized,
      displayName: user.displayName,
      status: user.status as Actor['user']['status'],
      roles: user.roles.map((r) => r.role),
    },
  };
}

async function book(requesterId: string) {
  const now = new Date();
  const doc: CatalogBookDoc = {
    _id: randomUUID(),
    requesterId,
    status: 'Pending',
    version: 1,
    currentRevisionId: null,
    confirmedIsbn: null,
    searchText: '',
    titleKey: '',
    createdAt: now,
    updatedAt: now,
    lockSeq: 0,
  };
  await db.c.catalog_books.insertOne(doc);
  books.push(doc._id);
  return doc._id;
}

const context = (auth: Actor, key = randomUUID()): CommandContext => ({
  auth,
  key,
  requestId: randomUUID(),
});

// A versioned edit: lock, check expectedVersion, bump, emit an event.
function touch(
  ctx: CommandContext,
  bookId: string,
  expectedVersion: number,
  hooks: {
    operation?: string;
    afterEffect?: () => void;
    check?: (tx: Tx) => Promise<void>;
  } = {},
) {
  return commands.run(
    ctx,
    hooks.operation ?? 'touchCatalog',
    bookId,
    { expectedVersion },
    {
      authorize: async (tx, current) => {
        member(current);
        return current;
      },
      mutate: async (tx) => {
        await tx.lock('catalog_books', [bookId]);
        const doc = await tx.c.catalog_books.findOne({ _id: bookId });
        if (!doc || doc.version !== expectedVersion)
          throw new DomainError(409, 'VersionConflict', 'Đã thay đổi.');
        await tx.c.catalog_books.updateOne(
          { _id: bookId, version: expectedVersion },
          { $inc: { version: 1 }, $set: { updatedAt: new Date() } },
        );
        hooks.afterEffect?.();
        if (hooks.check) tx.check(`catalog:${bookId}`, () => hooks.check!(tx));
        return {
          entityType: 'Catalog' as const,
          entityId: bookId,
          version: expectedVersion + 1,
          revisionId: null,
          state: 'Pending' as const,
          event: 'CatalogTouched',
        };
      },
    },
  );
}

const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => value,
    (error) => code(error),
  );

describe('receipt, audit and outbox', () => {
  it('commits one receipt chain and replays it; a different body conflicts', async () => {
    const auth = await actor();
    const bookId = await book(auth.user.id);
    const ctx = context(auth);
    const first = await touch(ctx, bookId, 1);
    expect(first.replayed).toBe(false);
    const receipt = (await db.c.mutation_receipts.findOne({
      _id: first.receipt.id,
    }))!;
    expect(receipt).toMatchObject({
      principal: `user:${auth.user.id}`,
      actorId: auth.user.id,
      systemActor: null,
      operation: 'touchCatalog',
      key: ctx.key,
      bookId,
      resultVersion: 2,
    });
    const audit = (await db.c.audit_events.findOne({
      receiptId: receipt._id,
    }))!;
    expect(audit.after).toEqual({
      version: 2,
      revisionId: null,
      state: 'Pending',
    });
    const outbox = (await db.c.outbox_events.findOne({ auditId: audit._id }))!;
    expect(outbox).toMatchObject({
      type: 'CatalogTouched',
      payload: { entityId: bookId, revisionId: null, version: 2 },
      attempts: 0,
      processedAt: null,
    });
    const again = await touch(ctx, bookId, 1);
    expect(again).toEqual({ receipt: first.receipt, replayed: true });
    expect(await outcome(touch(ctx, bookId, 2))).toBe('IdempotencyConflict');
    expect((await db.c.catalog_books.findOne({ _id: bookId }))!.version).toBe(
      2,
    );
    await db.c.outbox_events.deleteMany({ auditId: audit._id });
  });

  it('five concurrent identical requests produce one effect', async () => {
    const auth = await actor();
    const bookId = await book(auth.user.id);
    const ctx = context(auth);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => touch(ctx, bookId, 1)),
    );
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.receipt.id)).size).toBe(1);
    expect((await db.c.catalog_books.findOne({ _id: bookId }))!.version).toBe(
      2,
    );
    expect(await db.c.mutation_receipts.countDocuments({ key: ctx.key })).toBe(
      1,
    );
  });

  it('two members racing on one version: exactly one wins', async () => {
    const [a, b] = [await actor(), await actor()];
    const bookId = await book(a.user.id);
    const results = await Promise.all([
      outcome(touch(context(a), bookId, 1)),
      outcome(touch(context(b), bookId, 1)),
    ]);
    expect(results.filter((r) => r === 'VersionConflict')).toHaveLength(1);
    expect((await db.c.catalog_books.findOne({ _id: bookId }))!.version).toBe(
      2,
    );
  });
});

describe('authorization precedes replay', () => {
  it('revoked session, removed role and LOCKED status are rechecked on replay', async () => {
    const auth = await actor();
    const bookId = await book(auth.user.id);
    const ctx = context(auth);
    await touch(ctx, bookId, 1);
    await db.removeRole(auth.user.id, 'MEMBER');
    expect(await outcome(touch(ctx, bookId, 1))).toBe('FORBIDDEN');
    await db.addRole(auth.user.id, 'MEMBER');
    await db.setStatus(auth.user.id, 'LOCKED');
    expect(await outcome(touch(ctx, bookId, 1))).toBe('AccountIneligible');
    await db.setStatus(auth.user.id, 'ACTIVE');
    expect((await touch(ctx, bookId, 1)).replayed).toBe(true);
    await db.c.auth_sessions.updateOne(
      { _id: auth.sessionId },
      { $set: { revokedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
    expect(await outcome(touch(ctx, bookId, 1))).toBe('SESSION_EXPIRED');
  });

  it('LOCKED accounts may act only through existing-obligation operations', async () => {
    const auth = await actor(['MEMBER'], 'LOCKED');
    const bookId = await book(auth.user.id);
    expect(await outcome(touch(context(auth), bookId, 1))).toBe(
      'AccountIneligible',
    );
    // The executor admits the obligation path; the feature service still
    // checks ownership/state (here the neutral target has none).
    const result = await touch(context(auth), bookId, 1, {
      operation: 'acceptOrder',
    });
    expect(result.replayed).toBe(false);
  });

  it('reads lock the actor: LOCKED is denied except for obligation reads', async () => {
    const auth = await actor(['MEMBER'], 'LOCKED');
    expect(await outcome(commands.read(auth, async () => 'read'))).toBe(
      'AccountIneligible',
    );
    expect(await commands.readObligation(auth, async () => 'obligation')).toBe(
      'obligation',
    );
  });
});

describe('atomicity and commit-time checks', () => {
  it('a failure after the effect leaves nothing behind', async () => {
    const auth = await actor();
    const bookId = await book(auth.user.id);
    const ctx = context(auth);
    expect(
      await outcome(
        touch(ctx, bookId, 1, {
          afterEffect: () => {
            throw new DomainError(409, 'InvalidState', 'injected');
          },
        }),
      ),
    ).toBe('InvalidState');
    expect((await db.c.catalog_books.findOne({ _id: bookId }))!.version).toBe(
      1,
    );
    expect(await db.c.mutation_receipts.countDocuments({ key: ctx.key })).toBe(
      0,
    );
  });

  it('a failing commit-time invariant check rolls back receipt, audit and outbox', async () => {
    const auth = await actor();
    const bookId = await book(auth.user.id);
    const ctx = context(auth);
    let insideTx = false,
      outsideTx = true;
    expect(
      await outcome(
        touch(ctx, bookId, 1, {
          check: async (tx) => {
            // Checks run after the receipt chain is written, inside the transaction.
            insideTx = !!(await tx.c.mutation_receipts.findOne({
              key: ctx.key,
            }));
            outsideTx = !!(await db.c.mutation_receipts.findOne({
              key: ctx.key,
            }));
            throw new DomainError(409, 'InvalidState', 'invariant');
          },
        }),
      ),
    ).toBe('InvalidState');
    expect([insideTx, outsideTx]).toEqual([true, false]);
    expect(await db.c.mutation_receipts.countDocuments({ key: ctx.key })).toBe(
      0,
    );
    expect((await db.c.catalog_books.findOne({ _id: bookId }))!.version).toBe(
      1,
    );
  });
});

describe('system principals', () => {
  it('worker commands use a system principal and replay by order id', async () => {
    const orderId = randomUUID(),
      contextId = randomUUID();
    const run = () =>
      commands.expireOrder(orderId, {
        discover: async () => [],
        authorize: async () => null,
        mutate: async (tx) => ({
          entityType: 'Order',
          entityId: orderId,
          contextId,
          version: 2,
          state: 'PaymentExpired',
          decidedAt: await tx.now(),
          paymentDeadline: new Date(),
          affectedListings: [],
          event: 'OrderExpired',
        }),
      });
    const first = await run();
    const again = await run();
    expect(first.replayed).toBe(false);
    expect(again).toEqual({ receipt: first.receipt, replayed: true });
    const receipt = (await db.c.mutation_receipts.findOne({
      _id: first.receipt.id,
    }))!;
    expect(receipt).toMatchObject({
      principal: 'system:OrderExpiry',
      actorId: null,
      systemActor: 'OrderExpiry',
      operation: 'expireOrder',
      key: orderId,
      contextId,
    });
    const audit = (await db.c.audit_events.findOne({
      receiptId: receipt._id,
    }))!;
    await db.c.outbox_events.deleteMany({ auditId: audit._id });
    await db.c.audit_events.deleteMany({ _id: audit._id });
    await db.c.mutation_receipts.deleteMany({ _id: receipt._id });
  });
});
