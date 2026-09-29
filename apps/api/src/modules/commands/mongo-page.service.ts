import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Document } from 'mongodb';
import type { BoundCollection } from '../../database/mongo/collections.js';
import { Keyset, type KeysetOptions } from '../../database/mongo/keyset.js';

// Signed keyset pages over MongoDB aggregation pipelines (cursor v2).
@Injectable()
export class MongoPageService {
  private readonly keyset: Keyset;
  constructor(config: ConfigService) {
    this.keyset = new Keyset(config.getOrThrow<string>('JWT_ACCESS_SECRET'));
  }
  page<T extends Document>(
    collection: BoundCollection<T>,
    pipeline: Document[],
    options: KeysetOptions,
  ) {
    return this.keyset.page(collection, pipeline, options);
  }
}

// Escapes user text for a MongoDB regex, the equivalent of likeLiteral + LIKE.
export const regexLiteral = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
