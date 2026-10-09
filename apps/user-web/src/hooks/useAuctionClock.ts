import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@used-books/session-client'

/**
 * Remaining time to `endAt` measured on the server clock: `serverTime` from the
 * last response fixes the offset, so a wrong device clock never shows a closed
 * auction as open. The server still decides; this is only a display.
 */
export function useCountdown(endAt: string | undefined, serverTime: string | undefined) {
  const [ms, setMs] = useState(() => (endAt ? Math.max(0, Date.parse(endAt) - Date.parse(serverTime ?? endAt)) : 0))
  useEffect(() => {
    if (!endAt) return
    const offset = serverTime ? Date.parse(serverTime) - Date.now() : 0
    const tick = () => setMs(Math.max(0, Date.parse(endAt) - (Date.now() + offset)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [endAt, serverTime])
  return ms
}

/** `compact` gives h:mm:ss for narrow places such as cards. */
export function formatRemaining(ms: number, compact = false) {
  if (ms <= 0) return 'Đã hết giờ'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  if (h === 0) return `${mm}:${ss}`
  return compact ? `${h}:${mm}:${ss}` : `${h} giờ ${mm} phút`
}

/**
 * One Idempotency-Key per intent. A retry of the same intent after a lost or
 * failed response reuses the key, so the server replays instead of acting twice.
 * The key is dropped only once the outcome is known.
 */
export function useIntentKey() {
  const pending = useRef<{ signature: string; key: string } | null>(null)
  return {
    keyFor(signature: string) {
      if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() }
      return pending.current.key
    },
    settle() { pending.current = null },
  }
}

/** True when the server may or may not have committed the command. */
export function outcomeUnknown(error: unknown) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500
}
