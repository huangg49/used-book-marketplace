import { describe, expect, it, vi } from "vitest";
import { JUMP_MS, SAMPLE_MAX_AGE_MS, ServerClock, createServerNow } from "./server-clock";
import { SessionClient, type Fetcher } from "./session-client";

const SERVER = Date.parse("2026-11-23T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

/** A device whose date runs `skew` ms away from the server, with a controllable monotonic clock. */
function device(skew = 0) {
  const t = { mono: 1_000, wall: SERVER + skew };
  const clock = new ServerClock(() => t.mono, () => t.wall);
  const advance = (ms: number) => {
    t.mono += ms;
    t.wall += ms;
  };
  return { t, clock, advance };
}

describe("ServerClock", () => {
  it("is unsynced until the first timed response", () => {
    expect(new ServerClock().now()).toBeNull();
  });

  it("places serverTime at the round-trip midpoint, whatever the device date says", () => {
    const { t, clock, advance } = device(-5 * 60_000); // device 5 min behind
    const sent = clock.mark();
    advance(200); // server stamps after 100 ms; response arrives at 200 ms
    clock.observe(iso(SERVER + 100), sent, clock.mark());
    expect(clock.now()).toBe(SERVER + 200);
    advance(1_500);
    expect(clock.now()).toBe(SERVER + 1_700);
    expect(t.wall).toBe(SERVER - 5 * 60_000 + 1_700);
  });

  it("keeps the sample with the shortest round trip", () => {
    const { clock, advance } = device();
    let sent = clock.mark();
    advance(40);
    clock.observe(iso(SERVER + 20), sent, clock.mark()); // accurate, rtt 40
    sent = clock.mark();
    advance(2_000);
    // Slow response whose stamp sits early in the trip: midpoint guess is 960 ms off.
    clock.observe(iso(SERVER + 60), sent, clock.mark());
    expect(clock.now()).toBe(SERVER + 2_040);
  });

  it("replaces a best sample once it is older than the max age", () => {
    const { clock, advance } = device();
    let sent = clock.mark();
    advance(40);
    clock.observe(iso(SERVER + 20), sent, clock.mark());
    advance(SAMPLE_MAX_AGE_MS + 1_000);
    sent = clock.mark();
    advance(400);
    // The server clock stepped 3 s ahead meanwhile; a slower, newer sample wins.
    const serverNow = SERVER + 40 + SAMPLE_MAX_AGE_MS + 1_000 + 200 + 3_000;
    clock.observe(iso(serverNow), sent, clock.mark());
    expect(clock.now()).toBe(serverNow + 200);
  });

  it("ignores a device date change: the monotonic clock carries on", () => {
    const { t, clock, advance } = device();
    const sent = clock.mark();
    advance(100);
    clock.observe(iso(SERVER + 50), sent, clock.mark());
    advance(10_000);
    t.wall -= 60 * 60_000; // user sets the date back an hour
    expect(clock.now()).toBe(SERVER + 10_100);
  });

  it("uses the device date after a sleep that paused the monotonic clock", () => {
    const { t, clock, advance } = device();
    const sent = clock.mark();
    advance(100);
    clock.observe(iso(SERVER + 50), sent, clock.mark());
    t.wall += 30 * 60_000; // 30 min asleep; monotonic did not move
    expect(clock.now()).toBe(SERVER + 100 + 30 * 60_000);
  });

  it("re-syncs from the next response after a jump, even a slower one", () => {
    const { t, clock, advance } = device();
    let sent = clock.mark();
    advance(20);
    clock.observe(iso(SERVER + 10), sent, clock.mark());
    t.wall += 60 * 60_000; // date set forward an hour: shown as later until re-sync
    expect(clock.now()).toBe(SERVER + 20 + 60 * 60_000);
    sent = clock.mark();
    advance(300);
    clock.observe(iso(SERVER + 170), sent, clock.mark());
    expect(clock.now()).toBe(SERVER + 320);
  });

  it("tolerates small disagreement between the two clocks", () => {
    const { t, clock, advance } = device();
    const sent = clock.mark();
    advance(100);
    clock.observe(iso(SERVER + 50), sent, clock.mark());
    t.wall += JUMP_MS - 1;
    expect(clock.now()).toBe(SERVER + 100);
  });

  it("ignores responses without a valid serverTime", () => {
    const { clock } = device();
    clock.observe(undefined, 0, 10);
    clock.observe("not a date", 0, 10);
    clock.observe(iso(SERVER), 10, 5);
    expect(clock.now()).toBeNull();
  });
});

describe("createServerNow", () => {
  it("prefers the synced clock over the offset of possibly cached data", () => {
    const { clock, advance } = device();
    const sent = clock.mark();
    advance(100);
    clock.observe(iso(SERVER + 50), sent, clock.mark());
    // Cached data stamped 20 s ago must not add 20 s to a countdown.
    const now = createServerNow(iso(SERVER - 20_000), clock);
    expect(now()).toBe(SERVER + 100);
  });

  it("falls back to the data's offset before the first timed response", () => {
    vi.useFakeTimers();
    vi.setSystemTime(SERVER);
    try {
      const now = createServerNow(iso(SERVER + 7_000), new ServerClock());
      vi.advanceTimersByTime(1_000);
      expect(now()).toBe(SERVER + 8_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the device date when the data has no serverTime", () => {
    const { clock, advance } = device(90_000);
    const sent = clock.mark();
    advance(10);
    clock.observe(iso(SERVER), sent, clock.mark());
    const before = Date.now();
    const value = createServerNow(undefined, clock)();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});

describe("SessionClient feeds the clock", () => {
  const storage = { read: async () => null, write: async () => {}, clear: async () => {} };

  it("times each request and records a top-level serverTime", async () => {
    const { clock, advance } = device(-120_000);
    const fetcher: Fetcher = async () => {
      advance(80);
      return new Response(JSON.stringify({ items: [], serverTime: iso(SERVER + 40) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new SessionClient("http://api", storage, fetcher, clock);
    const schema = { parse: (value: unknown) => value } as never;
    await client.publicRequest("/auctions", schema);
    expect(clock.now()).toBe(SERVER + 80);
  });

  it("does not sample error responses", async () => {
    const { clock } = device();
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ code: "NOT_FOUND", serverTime: iso(SERVER) }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    const client = new SessionClient("http://api", storage, fetcher, clock);
    await expect(client.publicRequest("/auctions/x", { parse: (v: unknown) => v } as never)).rejects.toThrow();
    expect(clock.now()).toBeNull();
  });
});
