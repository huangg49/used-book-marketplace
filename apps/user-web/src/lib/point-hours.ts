// POL-29: points open 09:00–18:00 Asia/Ho_Chi_Minh (UTC+7, no DST), the same
// rule the API applies at handover (apps/api/.../auctions/point-hours.ts). A
// pickup code lives 10 minutes and staff hand over only while the point is
// open, so outside those hours the client shows the next opening instead.
const VN_OFFSET_MS = 7 * 3_600_000
const OPEN_HOUR = 9
const CLOSE_HOUR = 18

/** The next 09:00 (UTC ISO) when the point is closed at `nowMs`, else null. */
export function pointReopensAt(nowMs: number): string | null {
  if (!Number.isFinite(nowMs)) return null
  const local = new Date(nowMs + VN_OFFSET_MS)
  const hour = local.getUTCHours()
  if (hour >= OPEN_HOUR && hour < CLOSE_HOUR) return null
  const day = local.getUTCDate() + (hour >= CLOSE_HOUR ? 1 : 0)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), day, OPEN_HOUR) - VN_OFFSET_MS).toISOString()
}
