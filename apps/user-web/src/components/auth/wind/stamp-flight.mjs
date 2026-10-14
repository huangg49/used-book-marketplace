import { STACK_DURATION } from './stack.mjs';

export const STAMP_DURATION = 280;
export const STAMP_FLIGHT_DURATION = STAMP_DURATION + STACK_DURATION;
const clamp = value => Math.max(0, Math.min(1, value));
// Same cubic-bezier(.16, 1, .3, 1) as AuthLayout's stampHit.
function stampEase(x) {
  if (x <= 0 || x >= 1) return clamp(x);
  let low = 0, high = 1;
  for (let i = 0; i < 20; i++) {
    const t = (low + high) / 2;
    const curveX = 3 * (1 - t) ** 2 * t * .16 + 3 * (1 - t) * t * t * .3 + t ** 3;
    if (curveX < x) low = t; else high = t;
  }
  return 1 - (1 - (low + high) / 2) ** 3;
}
export function stampFlightFrame(progress) {
  const time = clamp(progress) * STAMP_FLIGHT_DURATION;
  const stampProgress = clamp(time / STAMP_DURATION), hit = stampEase(stampProgress);
  return { stampProgress, opacity: hit, scale: 1.6 - .6 * hit,
    flightProgress: clamp((time - STAMP_DURATION) / STACK_DURATION) };
}
