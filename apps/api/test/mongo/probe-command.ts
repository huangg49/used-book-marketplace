import { createHash, randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import {
  lockDocuments,
  runTransaction,
  serverNow,
  type TransactionOptions,
  type Tx,
} from '../../src/database/mongo/transaction.js';
import { DomainError } from '../../src/modules/commands/domain-error.js';
import { canonicalJson } from '../../src/common/canonical-json.js';

// MIG-01 probe: the smallest faithful copy of CommandService.executePrincipal on
// MongoDB. It is not wired to controllers; MIG-03 ports the real executor.

export type UserDoc = {
  _id: string;
  status: 'ACTIVE' | 'RESTRICTED' | 'LOCKED' | 'DISABLED';
  roles: string[];
  lockSeq: number;
};
export type SessionDoc = {
  _id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  lockSeq: number;
};
export type BookDoc = {
  _id: string;
  state: 'Available' | 'Committed';
  version: number;
  deadline: Date | null;
  lockSeq: number;
};
export type ReceiptDoc = {
  _id: string;
  principal: string;
  operation: string;
  key: string;
  payloadHash: string;
  result: { id: string; bookId: string; version: number; decidedAt: string };
  committedAt: Date;
};

export type Point =
  | 'afterKeyLock'
  | 'beforeUserLock'
  | 'afterLocks'
  | 'afterEffect'
  | 'afterReceipt'
  | 'afterAudit';

export interface ProbeContext {
  userId: string;
  sessionId: string;
  key: string;
}

export class ProbeStore {
  constructor(
    readonly client: MongoClient,
    readonly db: Db,
  ) {}
  users = () => this.db.collection<UserDoc>('users');
  sessions = () => this.db.collection<SessionDoc>('auth_sessions');
  books = () => this.db.collection<BookDoc>('books');
  commitments = () =>
    this.db.collection<{
      _id: string;
      bookId: string;
      userId: string;
      active: boolean;
    }>('commitments');
  receipts = () => this.db.collection<ReceiptDoc>('mutation_receipts');
  audit = () =>
    this.db.collection<{ _id: string; receiptId: string; action: string }>(
      'audit_events',
    );
  outbox = () =>
    this.db.collection<{ _id: string; auditId: string; type: string }>(
      'outbox_events',
    );
  locks = () =>
    this.db.collection<{ _id: string; lockSeq: number }>('command_locks');

  static readonly collections = [
    'users',
    'auth_sessions',
    'books',
    'commitments',
    'mutation_receipts',
    'audit_events',
    'outbox_events',
    'command_locks',
  ];

  // Collections are created up front: creating one implicitly inside a
  // transaction is slow and takes a database-level lock.
  async ensureSchema() {
    const existing = new Set(
      (await this.db.listCollections({}, { nameOnly: true }).toArray()).map(
        (c) => c.name,
      ),
    );
    for (const name of ProbeStore.collections)
      if (!existing.has(name)) await this.db.createCollection(name);
    await this.receipts().createIndex(
      { principal: 1, operation: 1, key: 1 },
      { unique: true, name: 'receipt_identity' },
    );
    // Backstop equivalent to the SQL partial unique index on active commitments.
    await this.commitments().createIndex(
      { bookId: 1 },
      {
        unique: true,
        partialFilterExpression: { active: true },
        name: 'one_active_commitment_per_book',
      },
    );
  }

  tx<T>(fn: (tx: Tx) => Promise<T>, options?: TransactionOptions) {
    return runTransaction(this.client, this.db, fn, options);
  }

  // A writer outside the command path (logout/admin revoke). It only writes the
  // session document, yet still conflicts with a command that locked it.
  revokeSession(sessionId: string, options?: TransactionOptions) {
    return this.tx(async (tx) => {
      await lockDocuments(tx, this.sessions(), [sessionId]);
      const now = await serverNow(tx);
      await this.sessions().updateOne(
        { _id: sessionId },
        { $set: { revokedAt: now } },
        { session: tx.session },
      );
      return now;
    }, options);
  }

  // Role change writes the user document itself (roles are embedded), so it
  // needs no trigger to participate in the command lock protocol.
  removeRole(userId: string, role: string, options?: TransactionOptions) {
    return this.tx(async (tx) => {
      await this.users().updateOne(
        { _id: userId },
        { $pull: { roles: role }, $inc: { lockSeq: 1 } },
        { session: tx.session },
      );
    }, options);
  }

  async commitBook(
    context: ProbeContext,
    body: { bookId: string; expectedVersion: number },
    hooks: {
      at?: (point: Point, attempt: number) => Promise<void> | void;
      authorizeByReadOnly?: boolean;
      options?: TransactionOptions;
    } = {},
  ): Promise<{ receipt: ReceiptDoc['result']; replayed: boolean }> {
    const operation = 'commitBook';
    const principal = `user:${context.userId}`;
    const hash = createHash('sha256')
      .update(canonicalJson({ operation, target: body.bookId, body }))
      .digest('hex');
    let attempt = 0;
    return this.tx(async (tx) => {
      attempt++;
      const at = (point: Point) => hooks.at?.(point, attempt);
      const s = { session: tx.session };
      // 1. Same principal/operation/key serialize (advisory lock equivalent).
      const lockId = createHash('sha256')
        .update(canonicalJson([principal, operation, context.key]))
        .digest('hex');
      await this.locks().updateOne(
        { _id: lockId },
        { $inc: { lockSeq: 1 } },
        { ...s, upsert: true },
      );
      await at('afterKeyLock');
      // 2. Current user and session, locked before any receipt access.
      await at('beforeUserLock');
      if (!hooks.authorizeByReadOnly) {
        await lockDocuments(tx, this.users(), [context.userId]);
        await lockDocuments(tx, this.sessions(), [context.sessionId]);
      }
      const now = await serverNow(tx);
      const session = await this.sessions().findOne(
        { _id: context.sessionId },
        s,
      );
      const user = await this.users().findOne({ _id: context.userId }, s);
      if (
        !session ||
        session.userId !== context.userId ||
        session.revokedAt ||
        session.expiresAt <= now ||
        !user ||
        !['ACTIVE', 'RESTRICTED', 'LOCKED'].includes(user.status)
      )
        throw new DomainError(401, 'SESSION_EXPIRED', 'Phiên đã hết hạn.');
      if (!user.roles.includes('MEMBER'))
        throw new DomainError(403, 'FORBIDDEN', 'Cần quyền thành viên.');
      if (user.status !== 'ACTIVE')
        throw new DomainError(403, 'AccountIneligible', 'Không đủ điều kiện.');
      // 3. Replay only after current authorization.
      const previous = await this.receipts().findOne(
        { principal, operation, key: context.key },
        s,
      );
      if (previous) {
        if (previous.payloadHash !== hash)
          throw new DomainError(
            409,
            'IdempotencyConflict',
            'Mã yêu cầu đã được dùng cho nội dung khác.',
          );
        return { receipt: previous.result, replayed: true };
      }
      // 4. Resource lock, then the decision clock.
      const found = await lockDocuments(tx, this.books(), [body.bookId]);
      await at('afterLocks');
      if (!found.size) throw new DomainError(404, 'NOT_FOUND', 'Không thấy.');
      const decidedAt = await serverNow(tx);
      const book = (await this.books().findOne({ _id: body.bookId }, s))!;
      if (book.deadline && book.deadline <= decidedAt)
        throw new DomainError(409, 'InvalidState', 'Đã quá hạn.');
      if (book.state !== 'Available' || book.version !== body.expectedVersion)
        throw new DomainError(409, 'VersionConflict', 'Đã thay đổi.');
      // 5. Effect, receipt, audit, outbox in the same transaction.
      await this.books().updateOne(
        { _id: book._id },
        { $set: { state: 'Committed' }, $inc: { version: 1 } },
        s,
      );
      await this.commitments().insertOne(
        {
          _id: randomUUID(),
          bookId: book._id,
          userId: context.userId,
          active: true,
        },
        s,
      );
      await at('afterEffect');
      const id = randomUUID();
      const result = {
        id,
        bookId: book._id,
        version: book.version + 1,
        decidedAt: decidedAt.toISOString(),
      };
      await this.receipts().insertOne(
        {
          _id: id,
          principal,
          operation,
          key: context.key,
          payloadHash: hash,
          result,
          committedAt: decidedAt,
        },
        s,
      );
      await at('afterReceipt');
      const auditId = randomUUID();
      await this.audit().insertOne(
        { _id: auditId, receiptId: id, action: operation },
        s,
      );
      await at('afterAudit');
      await this.outbox().insertOne(
        { _id: randomUUID(), auditId, type: 'BookCommitted' },
        s,
      );
      return { receipt: result, replayed: false };
    }, hooks.options);
  }
}

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
