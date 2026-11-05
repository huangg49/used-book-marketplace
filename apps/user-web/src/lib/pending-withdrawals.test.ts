import { describe, expect, it, vi } from 'vitest';
import { collectPendingWithdrawalIds } from './pending-withdrawals';

const requested = (id: string) => ({ id, state: 'Requested' as const });
const signal = () => new AbortController().signal;

describe('pending withdrawal pagination', () => {
  it('collects all pages in order, deduplicates IDs and excludes other states', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ items: [requested('one'), requested('two')], nextCursor: 'a' })
      .mockResolvedValueOnce({ items: [requested('two'), { id: 'other', state: 'Rejected' }], nextCursor: 'b' })
      .mockResolvedValueOnce({ items: [requested('three')], nextCursor: null });
    await expect(collectPendingWithdrawalIds(read, signal())).resolves.toEqual(['one', 'two', 'three']);
    expect(read.mock.calls).toEqual([[null], ['a'], ['b']]);
  });

  it('rejects a cursor cycle before requesting the repeated page', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ items: [requested('one')], nextCursor: 'a' })
      .mockResolvedValueOnce({ items: [requested('two')], nextCursor: 'b' })
      .mockResolvedValueOnce({ items: [requested('three')], nextCursor: 'a' });
    await expect(collectPendingWithdrawalIds(read, signal())).rejects.toThrow('cursor repeated');
    expect(read.mock.calls).toEqual([[null], ['a'], ['b']]);
  });

  it('does not read if the query was already canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(collectPendingWithdrawalIds(read, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled();
  });

  it('stops continuation after an in-flight response finishes on a canceled query', async () => {
    const controller = new AbortController();
    let release!: (page: { items: ReturnType<typeof requested>[]; nextCursor: string }) => void;
    const read = vi.fn(() => new Promise<{ items: ReturnType<typeof requested>[]; nextCursor: string }>(resolve => { release = resolve; }));
    const result = collectPendingWithdrawalIds(read, controller.signal);
    controller.abort();
    release({ items: [requested('one')], nextCursor: 'a' });
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('rejects partial failure and starts fresh on retry', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ items: [requested('stale')], nextCursor: 'a' })
      .mockRejectedValueOnce(new Error('Synthetic unavailable'))
      .mockResolvedValueOnce({ items: [requested('current')], nextCursor: null });
    await expect(collectPendingWithdrawalIds(read, signal())).rejects.toThrow('Synthetic unavailable');
    await expect(collectPendingWithdrawalIds(read, signal())).resolves.toEqual(['current']);
    expect(read.mock.calls).toEqual([[null], ['a'], [null]]);
  });

  it('returns an empty complete list', async () => {
    const read = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    await expect(collectPendingWithdrawalIds(read, signal())).resolves.toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('continues through an empty page when a next cursor exists', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ items: [], nextCursor: 'a' })
      .mockResolvedValueOnce({ items: [requested('one')], nextCursor: null });
    await expect(collectPendingWithdrawalIds(read, signal())).resolves.toEqual(['one']);
    expect(read.mock.calls).toEqual([[null], ['a']]);
  });
});
