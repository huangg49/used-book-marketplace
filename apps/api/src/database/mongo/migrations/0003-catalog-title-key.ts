import type { Db } from 'mongodb';
import { index, t, type CollectionSpec } from '../schema-dsl.js';

// PostgreSQL sorted the public catalog by an expression computed in SQL:
// replace(regexp_replace(normalize(lower(title), NFD), '[\u0300-\u036f]', ''), '\u0111', 'd').
// MongoDB cannot NFD-normalize, so the key is stored on the book whenever its
// current revision changes, and indexed for the keyset order.
export const titleKey = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd');

export const catalogTitleKey = {
  collection: 'catalog_books',
  property: { titleKey: t.str() },
  index: index(
    { status: 1, titleKey: 1, _id: 1 },
    'catalog_books_status_title_key_id_idx',
  ),
};

export function withTitleKey(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== catalogTitleKey.collection) return spec;
  const schema = spec.schema as {
    required: string[];
    properties: Record<string, unknown>;
  };
  return {
    ...spec,
    schema: {
      ...spec.schema,
      required: [...schema.required, 'titleKey'],
      properties: { ...schema.properties, ...catalogTitleKey.property },
    },
    indexes: [...spec.indexes, catalogTitleKey.index],
  };
}

// Backfills books created before this migration from their current revision.
export async function backfillTitleKeys(db: Db) {
  const books = db.collection<{
    _id: string;
    currentRevisionId: string | null;
    titleKey?: string;
  }>('catalog_books');
  for await (const book of books.find({ titleKey: { $exists: false } })) {
    const revision = book.currentRevisionId
      ? await db
          .collection<{ _id: string; title: string }>('catalog_revisions')
          .findOne({ _id: book.currentRevisionId })
      : null;
    await books.updateOne(
      { _id: book._id },
      { $set: { titleKey: revision ? titleKey(revision.title) : '' } },
      { bypassDocumentValidation: true },
    );
  }
}
