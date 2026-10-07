// POL-29 point hours: 09:00–18:00 every day, Asia/Ho_Chi_Minh (UTC+7, no
// daylight saving). Direct handover only happens while a point is open, and a
// handover deadline that falls outside opening hours moves to the closing time
// of the next opening day (LOCAL-AUCTION-01 §2). Deadlines are absolute UTC
// instants snapshotted when set; this module never reads the clock itself.

const OFFSET_MS = 7 * 3_600_000;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;
const DAY_MS = 86_400_000;

const localHour = (at: Date) =>
  new Date(at.getTime() + OFFSET_MS).getUTCHours();
// UTC instant of local `hour`:00 on the local calendar day containing `at`.
const atLocalHour = (at: Date, hour: number) => {
  const local = new Date(at.getTime() + OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hour,
    ) - OFFSET_MS,
  );
};

export function isPointOpen(at: Date) {
  const hour = localHour(at);
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

// Deadline `ms` after `from`; outside hours it moves to the next closing time.
export function pointDeadline(from: Date, ms: number) {
  const raw = new Date(from.getTime() + ms);
  if (isPointOpen(raw)) return raw;
  const hour = localHour(raw);
  const closing = atLocalHour(raw, CLOSE_HOUR);
  // Before opening: today's closing time. At/after closing: tomorrow's.
  return hour < OPEN_HOUR ? closing : new Date(closing.getTime() + DAY_MS);
}
