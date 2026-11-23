import { describe, expect, it } from 'vitest'
import { liveImpact, newerSnapshot, privateRefresh } from './auction-live'

const snap = (serverTime: string, over: Partial<{ state: string; phase: string; currentPrice: number | null; endAt: string; leaderAlias: number | null }> = {}) => ({
  serverTime,
  leaderAlias: over.leaderAlias ?? 1,
  auction: {
    state: over.state ?? 'Active',
    phase: over.phase ?? 'Live',
    currentPrice: over.currentPrice === undefined ? 100_000 : over.currentPrice,
    endAt: over.endAt ?? '2026-11-23T10:00:00.000Z',
  },
})

describe('newerSnapshot', () => {
  it('keeps the first snapshot', () => {
    const next = snap('2026-11-23T09:00:00.000Z')
    expect(newerSnapshot(undefined, next)).toBe(next)
  })

  it('never lets an older read replace a newer push (price never steps back)', () => {
    const pushed = snap('2026-11-23T09:00:02.000Z', { currentPrice: 120_000 })
    const lateRest = snap('2026-11-23T09:00:01.000Z', { currentPrice: 110_000 })
    expect(newerSnapshot(pushed, lateRest)).toBe(pushed)
  })

  it('takes a newer read and an equal stamp (Dutch drop at the same instant)', () => {
    const prev = snap('2026-11-23T09:00:01.000Z')
    const newer = snap('2026-11-23T09:00:03.000Z')
    const same = snap('2026-11-23T09:00:01.000Z', { currentPrice: 90_000 })
    expect(newerSnapshot(prev, newer)).toBe(newer)
    expect(newerSnapshot(prev, same)).toBe(same)
  })

  it('does not freeze the cache on an unreadable stamp', () => {
    const prev = snap('not-a-date')
    const next = snap('2026-11-23T09:00:01.000Z')
    expect(newerSnapshot(prev, next)).toBe(next)
  })
})

describe('liveImpact', () => {
  const base = snap('2026-11-23T09:00:00.000Z')

  it('treats a first snapshot as a full change', () => {
    expect(liveImpact(undefined, base)).toEqual({ lifecycle: true, standing: true })
  })

  it('separates a price move from a lifecycle move', () => {
    expect(liveImpact(base, snap('2026-11-23T09:00:01.000Z', { currentPrice: 110_000 }))).toEqual({ lifecycle: false, standing: true })
    expect(liveImpact(base, snap('2026-11-23T09:00:01.000Z', { state: 'AwaitingWinnerPayment', phase: 'Ended' }))).toEqual({ lifecycle: true, standing: false })
    expect(liveImpact(base, snap('2026-11-23T09:00:01.000Z', { leaderAlias: 2 })).standing).toBe(true)
    expect(liveImpact(base, snap('2026-11-23T09:00:01.000Z', { endAt: '2026-11-23T11:00:00.000Z' })).standing).toBe(true)
  })

  it('reports nothing for a repeat of the same data', () => {
    expect(liveImpact(base, snap('2026-11-23T09:00:05.000Z'))).toEqual({ lifecycle: false, standing: false })
  })
})

describe('privateRefresh', () => {
  const price = { lifecycle: false, standing: true }
  const close = { lifecycle: true, standing: false }

  it('reads nothing private for a guest', () => {
    expect(Object.values(privateRefresh(close, 'guest')).some(Boolean)).toBe(false)
  })

  it('leaves a spectator alone on someone else\'s bid', () => {
    expect(privateRefresh(price, 'spectator')).toEqual({ participation: false, wallet: false, notifications: false, pointOrder: false })
  })

  it('refreshes a participant\'s standing, hold and inbox on a price move, not the order', () => {
    expect(privateRefresh(price, 'participant')).toEqual({ participation: true, wallet: true, notifications: true, pointOrder: false })
  })

  it('treats a not-yet-known viewer as a participant', () => {
    expect(privateRefresh(price, 'unknown').participation).toBe(true)
  })

  it('refreshes everything private on a lifecycle change, including the order', () => {
    expect(privateRefresh(close, 'spectator')).toEqual({ participation: true, wallet: true, notifications: true, pointOrder: true })
  })
})
