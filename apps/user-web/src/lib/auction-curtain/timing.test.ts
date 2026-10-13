import { describe, expect, it } from 'vitest'
import { frameOpacity } from './model.mjs'
import { elapsedToCurtainTime, entranceDuration, fadeStart } from './timing'

describe('auction frame exit timing', () => {
  it('preserves the opening pace and accelerates only the final fade by two', () => {
    expect(elapsedToCurtainTime(450)).toBe(900)
    expect(elapsedToCurtainTime(1240)).toBe(2480)
    expect(fadeStart).toBe(1270)
    expect(elapsedToCurtainTime(fadeStart)).toBe(2540)
    expect(entranceDuration - fadeStart).toBe(115)
    expect(frameOpacity(elapsedToCurtainTime(fadeStart + 57.5))).toBeCloseTo(.5)
    expect(elapsedToCurtainTime(entranceDuration)).toBe(3000)
  })
  it('keeps the fade boundary continuous and clamps late or negative timestamps', () => {
    expect(elapsedToCurtainTime(fadeStart + .001) - elapsedToCurtainTime(fadeStart - .001)).toBeCloseTo(.006)
    expect(elapsedToCurtainTime(-1)).toBe(0)
    expect(elapsedToCurtainTime(4000)).toBe(3000)
  })
})
