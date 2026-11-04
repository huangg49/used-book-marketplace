import { describe, expect, it, vi } from 'vitest';
import { ApiError, type SessionClient } from '@used-books/session-client';
import type { z } from 'zod';
import { createListingActions } from './listing-actions';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  let owner: string | undefined = id(1);
  const listeners = new Set<() => void>();
  const request = vi.fn(async (_path: string, schema: z.ZodType, _init?: RequestInit) => schema.parse({ entityId: id(10), version: 2 }));
  const client = { request, getSnapshot: () => owner ? { status: 'authenticated', user: { id: owner } } : { status: 'anonymous' },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } } as unknown as SessionClient;
  return { actions: createListingActions(client), request,
    switchOwner(next: string | undefined) { owner = next; listeners.forEach(listener => listener()); } };
}
describe('listing lifecycle action intents', () => {
  it('shares a concurrent request and keeps the original version/body/key after a lost ACK', async () => {
    const f = fixture();
    let release!: () => void;
    f.request.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); throw new Error('Lost ACK'); });
    const first = f.actions.send({ kind: 'visibility', listingId: id(10), visibility: 'Hidden' }, 1, () => 'original');
    const second = f.actions.send({ kind: 'visibility', listingId: id(10), visibility: 'Hidden' }, 99, () => 'replacement');
    expect(first === second).toBe(true);
    await Promise.resolve();
    expect(f.request).toHaveBeenCalledTimes(1);
    release();
    await expect(first).rejects.toThrow('Lost ACK');
    expect(f.actions.pending()).toEqual([{ kind: 'visibility', listingId: id(10), visibility: 'Hidden', busy: false }]);
    expect(() => f.actions.send({ kind: 'archive', listingId: id(10) }, 2, () => 'opposite')).toThrow(/xác minh/);
    expect(() => f.actions.send({ kind: 'visibility', listingId: id(10), visibility: 'Visible' }, 2, () => 'opposite')).toThrow(/xác minh/);
    await f.actions.retry(id(10));
    expect(f.request).toHaveBeenCalledTimes(2);
    const a = f.request.mock.calls[0]!, b = f.request.mock.calls[1]!;
    expect(a[0] === b[0] && JSON.stringify(a[2]) === JSON.stringify(b[2])).toBe(true);
    expect(f.actions.pending()).toHaveLength(0);
  });
  it.each([0, 401, 403, 408, 429, 500, 503])('keeps an unresolved HTTP%s archive', async status => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new ApiError(status, 'QA_UNKNOWN', 'Synthetic failure'));
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'original')).rejects.toThrow();
    expect(f.actions.pending()).toHaveLength(1);
    await f.actions.retry(id(10));
    expect(f.actions.pending()).toHaveLength(0);
  });
  it.each([400, 404, 409, 422])('freezes a definitive HTTP%s refusal until a successful explicit read', async status => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new ApiError(status, 'QA_REFUSED', 'Synthetic refusal'));
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'first')).rejects.toThrow();
    expect(f.actions.pending()[0]).toMatchObject({ refused: true, busy: false });
    await expect(f.actions.retry(id(10))).rejects.toThrow();
    expect(f.request).toHaveBeenCalledTimes(1);
    await expect(f.actions.reconcile(id(10), async () => { throw new Error('Read failed'); })).rejects.toThrow();
    expect(f.actions.pending()).toHaveLength(1);
    await f.actions.reconcile(id(10), async () => undefined);
    expect(f.actions.pending()).toHaveLength(0);
    await f.actions.send({ kind: 'visibility', listingId: id(10), visibility: 'Hidden' }, 2, () => 'new');
    expect(f.request.mock.calls[1]?.[2]?.headers).toEqual({ 'Idempotency-Key': 'new' });
  });
  it('rejects wrong receipt identity and retains recovery', async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce({ entityId: id(11), version: 2 });
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'original')).rejects.toThrow(/identity|receipt/i);
    expect(f.actions.pending()).toHaveLength(1);
  });
  it('never substitutes a read for a receipt when the command outcome is unknown', async () => {
    const f = fixture(), read = vi.fn();
    f.request.mockRejectedValueOnce(new Error('Lost ACK'));
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'original')).rejects.toThrow();
    expect(() => f.actions.reconcile(id(10), read)).toThrow(/bị từ chối/);
    expect(read).not.toHaveBeenCalled();
    expect(f.actions.pending()).toHaveLength(1);
  });
  it('coalesces explicit reconciliation and rejects a read completed after account change', async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(new ApiError(409, 'VERSION_CONFLICT', 'Conflict'));
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'old')).rejects.toThrow();
    let release!: () => void;
    const read = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const first = f.actions.reconcile(id(10), read);
    const second = f.actions.reconcile(id(10), read);
    expect(first === second).toBe(true);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    f.switchOwner(id(2));
    f.request.mockRejectedValueOnce(new Error('New owner unknown'));
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 2, () => 'new')).rejects.toThrow();
    release();
    await expect(first).rejects.toThrow(/Phiên/);
    expect(f.actions.pending()).toHaveLength(1);
  });
  it('refuses dispatch after the account changes before the request starts', async () => {
    const f = fixture();
    const pending = f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'old');
    f.switchOwner(id(2));
    await expect(pending).rejects.toThrow(/Phiên/);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.actions.pending()).toHaveLength(0);
  });
  it('a late old-account ACK cannot erase the new account intent', async () => {
    const f = fixture();
    let release!: (receipt: { entityId: string; version: number }) => void;
    f.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const old = f.actions.send({ kind: 'archive', listingId: id(10) }, 1, () => 'old');
    await Promise.resolve();
    f.switchOwner(id(2));
    f.request.mockRejectedValueOnce(new Error('Unknown new owner request'));
    await expect(f.actions.send({ kind: 'archive', listingId: id(10) }, 3, () => 'new')).rejects.toThrow();
    release({ entityId: id(10), version: 2 });
    await expect(old).rejects.toThrow(/Phiên/);
    expect(f.actions.pending()).toHaveLength(1);
    f.switchOwner(undefined);
    expect(f.actions.pending()).toHaveLength(0);
    expect(() => f.actions.retry(id(10))).toThrow(/Phiên/);
  });
  it('publishes stable snapshots and clones the input decision', async () => {
    const f = fixture(), listener = vi.fn();
    const unsubscribe = f.actions.subscribe(listener);
    const initial = f.actions.getVersion();
    expect(f.actions.getVersion()).toBe(initial);
    const action = { kind: 'visibility' as const, listingId: id(10), visibility: 'Hidden' as 'Hidden' | 'Visible' };
    f.request.mockRejectedValueOnce(new Error('Unknown'));
    const send = f.actions.send(action, 1, () => 'key');
    action.visibility = 'Visible';
    await expect(send).rejects.toThrow();
    expect(f.actions.pending()[0]).toMatchObject({ visibility: 'Hidden' });
    expect(f.actions.getVersion()).toBeGreaterThan(initial);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
