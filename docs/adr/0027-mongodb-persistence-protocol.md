# ADR 0027: MongoDB persistence library and transaction protocol

Accepted for the migration lane 2026-09-29 · MIG-01 of
[MONGODB_PLAN](../refactor/MONGODB_PLAN.md). Evidence:
[MIG-01 probe report](../refactor/MIG01_TRANSACTION_PROBE.md).
Does not change OpenAPI 0.20.0 or any business rule. Supersedes nothing yet: the
PostgreSQL mechanisms in ADRs 0005–0025 stay authoritative until each is ported
with a mapped replacement and parity tests (MIG-02…MIG-05).

## Context

The course requires MongoDB. The API relies on PostgreSQL row locks
(`FOR UPDATE`/`FOR SHARE`), transaction-scoped advisory locks for idempotency keys,
`clock_timestamp()` after locks, CHECK/constraint triggers and READ COMMITTED
blocking semantics. MongoDB has multi-document transactions on a replica set with
snapshot isolation, but no row locks that wait: a second writer to a document
modified by an uncommitted or later-committed transaction fails with
`WriteConflict` (label `TransientTransactionError`). A snapshot read alone does not
detect that a document it read changed before commit (write skew).

## Decision: library

Use the official MongoDB Node driver, pinned `mongodb@7.6.0` (7.7.0 was younger
than the workspace minimum release age). Do not use Prisma's MongoDB connector
(Prisma 7 does not support MongoDB; downgrading the repo to 6.x would lose the
adapter/runtime used today) and do not use Mongoose.

Mongoose was compared on typed models/validation, transaction control, porting
cost and testability:

- Its `connection.transaction()` wraps the driver's `withTransaction`, whose retry
  loop runs up to 120 s. We need a finite, observable budget and a distinct
  unknown-commit outcome. Hooks, command buffering, implicit index builds and
  `_id` casting to ObjectId all act implicitly; each would need to be disabled.
- Validation already happens at the HTTP boundary (Ajv/class-validator) and must
  also be enforced by the database for writers other than the API. Mongoose schema
  validation is application-side only. Collection `$jsonSchema` validators are
  database-side and are the chosen backstop.
- Typed models come from TypeScript generics on `Collection<T>`; the porting cost
  is the same order as Mongoose since every Prisma query is rewritten anyway.

Wire the driver through a Nest provider in `src/database`, not `@nestjs/mongoose`.

## Decision: transaction protocol

Implemented in `apps/api/src/database/mongo/transaction.ts` and exercised by
`apps/api/test/mongo`.

1. **Runner.** `runTransaction` starts a session per attempt with read concern
   `snapshot`, write concern `majority`, primary read preference. It retries the
   whole callback on `TransientTransactionError` with jittered backoff for at most
   5 s of wall time (the analogue of PostgreSQL's 5 s lock wait) and 60 attempts, re-sends `commitTransaction` up to 3 times on
   `UnknownTransactionCommitResult`, then throws `CommitOutcomeUnknownError`.
   Budget exhaustion throws `TransactionBusyError`. Both are 503 `UNAVAILABLE`
   with the existing "retry the same request" message. Domain errors abort once
   and are never retried. The callback may run more than once, so it must not
   perform network/storage side effects; those stay in outbox/worker paths.
2. **Locks are writes.** Every document a decision depends on is "locked" by
   `$inc: { lockSeq: 1 }` inside the transaction, in sorted id order, before it is
   read for the decision (`lockDocuments`). Any concurrent writer to that document,
   inside or outside a transaction, is then serialized: it conflicts and retries,
   or (non-transactional) waits for the lock holder. This replaces `FOR UPDATE`
   and, for the auth session, `FOR SHARE` (commands per user are already serialized
   by the user lock, so exclusive session locking costs no extra concurrency).
3. **Every writer participates by construction.** Roles are embedded in the user
   document, so a role change is a write to the locked document and needs no
   trigger (replaces migration `20260926010000_role_mutation_lock`). Revoke/logout
   and refresh write the session document. There is no side table that a writer
   could forget to lock.
4. **Idempotency key.** The advisory lock on `(principal, operation, key)` becomes
   an upsert-and-increment of a `command_locks` document whose `_id` is the SHA-256
   of that canonical tuple, done first in the transaction. `mutation_receipts`
   keep a unique index on `(principal, operation, key)` as a backstop. Order stays:
   key lock → user/session locks → current authorization → receipt replay/conflict
   → resource locks → decision clock → effect + receipt + audit + outbox.
5. **Decision clock.** `serverNow` reads `$$NOW` through `$documents` inside the
   transaction after all locks. `$$NOW` is per statement, not frozen at snapshot
   start (verified), and a successful lock implies every competitor either
   committed before our snapshot or aborts. Never use the client clock or a time
   read before waiting.
6. **Unknown commit recovery.** After `CommitOutcomeUnknownError` the client
   retries with the same Idempotency-Key; the receipt decides between replay and
   first execution. If the commit was never applied, the orphaned transaction keeps
   its write intents until the server's `transactionLifetimeLimitSeconds` (default
   60 s) and retries see 503 until then. The production value is chosen in MIG-02.
7. **Topology.** Transactions require a replica set. A single-node set proves
   semantics only; failover claims need the three-member profile.

## MIG-02 additions

- Schema is versioned code (`src/database/mongo/migrations`), applied by
  `pnpm --filter @used-books/api mongo:migrate` as `latlai_migrator`; the checksum of each
  applied definition is verified. The API refuses to start with pending migrations.
- `pnpm --filter @used-books/api mongo:bootstrap` creates `latlai_app`/`latlai_migrator`.
  Append-only collections grant only find+insert to the app, replacing the immutability
  triggers; no app delete except login attempts, member addresses and draft photo links.
- Wallet accounts are append-only; postings lock `account_locks/<accountId>` instead.
- UUIDs are lowercase strings. Client-supplied UUIDs are normalized before use.
- Keyset cursors are v2 (millisecond precision, binary order of normalized text keys);
  v1 PostgreSQL cursors are rejected with 400.
- Full constraint map: [MIG02_MODEL_MAP](../refactor/MIG02_MODEL_MAP.md).

## Consequences

- Contention now aborts and retries instead of queueing. Hot documents (a popular
  listing, the wallet source account) can exhaust the budget and return 503 where
  PostgreSQL would have waited. MIG-05 must measure the ledger source account path
  and may need sharded counters or a queueing design; not decided here.
- Each lock is an oplog write. Read-only paths that currently take row locks
  (`readObligation`) must use the same touch protocol if they rely on the lock.
- MongoDB `Date` has millisecond precision (PostgreSQL has microseconds). Cursor
  and ordering compatibility is decided in MIG-02; old cursors must be rejected
  deliberately, not misread.
- CHECK constraints and constraint triggers need individual replacements
  (validator, unique/partial index, write protocol or privilege). That map is
  MIG-02 work; nothing is silently dropped.
