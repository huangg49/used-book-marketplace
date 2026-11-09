import { describe, expect, it } from 'vitest'
import { pointReopensAt } from './point-hours'

// Vietnam is UTC+7: 09:00 local is 02:00Z, 18:00 local is 11:00Z.
describe('pointReopensAt', () => {
  it('is null while the point is open, including 09:00 and 17:59 local', () => {
    expect(pointReopensAt(Date.parse('2026-11-10T02:00:00Z'))).toBeNull()
    expect(pointReopensAt(Date.parse('2026-11-10T10:59:59Z'))).toBeNull()
  })
  it('after midnight returns 09:00 the same local day', () => {
    // 01:00 local on 10/11.
    expect(pointReopensAt(Date.parse('2026-11-09T18:00:00Z'))).toBe('2026-11-10T02:00:00.000Z')
  })
  it('from 18:00 returns 09:00 the next local day, across a month end', () => {
    expect(pointReopensAt(Date.parse('2026-11-10T11:00:00Z'))).toBe('2026-11-11T02:00:00.000Z')
    expect(pointReopensAt(Date.parse('2026-11-30T15:00:00Z'))).toBe('2026-12-01T02:00:00.000Z')
  })
  it('is null for an unknown clock', () => {
    expect(pointReopensAt(Number.NaN)).toBeNull()
  })
})
