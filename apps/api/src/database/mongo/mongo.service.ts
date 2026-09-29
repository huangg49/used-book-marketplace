import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, type Db } from 'mongodb';
import { bindCollections, type Collections } from './collections.js';
import { pendingMigrations } from './migrate.js';
import {
  runTransaction,
  serverNow,
  Tx,
  type TransactionOptions,
} from './transaction.js';

// MongoDB connection for the API and workers (ADR 0027). Connects as the
// least-privilege application user; never creates collections or indexes.
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  readonly client: MongoClient;
  readonly db: Db;
  // Unbound collections for single-statement reads/writes outside transactions.
  readonly c: Collections;

  constructor(config: ConfigService) {
    this.client = new MongoClient(config.getOrThrow<string>('MONGODB_URL'), {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true,
      readPreference: 'primary',
      writeConcern: { w: 'majority' },
    });
    this.db = this.client.db();
    this.c = bindCollections(this.db);
  }

  async onModuleInit() {
    await this.client.connect();
    const pending = await pendingMigrations(this.db);
    if (pending.length)
      throw new Error(
        `MongoDB schema is not current; run mongo:migrate (${pending.join(', ')}).`,
      );
  }
  async onModuleDestroy() {
    await this.client.close();
  }

  tx<T>(fn: (tx: Tx) => Promise<T>, options?: TransactionOptions): Promise<T> {
    return runTransaction(this.client, this.db, fn, options);
  }

  // Server clock outside a transaction (for reads that report serverTime).
  now(): Promise<Date> {
    return serverNow({ db: this.db, session: undefined });
  }
}
