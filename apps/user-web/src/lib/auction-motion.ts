/** Local, finite auction feedback. Never queues an old server value for display. */
export function createAuctionChangeTracker() {
  let previous: { identity: string; value: string | number | boolean } | undefined
  return (identity: string, value: string | number | boolean | undefined) => {
    if (value === undefined) return false
    const changed = previous !== undefined && previous.identity === identity && previous.value !== value
    previous = { identity, value }
    return changed
  }
}

export const auctionEase = 'cubic-bezier(0.16, 1, 0.3, 1)'

export const priceFrames: Keyframe[] = [
  { transform: 'translateY(3px)', backgroundColor: 'transparent' },
  { transform: 'translateY(0)', backgroundColor: 'var(--shop-yellow)', offset: 0.2 },
  { transform: 'translateY(0)', backgroundColor: 'transparent' },
]
export const rowFrames: Keyframe[] = [
  { transform: 'translateY(-4px)', backgroundColor: 'var(--shop-yellow)' },
  { transform: 'translateY(0)', backgroundColor: 'transparent' },
]
export const standingFrames: Keyframe[] = [
  { transform: 'translateY(3px)' },
  { transform: 'translateY(0)' },
]
export const sheetFrames: Keyframe[] = [
  { transform: 'translateY(8px) scale(0.99)' },
  { transform: 'translateY(0) scale(1)' },
]

/** OS motion preference is intentionally overridden locally by the project policy.
 * Hidden/offscreen updates settle immediately; returning never replays a backlog.
 */
export function playAuctionMotion(element: Element | null, frames: Keyframe[], duration = 500) {
  if (!element || typeof element.animate !== 'function') return () => {}
  const doc = element.ownerDocument
  const bounds = element.getBoundingClientRect()
  const viewport = doc.defaultView
  if (doc.visibilityState === 'hidden' || !viewport || bounds.width <= 0 || bounds.height <= 0 ||
    bounds.bottom <= 0 || bounds.right <= 0 || bounds.top >= viewport.innerHeight || bounds.left >= viewport.innerWidth)
    return () => {}
  const animation = element.animate(frames, { duration, easing: auctionEase, fill: 'none' })
  const release = () => doc.removeEventListener('visibilitychange', hidden)
  const stop = () => { release(); animation.cancel() }
  const hidden = () => { if (doc.visibilityState === 'hidden') stop() }
  doc.addEventListener('visibilitychange', hidden)
  void animation.finished.then(release, release)
  return stop
}
