import {
  MongoError,
  type ClientSession,
  type Collection,
  type Db,
  type Document,
  type MongoClient,
} from 'mongodb';
import { DomainError } from '../../modules/commands/domain-error.js';
import {
  bindCollections,
  type CollectionName,
  type Collections,
} from './collections.js';

// MongoDB transaction protocol (ADR 0027). Every multi-document business
// decision runs through runTransaction. Contention is modelled by writing a
// "lock" field on each document the decision depends on: a competing writer then
// gets a WriteConflict (TransientTransactionError) instead of a stale snapshot.

export class Tx {
  // Session-bound collections: every operation joins this transaction.
  readonly c: Collections;
  private readonly checks = new Map<string, () => Promise<void>>();
  constructor(
    readonly session: ClientSession,
    readonly db: Db,
  ) {
    this.c = bindCollections(db, session);
  }
  // Registers a commit-time invariant check (the DEFERRABLE constraint trigger
  // equivalent). Checks run after the callback, inside the transaction, just
  // before commit; the same key registered twice runs once.
  check(key: string, fn: () => Promise<void>) {
    this.checks.set(key, fn);
  }
  async runChecks() {
    // A check may register further checks (e.g. order -> listing projection).
    const done = new Set<string>();
    for (;;) {
      const next = [...this.checks.entries()].find(([k]) => !done.has(k));
      if (!next) return;
      done.add(next[0]);
      await next[1]();
    }
  }
  now(): Promise<Date> {
    return serverNow(this);
  }
  // Write-lock documents of a mutable collection in sorted id order.
  lock(name: CollectionName, ids: Iterable<string>): Promise<Set<string>> {
    return lockDocuments(
      this,
      this.db.collection<Document & { _id: string }>(name),
      ids,
    );
  }
}

export class TransactionBusyError extends DomainError {
  constructor(readonly attempts: number) {
    super(
      503,
      'UNAVAILABLE',
      'Dịch vụ đang bận. Vui lòng thử lại cùng yêu cầu.',
    );
  }
}

// The commit may or may not have been applied. Callers must not guess: the
// client retries with the same idempotency key and the stored receipt decides.
export class CommitOutcomeUnknownError extends DomainError {
  constructor(readonly original: unknown) {
    super(
      503,
      'UNAVAILABLE',
      'Dịch vụ đang bận. Vui lòng thử lại cùng yêu cầu.',
    );
  }
}

export interface TransactionOptions {
  // Whole-transaction attempts on TransientTransactionError (write conflicts,
  // primary step-down). Finite on purpose; exhaustion is a 503, not a loop.
  maxAttempts?: number;
  // Wall-clock retry budget, the analogue of PostgreSQL's lock wait (maxWait):
  // no new attempt starts after this many milliseconds.
  maxRetryMs?: number;
  // Extra commitTransaction attempts on UnknownTransactionCommitResult.
  commitAttempts?: number;
  maxCommitTimeMS?: number;
  // Test hook only: observes each attempt number before fn runs.
  onAttempt?: (attempt: number) => void | Promise<void>;
}

const hasLabel = (error: unknown, label: string) =>
  error instanceof MongoError && error.hasErrorLabel(label);

export const isTransient = (error: unknown) =>
  hasLabel(error, 'TransientTransactionError');

export async function runTransaction<T>(
  client: MongoClient,
  db: Db,
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 60;
  const commitAttempts = options.commitAttempts ?? 3;
  const deadline = Date.now() + (options.maxRetryMs ?? 5000);
  for (
    let attempt = 1;
    attempt <= maxAttempts && (attempt === 1 || Date.now() < deadline);
    attempt++
  ) {
    await options.onAttempt?.(attempt);
    const session = client.startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        maxCommitTimeMS: options.maxCommitTimeMS ?? 10_000,
      });
      let result: T;
      try {
        const tx = new Tx(session, db);
        result = await fn(tx);
        await tx.runChecks();
      } catch (error) {
        await session.abortTransaction().catch(() => undefined);
        if (isTransient(error)) {
          await backoff(attempt);
          continue;
        }
        throw error;
      }
      let retryWhole = false;
      for (let commit = 1; commit <= commitAttempts; commit++) {
        try {
          await session.commitTransaction();
          return result;
        } catch (error) {
          if (hasLabel(error, 'UnknownTransactionCommitResult')) {
            // Re-sending commitTransaction is idempotent for the same session.
            if (commit < commitAttempts) continue;
            throw new CommitOutcomeUnknownError(error);
          }
          if (isTransient(error)) {
            retryWhole = true;
            break;
          }
          throw error;
        }
      }
      if (retryWhole) {
        await backoff(attempt);
        continue;
      }
    } finally {
      await session.endSession();
    }
  }
  throw new TransactionBusyError(maxAttempts);
}

function backoff(attempt: number) {
  const ms = Math.min(100, 2 * 2 ** attempt) * (0.5 + Math.random());
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Acquire write intent on documents in a stable order. Returns the ids that
// exist; a missing id is the caller's decision (usually NOT_FOUND).
export async function lockDocuments<S extends Document & { _id: string }>(
  tx: Tx,
  collection: Collection<S>,
  ids: Iterable<string>,
): Promise<Set<string>> {
  const found = new Set<string>();
  // Operations inside one session must be sequential, never Promise.all.
  for (const id of [...new Set(ids)].sort()) {
    const result = await collection.updateOne(
      { _id: id } as never,
      { $inc: { lockSeq: 1 } } as never,
      { session: tx.session },
    );
    if (result.matchedCount === 1) found.add(id);
  }
  return found;
}

// Server wall clock read inside the transaction. Call it only after every lock
// the decision depends on, so it is later than any competitor's commit.
export async function serverNow(tx: {
  db: Db;
  session?: ClientSession;
}): Promise<Date> {
  const [row] = await tx.db
    .aggregate<{ now: Date }>(
      [{ $documents: [{}] }, { $project: { _id: 0, now: '$$NOW' } }],
      tx.session ? { session: tx.session } : {},
    )
    .toArray();
  return row.now;
}

// Multi-host MongoDB URLs are not WHATWG URLs; extract the database path only.
export function mongoDatabaseName(url: string): string {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/.exec(url);
  return decodeURIComponent(match?.[1] ?? '');
}
