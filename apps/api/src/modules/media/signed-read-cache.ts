export type SignedRead = { url: string; expiresAt: string };
type Pending = {
  resolve: (value: SignedRead) => void;
  reject: (error: unknown) => void;
};

// Only caches storage capabilities, never authorization. Callers must still
// authorize every read and recheck after the remote operation/cache lookup.
export class SignedReadCache {
  private readonly cache = new Map<string, SignedRead>();
  private readonly pending = new Map<string, Promise<SignedRead>>();
  private readonly queue = new Map<string, Pending>();
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private closed = false;
  constructor(
    private readonly sign: (keys: string[]) => Promise<Map<string, SignedRead>>,
    private readonly unavailable: () => Error,
  ) {}

  read(key: string): Promise<SignedRead> {
    if (this.closed) return Promise.reject(this.unavailable());
    const cached = this.cache.get(key);
    if (cached && Date.parse(cached.expiresAt) > Date.now() + 10_000) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve({ ...cached });
    }
    this.cache.delete(key);
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 1000) return Promise.reject(this.unavailable());
    const promise = new Promise<SignedRead>((resolve, reject) => {
      this.queue.set(key, { resolve, reject });
    });
    this.pending.set(key, promise);
    this.schedule();
    return promise;
  }

  clear() {
    this.cache.clear();
    this.generation++;
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const [key, pending] of this.queue) {
      this.pending.delete(key);
      pending.reject(this.unavailable());
    }
    this.queue.clear();
    this.clear();
  }

  private schedule() {
    if (!this.timer && !this.closed)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush();
      }, 10);
  }

  private async flush() {
    const batch = [...this.queue].slice(0, 50);
    for (const [key] of batch) this.queue.delete(key);
    if (this.queue.size) this.schedule();
    const generation = this.generation;
    try {
      const signed = await this.sign(batch.map(([key]) => key));
      for (const [key, pending] of batch) {
        const value = signed.get(key);
        if (
          !value ||
          Date.parse(value.expiresAt) <= Date.now() + 10_000 ||
          !Number.isFinite(Date.parse(value.expiresAt))
        ) {
          pending.reject(this.unavailable());
          continue;
        }
        if (!this.closed && generation === this.generation) {
          this.cache.set(key, value);
          while (this.cache.size > 1000)
            this.cache.delete(this.cache.keys().next().value!);
        }
        pending.resolve({ ...value });
      }
    } catch {
      for (const [, pending] of batch) pending.reject(this.unavailable());
    } finally {
      for (const [key] of batch) this.pending.delete(key);
    }
  }
}
