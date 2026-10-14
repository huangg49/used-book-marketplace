import { createHash } from 'node:crypto';
import type { Client } from 'pg';
import type { Db, Document, MongoClient } from 'mongodb';
import { canonicalJson } from '../../../common/canonical-json.js';
import {
  checkIntegrity,
  type IntegrityReport,
} from '../../../integrity/integrity.js';
import { titleKey } from '../migrations/0003-catalog-title-key.js';
import { PLATFORM_COMMISSION_ACCOUNT_ID } from '../migrations/auction-constants.js';
import { LISTING_FEE_CLEARING_ID } from '../migrations/0022-vnpay-wallet-listing-fees.js';
import {
  LEDGER_SEQUENCE_COUNTER,
  OPENING_JOURNAL_ID,
  referenceData,
} from '../migrations/0002-reference-data.js';
import { runTransaction } from '../transaction.js';

// One-time PostgreSQL -> MongoDB import (MIG-06). Reads one REPEATABLE READ
// READ ONLY snapshot, maps every table to the documents of migration 0001
// (validators apply; nothing is written with bypassDocumentValidation), then
// verifies counts, per-collection content hashes and the whole-database
// integrity sweep. The report contains counts and hashes only.

export const EXPECTED_POSTGRES_MIGRATIONS = [
  '20260924000000_auth_foundation',
  '20260926000000_listing_contract_foundation',
  '20260926010000_role_mutation_lock',
  '20260926020000_catalog_isbn_prefix',
  '20260926030000_media_storage_reservation',
  '20260926040000_media_ready_reservation',
  '20260927000000_member_address_book',
  '20260927010000_listing_fulfillment',
  '20260927020000_direct_sale_quotes',
  '20260927030000_unpaid_direct_orders',
  '20260928010000_simulated_wallet',
  '20260928020000_order_wallet_payment',
  '20260928030000_order_preparation',
  '20260928040000_order_packaging_evidence',
  '20260928050000_direct_shipment_registration',
  '20260928060000_carrier_pickup',
  '20260928070000_delivery_overdue',
];

type Row = Record<string, unknown>;
interface TableSpec {
  table: string;
  collection: string;
  columns: string[];
  // Column(s) forming _id; `id` by default. Several columns join with ':'.
  id?: string[];
  lockable?: boolean;
}
const camel = (column: string) =>
  column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export const TABLES: TableSpec[] = [
  {
    table: 'users',
    collection: 'users',
    columns: [
      'id',
      'email_normalized',
      'password_hash',
      'display_name',
      'status',
      'email_verified_at',
      'created_at',
      'updated_at',
    ],
    lockable: true,
  },
  {
    table: 'auth_sessions',
    collection: 'auth_sessions',
    columns: [
      'id',
      'user_id',
      'refresh_token_hash',
      'expires_at',
      'revoked_at',
      'created_at',
    ],
    lockable: true,
  },
  {
    table: 'login_attempts',
    collection: 'login_attempts',
    columns: ['key', 'attempts', 'expires_at'],
    id: ['key'],
  },
  {
    table: 'catalog_books',
    collection: 'catalog_books',
    columns: [
      'id',
      'requester_id',
      'status',
      'version',
      'current_revision_id',
      'confirmed_isbn',
      'search_text',
      'created_at',
      'updated_at',
    ],
    lockable: true,
  },
  {
    table: 'catalog_revisions',
    collection: 'catalog_revisions',
    columns: [
      'id',
      'book_id',
      'number',
      'title',
      'authors',
      'publisher',
      'publication_year',
      'language',
      'edition',
      'category',
      'isbn',
      'submitted_at',
    ],
  },
  {
    table: 'catalog_decisions',
    collection: 'catalog_decisions',
    columns: [
      'id',
      'revision_id',
      'reviewer_id',
      'decision',
      'reason',
      'decided_at',
    ],
  },
  {
    table: 'listings',
    collection: 'listings',
    columns: [
      'id',
      'owner_id',
      'version',
      'moderation',
      'visibility',
      'trade',
      'current_revision_id',
      'removal_reason',
      'deleted_at',
      'published_at',
      'created_at',
      'updated_at',
    ],
    lockable: true,
  },
  {
    table: 'listing_revisions',
    collection: 'listing_revisions',
    columns: [
      'id',
      'listing_id',
      'number',
      'book_id',
      'mode',
      'condition',
      'pages',
      'cover_note',
      'notes',
      'accessories',
      'readable',
      'has_missing_pages',
      'missing_essential_content',
      'description',
      'sale_price',
      'exchange_value',
      'submitted_at',
      'ownership_declared_at',
      'created_at',
      'origin_address_id',
      'origin_address_version',
      'origin_service_area_code',
    ],
    lockable: true,
  },
  {
    table: 'listing_media',
    collection: 'listing_media',
    columns: [
      'id',
      'listing_id',
      'version',
      'status',
      'staging_key',
      'pinned_key',
      'derivative_key',
      'mime_type',
      'byte_size',
      'sha256',
      'width',
      'height',
      'failure_code',
      'expires_at',
      'purged_at',
      'reserved_bytes',
      'created_at',
      'updated_at',
    ],
    lockable: true,
  },
  {
    table: 'revision_media',
    collection: 'revision_media',
    columns: ['listing_id', 'revision_id', 'media_id', 'position'],
    id: ['revision_id', 'media_id'],
  },
  {
    table: 'listing_decisions',
    collection: 'listing_decisions',
    columns: [
      'id',
      'revision_id',
      'reviewer_id',
      'decision',
      'checklist',
      'reason',
      'decided_at',
    ],
  },
  {
    table: 'mutation_receipts',
    collection: 'mutation_receipts',
    columns: [
      'id',
      'actor_id',
      'system_actor',
      'operation',
      'key',
      'payload_hash',
      'listing_id',
      'book_id',
      'media_id',
      'address_book_id',
      'quote_id',
      'context_id',
      'topup_id',
      'result_version',
      'result',
      'committed_at',
    ],
  },
  {
    table: 'audit_events',
    collection: 'audit_events',
    columns: [
      'id',
      'actor_id',
      'system_actor',
      'receipt_id',
      'listing_id',
      'book_id',
      'media_id',
      'address_book_id',
      'quote_id',
      'context_id',
      'topup_id',
      'action',
      'before',
      'after',
      'reason',
      'request_id',
      'created_at',
    ],
  },
  {
    table: 'outbox_events',
    collection: 'outbox_events',
    columns: [
      'id',
      'audit_id',
      'type',
      'payload',
      'attempts',
      'available_at',
      'lease_until',
      'processed_at',
      'created_at',
    ],
  },
  {
    table: 'media_processing_jobs',
    collection: 'media_processing_jobs',
    columns: [
      'id',
      'media_id',
      'attempts',
      'available_at',
      'lease_until',
      'finished_at',
    ],
  },
  {
    table: 'service_areas',
    collection: 'service_areas',
    columns: ['code', 'name', 'demo_only'],
    id: ['code'],
  },
  {
    table: 'service_localities',
    collection: 'service_localities',
    columns: ['area_code', 'code', 'label'],
    id: ['area_code', 'code'],
  },
  {
    table: 'address_books',
    collection: 'address_books',
    columns: ['owner_id', 'version'],
    id: ['owner_id'],
    lockable: true,
  },
  {
    table: 'member_addresses',
    collection: 'member_addresses',
    columns: [
      'id',
      'owner_id',
      'version',
      'recipient_name',
      'phone',
      'service_area_code',
      'locality_code',
      'detail',
      'is_default',
      'created_at',
    ],
  },
  {
    table: 'address_identities',
    collection: 'address_identities',
    columns: ['id', 'owner_id'],
  },
  {
    table: 'sale_quote_policies',
    collection: 'sale_quote_policies',
    columns: ['code', 'shipping_fee', 'commission_bps', 'ttl_seconds'],
    id: ['code'],
  },
  {
    table: 'sale_quote_policy_selection',
    collection: 'sale_quote_policy_selection',
    columns: ['scope', 'policy_code'],
    id: ['scope'],
  },
  {
    table: 'sale_quotes',
    collection: 'sale_quotes',
    columns: [
      'id',
      'version',
      'buyer_id',
      'seller_id',
      'listing_id',
      'listing_version',
      'listing_revision_id',
      'catalog_revision_id',
      'origin_address_id',
      'origin_address_version',
      'destination_address_id',
      'destination_address_version',
      'service_area_code',
      'policy_code',
      'book_price',
      'shipping_fee',
      'commission_bps',
      'commission',
      'buyer_total',
      'seller_proceeds',
      'created_at',
      'expires_at',
    ],
  },
  {
    table: 'direct_orders',
    collection: 'direct_orders',
    columns: [
      'id',
      'buyer_id',
      'seller_id',
      'quote_id',
      'version',
      'state',
      'created_at',
      'payment_deadline',
      'closed_at',
      'paid_at',
      'seller_confirmation_deadline',
      'cancellation_requested_at',
      'cancellation_reason',
    ],
    lockable: true,
  },
  {
    table: 'order_preparations',
    collection: 'order_preparations',
    columns: [
      'order_id',
      'accepted_at',
      'pickup_deadline',
      'policy_code',
      'receipt_id',
    ],
    id: ['order_id'],
  },
  {
    table: 'pickup_reviews',
    collection: 'pickup_reviews',
    columns: ['id', 'order_id', 'opened_at', 'reason', 'receipt_id'],
  },
  {
    table: 'order_packaging_evidence',
    collection: 'order_packaging_evidence',
    columns: [
      'id',
      'order_id',
      'version',
      'status',
      'mime_type',
      'byte_size',
      'sha256',
      'reserved_bytes',
      'created_at',
      'uploaded_at',
      'derivative_sha256',
      'derivative_bytes',
      'width',
      'height',
      'create_receipt_id',
      'upload_receipt_id',
    ],
  },
  {
    table: 'direct_shipments',
    collection: 'direct_shipments',
    columns: [
      'id',
      'order_id',
      'version',
      'state',
      'carrier',
      'tracking_code',
      'direction',
      'origin',
      'destination',
      'shipping_fee',
      'fee_policy',
      'registered_at',
      'receipt_id',
    ],
  },
  {
    table: 'shipment_packaging_evidence',
    collection: 'shipment_packaging_evidence',
    columns: ['shipment_id', 'order_id', 'evidence_id', 'position'],
    id: ['shipment_id', 'evidence_id'],
  },
  {
    table: 'carrier_pickup_events',
    collection: 'carrier_pickup_events',
    columns: [
      'id',
      'order_id',
      'shipment_id',
      'sequence',
      'occurred_at',
      'received_at',
      'outcome',
      'delivery_deadline',
      'policy_code',
      'payload_hash',
      'signature',
      'receipt_id',
    ],
  },
  {
    table: 'carrier_pickup_reviews',
    collection: 'carrier_pickup_reviews',
    columns: ['id', 'order_id', 'event_id', 'opened_at', 'reason'],
  },
  {
    table: 'order_delivery_reviews',
    collection: 'order_delivery_reviews',
    columns: [
      'id',
      'order_id',
      'pickup_event_id',
      'opened_at',
      'opened_by',
      'policy_code',
      'receipt_id',
    ],
  },
  {
    table: 'order_non_receipt_reports',
    collection: 'order_non_receipt_reports',
    columns: ['id', 'order_id', 'submitted_at', 'description', 'receipt_id'],
  },
  {
    table: 'workflow_contexts',
    collection: 'workflow_contexts',
    columns: ['id', 'kind', 'order_id', 'version', 'ownership_phase'],
    lockable: true,
  },
  {
    table: 'workflow_items',
    collection: 'workflow_items',
    columns: [
      'context_id',
      'listing_id',
      'listing_revision_id',
      'catalog_revision_id',
      'snapshot',
    ],
    id: ['context_id', 'listing_id'],
  },
  {
    table: 'agreement_snapshots',
    collection: 'agreement_snapshots',
    columns: ['context_id', 'snapshot'],
    id: ['context_id'],
  },
  {
    table: 'exclusive_commitments',
    collection: 'exclusive_commitments',
    columns: [
      'id',
      'listing_id',
      'current_context_id',
      'version',
      'status',
      'acquired_at',
      'ended_at',
      'reason',
    ],
    lockable: true,
  },
  {
    table: 'commitment_events',
    collection: 'commitment_events',
    columns: [
      'id',
      'commitment_id',
      'sequence',
      'kind',
      'before_version',
      'after_version',
      'receipt_id',
      'occurred_at',
    ],
  },
  {
    table: 'wallet_accounts',
    collection: 'wallet_accounts',
    columns: ['id', 'owner_id', 'order_id', 'purpose', 'currency'],
  },
  {
    table: 'topup_intents',
    collection: 'topup_intents',
    columns: [
      'id',
      'owner_id',
      'amount',
      'currency',
      'state',
      'version',
      'created_at',
      'updated_at',
    ],
    lockable: true,
  },
  {
    table: 'simulated_payment_events',
    collection: 'simulated_payment_events',
    columns: [
      'id',
      'intent_id',
      'provider',
      'payload_hash',
      'recipient_id',
      'amount',
      'currency',
      'outcome',
      'disposition',
      'occurred_at',
      'received_at',
      'receipt_id',
    ],
  },
  {
    table: 'ledger_journals',
    collection: 'ledger_journals',
    columns: [
      'id',
      'sequence',
      'type',
      'topup_id',
      'event_id',
      'order_id',
      'receipt_id',
      'posted_at',
    ],
  },
  {
    table: 'ledger_entries',
    collection: 'ledger_entries',
    columns: ['journal_id', 'account_id', 'debit', 'credit'],
    id: ['journal_id', 'account_id'],
  },
];

// Collections pre-filled by migration 0002; the import requires them to hold
// exactly what PostgreSQL holds (the opening journal is replaced by the
// PostgreSQL original so its posting time is preserved).
const REFERENCE = [
  'service_areas',
  'service_localities',
  'sale_quote_policies',
  'sale_quote_policy_selection',
];

export interface ImportReport {
  source: { migrations: number };
  collections: Record<
    string,
    { rows: number; documents: number; hash: string; truncatedTimes: number }
  >;
  mismatches: string[];
  integrity: IntegrityReport | null;
}

// Values ready for hashing: Dates as ISO strings, keys sorted.
function hashable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(hashable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, hashable(v)]),
    );
  return value;
}
const contentHash = (docs: Document[]) =>
  createHash('sha256')
    .update(
      canonicalJson(
        [...docs]
          .sort((a, b) => String(a._id).localeCompare(String(b._id)))
          .map(hashable),
      ),
    )
    .digest('hex');

// PostgreSQL timestamptz (JSON text, microseconds) -> Date, counting
// sub-millisecond truncation (MongoDB dates are milliseconds).
export function parseTimestamp(text: string, truncated: { count: number }) {
  const match = /\.(\d+)/.exec(text);
  if (match && match[1].length > 3 && /[1-9]/.test(match[1].slice(3)))
    truncated.count++;
  return new Date(text);
}

type Snapshot = {
  rows: Record<string, Row[]>;
  types: Record<string, Record<string, string>>;
  truncated: Record<string, { count: number }>;
  migrations: number;
};

export async function readSnapshot(pg: Client): Promise<Snapshot> {
  const truncated: Snapshot['truncated'] = {};
  const types: Snapshot['types'] = {};
  await pg.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await pg.query("SET LOCAL timezone = 'UTC'");
    const applied = (
      await pg.query<{ migration_name: string }>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
      )
    ).rows.map((r) => r.migration_name);
    if (canonicalJson(applied) !== canonicalJson(EXPECTED_POSTGRES_MIGRATIONS))
      throw new Error(
        'Source PostgreSQL schema is not the F2h baseline (migration history differs).',
      );
    const rows: Snapshot['rows'] = {};
    for (const spec of [
      ...TABLES,
      { table: 'user_roles', collection: 'user_roles' },
    ]) {
      truncated[spec.collection] = { count: 0 };
      types[spec.collection] = Object.fromEntries(
        (
          await pg.query<{ column_name: string; data_type: string }>(
            'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
            [spec.table],
          )
        ).rows.map((c) => [c.column_name, c.data_type]),
      );
      // to_jsonb keeps microseconds (as text) and exact integers.
      const result = await pg.query<{ row: Row }>(
        `SELECT to_jsonb(t) AS row FROM "${spec.table}" t`,
      );
      rows[spec.collection] = result.rows.map((r) => r.row);
    }
    await pg.query('COMMIT');
    return { rows, types, truncated, migrations: applied.length };
  } catch (error) {
    await pg.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

// Converts one JSON column value by its PostgreSQL type.
function convert(
  raw: unknown,
  type: string,
  truncated: { count: number },
): unknown {
  if (raw === null || raw === undefined) return null;
  if (type === 'timestamp with time zone')
    return parseTimestamp(String(raw), truncated);
  if (type === 'bigint' || type === 'integer') {
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) throw new Error('Integer out of range');
    return n;
  }
  return raw;
}

export function toDocuments(snapshot: Snapshot): Record<string, Document[]> {
  const out: Record<string, Document[]> = {};
  const value = (row: Row, column: string, collection: string) =>
    convert(
      row[column],
      snapshot.types[collection][column],
      snapshot.truncated[collection],
    );
  const roles = new Map<string, { role: string; grantedAt: Date }[]>();
  for (const row of snapshot.rows.user_roles) {
    const userId = String(row.user_id);
    roles.set(userId, [
      ...(roles.get(userId) ?? []),
      {
        role: String(row.role),
        grantedAt: value(row, 'granted_at', 'user_roles') as Date,
      },
    ]);
  }
  for (const spec of TABLES) {
    out[spec.collection] = snapshot.rows[spec.collection].map((row) => {
      const doc: Document = {
        _id: (spec.id ?? ['id']).map((c) => String(row[c])).join(':'),
      };
      for (const column of spec.columns) {
        if (spec.id?.length === 1 && spec.id[0] === column) continue;
        if (column === 'id') continue;
        doc[camel(column)] = value(row, column, spec.collection);
      }
      if (spec.lockable) doc.lockSeq = 0;
      // PostgreSQL had Order contexts only (migration 0008 adds AuctionIntake).
      if (spec.collection === 'workflow_contexts') doc.auctionIntakeId = null;
      return doc;
    });
  }
  const ROLE_ORDER = ['MEMBER', 'STAFF', 'ADMIN', 'TEST_OPERATOR'];
  for (const user of out.users)
    user.roles = (roles.get(user._id) ?? []).sort(
      (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
  const revisions = new Map(
    out.catalog_revisions.map((r) => [r._id, String(r.title)]),
  );
  for (const book of out.catalog_books)
    book.titleKey = titleKey(revisions.get(book.currentRevisionId) ?? '');
  for (const receipt of out.mutation_receipts)
    receipt.principal = receipt.actorId
      ? `user:${receipt.actorId}`
      : `system:${receipt.systemActor}`;
  return out;
}

export async function importPostgres(
  pg: Client,
  client: MongoClient,
  db: Db,
  log: (line: string) => void = () => undefined,
): Promise<ImportReport> {
  const snapshot = await readSnapshot(pg);
  log(`Read snapshot: ${snapshot.migrations} PostgreSQL migrations verified.`);
  const docs = toDocuments(snapshot);
  const mismatches: string[] = [];
  // Target: migrated MongoDB with only migration 0002 reference data.
  for (const spec of TABLES) {
    const existing = await db.collection(spec.collection).countDocuments();
    if (
      existing &&
      !REFERENCE.includes(spec.collection) &&
      !['wallet_accounts', 'ledger_journals', 'ledger_entries'].includes(
        spec.collection,
      )
    )
      throw new Error(
        `Target collection ${spec.collection} is not empty; import needs a freshly migrated database.`,
      );
  }
  for (const name of REFERENCE) {
    const target = await db.collection(name).find().toArray();
    if (contentHash(target) !== contentHash(docs[name]))
      throw new Error(`Reference data ${name} differs between the databases.`);
  }
  // Replace migration 0002's simulator ledger with the PostgreSQL original.
  await db
    .collection('ledger_entries')
    .deleteMany({ journalId: OPENING_JOURNAL_ID });
  await db
    .collection('ledger_journals')
    .deleteMany({ _id: OPENING_JOURNAL_ID as never });
  await db.collection('wallet_accounts').deleteMany({
    _id: { $in: referenceData.wallet_accounts.map((a) => a._id) } as never,
  });
  for (const spec of TABLES) {
    if (REFERENCE.includes(spec.collection)) continue;
    const batch = docs[spec.collection];
    for (let i = 0; i < batch.length; i += 1000)
      await db
        .collection(spec.collection)
        .insertMany(batch.slice(i, i + 1000), { ordered: true });
    log(`Imported ${spec.collection}: ${batch.length}`);
  }
  const maxSequence = Math.max(
    0,
    ...docs.ledger_journals.map((j) => Number(j.sequence)),
  );
  await db
    .collection('counters')
    .updateOne(
      { _id: LEDGER_SEQUENCE_COUNTER as never },
      { $set: { value: maxSequence } },
      { upsert: true },
    );
  for (const account of docs.wallet_accounts)
    await db
      .collection('account_locks')
      .updateOne(
        { _id: account._id },
        { $setOnInsert: { lockSeq: 0 } },
        { upsert: true },
      );
  const collections: ImportReport['collections'] = {};
  for (const spec of TABLES) {
    // These exact reference accounts are MongoDB-native (0012/0022), with no
    // PostgreSQL row. Keep them while comparing every imported account/hash.
    const stored = (
      await db.collection(spec.collection).find().toArray()
    ).filter(
      (d) =>
        spec.collection !== 'wallet_accounts' ||
        ![PLATFORM_COMMISSION_ACCOUNT_ID, LISTING_FEE_CLEARING_ID].includes(
          String(d._id),
        ),
    );
    const expected = contentHash(docs[spec.collection]);
    collections[spec.collection] = {
      rows: snapshot.rows[spec.collection].length,
      documents: stored.length,
      hash: expected,
      truncatedTimes: snapshot.truncated[spec.collection].count,
    };
    if (
      stored.length !== snapshot.rows[spec.collection].length ||
      contentHash(stored) !== expected
    )
      mismatches.push(spec.collection);
  }
  const integrity = await runTransaction(
    client,
    db,
    (tx) => checkIntegrity(tx),
    { maxRetryMs: 60000 },
  );
  return {
    source: { migrations: snapshot.migrations },
    collections,
    mismatches,
    integrity,
  };
}
