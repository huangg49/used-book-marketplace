import { TABLES, toDocuments } from './postgres-import.js';

describe('legacy snapshot catalog projection', () => {
  it('derives interior title/author keys only from the current revision and preserves source versions', () => {
    const rows: Record<string, Record<string, unknown>[]> = Object.fromEntries(
      TABLES.map((t) => [t.collection, []]),
    );
    rows.user_roles = [];
    rows.catalog_books = [
      { id: 'book', current_revision_id: 'current', version: 7 },
    ];
    rows.catalog_revisions = [
      { id: 'old', title: 'Cũ không dùng', authors: ['Tác giả cũ'] },
      {
        id: 'current',
        title: '45 chương mở đầu Doraemon - Tập 1',
        authors: ['Fujiko F. Fujio'],
      },
    ];
    const result = toDocuments({
      rows,
      types: Object.fromEntries(TABLES.map((t) => [t.collection, {}])),
      truncated: {},
      migrations: 17,
    });
    expect(result.catalog_books[0]).toMatchObject({
      _id: 'book',
      version: 7,
      currentRevisionId: 'current',
      recoveryKeys: expect.arrayContaining(['dor', 'fuj']),
    });
    expect(result.catalog_books[0].recoveryKeys).not.toContain('cu');
    expect(rows.catalog_books[0]).not.toHaveProperty('recoveryKeys');
  });
});
