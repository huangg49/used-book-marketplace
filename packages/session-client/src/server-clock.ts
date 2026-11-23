// Display clock for deadlines the server decides (auction end, payment and
// acceptance windows). The server stays authoritative; this only keeps what a
// countdown shows close to the server clock on any device.
//
// - Each REST response that carries `serverTime` is a sample. The request is
//   timed, and `serverTime` is placed at the midpoint of the round trip, so
//   network delay costs at most half the round trip (NTP-style).
// - The sample with the shortest round trip wins; a sample older than
//   SAMPLE_MAX_AGE_MS is replaced by the next one.
// - Time then advances on the monotonic clock (`performance.now()`), which a
//   user or NTP changing the device date cannot move.
// - The device date is tracked beside it. If the two disagree by more than
//   JUMP_MS, the device slept (some monotonic clocks pause) or its date was
//   changed; the later estimate is shown, so a deadline reads as passed early
//   rather than late, and the next response re-syncs.

export const SAMPLE_MAX_AGE_MS = 120_000;
export const JUMP_MS = 1_000;

type Sample = { server: number; mono: number; wall: number; rtt: number };

const defaultMonotonic = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export class ServerClock {
  private best: Sample | null = null;

  constructor(
    private readonly monotonic: () => number = defaultMonotonic,
    private readonly wall: () => number = () => Date.now(),
  ) {}

  /** A monotonic timestamp for timing one request. */
  mark() {
    return this.monotonic();
  }

  /** Records `serverTime` from a response sent at `sentAt` and received at `receivedAt` (both from mark()). */
  observe(serverTime: unknown, sentAt: number, receivedAt: number) {
    if (typeof serverTime !== "string") return;
    const server = Date.parse(serverTime);
    if (!Number.isFinite(server) || !(receivedAt >= sentAt)) return;
    const rtt = receivedAt - sentAt;
    const mid = sentAt + rtt / 2;
    const sample = { server, mono: mid, wall: this.wall() - (this.monotonic() - mid), rtt };
    const current = this.best;
    if (
      !current ||
      rtt <= current.rtt ||
      mid - current.mono > SAMPLE_MAX_AGE_MS ||
      this.jumped(current)
    )
      this.best = sample;
  }

  /** Server time now in epoch ms, or null before the first timed response. */
  now(): number | null {
    const sample = this.best;
    if (!sample) return null;
    const mono = sample.server + (this.monotonic() - sample.mono);
    const wall = sample.server + (this.wall() - sample.wall);
    return Math.abs(mono - wall) > JUMP_MS ? Math.max(mono, wall) : mono;
  }

  /** For tests. */
  reset() {
    this.best = null;
  }

  private jumped(sample: Sample) {
    const mono = this.monotonic() - sample.mono;
    const wall = this.wall() - sample.wall;
    return Math.abs(mono - wall) > JUMP_MS;
  }
}

/** The clock every SessionClient feeds by default. */
export const serverClock = new ServerClock();

/**
 * A server-time reader for data stamped with `serverTime`.
 * - Synced clock: the shared, round-trip-corrected clock.
 * - Not synced yet (no timed response in this app run): the offset of
 *   `serverTime` against the device date, fixed once now.
 * - No `serverTime`: the device date (local cooldowns, not server deadlines).
 */
export function createServerNow(
  serverTime: string | undefined,
  clock: ServerClock = serverClock,
): () => number {
  if (!serverTime) return () => Date.now();
  const parsed = Date.parse(serverTime);
  const offset = Number.isFinite(parsed) ? parsed - Date.now() : 0;
  return () => clock.now() ?? Date.now() + offset;
}
