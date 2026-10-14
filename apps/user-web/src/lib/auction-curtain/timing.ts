import { DURATION } from './model.mjs'

// Preserve the existing 1.5s playback through the start of the frame fade.
// Only the final 230ms fade runs twice as fast, ending after 1385ms in total.
const playbackDuration = 1500
export const fadeStart = 2540 * playbackDuration / DURATION
export const entranceDuration = fadeStart + (playbackDuration - fadeStart) / 2

export function elapsedToCurtainTime(elapsed: number) {
  const playhead = elapsed <= fadeStart ? elapsed : fadeStart + (elapsed - fadeStart) * 2
  return Math.max(0, Math.min(DURATION, playhead * DURATION / playbackDuration))
}
