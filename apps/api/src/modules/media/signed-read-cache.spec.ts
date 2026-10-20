import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignedReadCache } from './signed-read-cache.js';

describe('bounded signed-read batching and reuse', () => {
  const caches: SignedReadCache[] = [];
  afterEach(() => {
    caches.splice(0).forEach((c) => c.close());
    vi.useRealTimers();
  });
  function fixture() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    const sign = vi.fn(
      async (keys: string[]) =>
        new Map(
          keys.map((key) => [
            key,
            {
              url: 'https://storage.test/' + key,
              expiresAt: new Date(Date.now() + 120000).toISOString(),
            },
          ]),
        ),
    );
    const cache = new SignedReadCache(sign, () => new Error('unavailable'));
    caches.push(cache);
    return { sign, cache };
  }
  it('keeps the issued expiry on hits and refreshes before expiry without extending the cached grant', async () => {
    const { cache, sign } = fixture();
    const pending = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    const first = await pending;
    vi.setSystemTime(Date.now() + 100000);
    expect(await cache.read('image')).toEqual(first);
    expect(sign).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.parse(first.expiresAt) - 10000);
    const refresh = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    expect((await refresh).expiresAt).not.toBe(first.expiresAt);
    expect(sign).toHaveBeenCalledTimes(2);
  });
  it('caps batches at fifty keys and pending work/cache at one thousand', async () => {
    const { cache, sign } = fixture();
    const first = Promise.all(
      Array.from({ length: 1000 }, (_, i) => cache.read(String(i))),
    );
    await expect(cache.read('overflow')).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(210);
    await first;
    expect(sign.mock.calls).toHaveLength(20);
    expect(sign.mock.calls.every(([keys]) => keys.length <= 50)).toBe(true);
    const extra = cache.read('extra');
    await vi.advanceTimersByTimeAsync(10);
    await extra;
    const evicted = cache.read('0');
    await vi.advanceTimersByTimeAsync(10);
    await evicted;
    expect(sign).toHaveBeenCalledTimes(22);
  });
  it('does not cache failures and permits a later retry', async () => {
    const { cache, sign } = fixture();
    sign.mockRejectedValueOnce(new Error('private provider details'));
    const failure = expect(cache.read('image')).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(10);
    await failure;
    const retry = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    expect((await retry).url).toContain('/image');
  });
  it('rejects an expired or invalid grant instead of caching it', async () => {
    const { cache, sign } = fixture();
    sign.mockResolvedValueOnce(
      new Map([
        ['image', { url: 'https://storage.test/image', expiresAt: 'invalid' }],
      ]),
    );
    const failure = expect(cache.read('image')).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(10);
    await failure;
  });
  it('invalidates cached grants when objects are removed', async () => {
    const { cache, sign } = fixture();
    const first = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    await first;
    cache.clear();
    const second = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    await second;
    expect(sign).toHaveBeenCalledTimes(2);
  });
  it('does not repopulate cache from a signing request started before invalidation', async () => {
    const { cache, sign } = fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const original = sign.getMockImplementation()!;
    sign.mockImplementationOnce(async (keys) => {
      await gate;
      return original(keys);
    });
    const first = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    cache.clear();
    release();
    await first;
    const retry = cache.read('image');
    await vi.advanceTimersByTimeAsync(10);
    await retry;
    expect(sign).toHaveBeenCalledTimes(2);
  });
  it('cleans up queued work on shutdown and refuses new work', async () => {
    const { cache, sign } = fixture();
    const failure = expect(cache.read('image')).rejects.toThrow('unavailable');
    cache.close();
    await failure;
    await vi.advanceTimersByTimeAsync(10);
    expect(sign).not.toHaveBeenCalled();
    await expect(cache.read('image')).rejects.toThrow('unavailable');
  });
});
