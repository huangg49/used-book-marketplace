import type { Withdrawal } from '@used-books/session-client';

type PendingWithdrawalPage = {
  items: Pick<Withdrawal, 'id' | 'state'>[];
  nextCursor: string | null;
};

/** Publish a count only after the whole filtered list has been read. */
export async function collectPendingWithdrawalIds(
  readPage: (cursor: string | null) => Promise<PendingWithdrawalPage>,
  signal: AbortSignal,
): Promise<string[]> {
  const ids = new Set<string>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    signal.throwIfAborted();
    if (cursor) {
      if (seen.has(cursor)) throw new Error('Withdrawal pagination cursor repeated');
      seen.add(cursor);
    }
    const page = await readPage(cursor);
    // The shared transport owns the HTTP timeout. Stop the remaining pages even
    // when that in-flight request finishes after the query lost its observer.
    signal.throwIfAborted();
    for (const row of page.items) {
      if (row.state === 'Requested') ids.add(row.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return [...ids];
}
