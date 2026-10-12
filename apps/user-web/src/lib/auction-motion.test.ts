import { describe, expect, it, vi } from 'vitest'
import { createAuctionChangeTracker, playAuctionMotion } from './auction-motion'

describe('auction motion follows meaningful server changes', () => {
  it('skips initial data and duplicate snapshots from polling or reconnect', () => {
    const changed = createAuctionChangeTracker()
    expect(changed('alice', undefined)).toBe(false)
    expect(changed('alice', 200000)).toBe(false)
    expect(changed('alice', 200000)).toBe(false)
    expect(changed('alice', 250000)).toBe(true)
    expect(changed('alice', 250000)).toBe(false)
    expect(changed('alice', 350000)).toBe(true)
  })

  it('starts a new baseline when navigating to another auction', () => {
    const changed = createAuctionChangeTracker()
    changed('alice', 250000)
    expect(changed('apothecary', 300000)).toBe(false)
    expect(changed('apothecary', 350000)).toBe(true)
  })

  it('detects both losing and regaining the lead without replaying unchanged standing', () => {
    const changed = createAuctionChangeTracker()
    expect(changed('alice', true)).toBe(false)
    expect(changed('alice', false)).toBe(true)
    expect(changed('alice', false)).toBe(false)
    expect(changed('alice', true)).toBe(true)
  })
})

function target() {
  let finish!: () => void
  let reject!: () => void
  const listeners = new Set<() => void>()
  const animation = { cancel: vi.fn(), finished: new Promise<void>((resolve, fail) => { finish = resolve; reject = fail }) }
  const doc = {
    visibilityState: 'visible',
    defaultView: { innerWidth: 390, innerHeight: 844 },
    addEventListener: vi.fn((_name: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_name: string, listener: () => void) => listeners.delete(listener)),
  }
  const element = {
    ownerDocument: doc,
    getBoundingClientRect: () => ({ top: 100, bottom: 144, left: 20, right: 300, width: 280, height: 44 }),
    animate: vi.fn(() => animation),
  }
  return { node: element as unknown as Element, element, animation, doc, listeners, finish, reject }
}

describe('auction motion lifecycle', () => {
  const frames: Keyframe[] = [{ transform: 'translateY(3px)' }, { transform: 'translateY(0)' }]

  it('settles hidden/offscreen values without starting an animation', () => {
    const t = target()
    t.doc.visibilityState = 'hidden'
    playAuctionMotion(t.node, frames)()
    t.doc.visibilityState = 'visible'
    t.element.getBoundingClientRect = () => ({ top: 900, bottom: 944, left: 20, right: 300, width: 280, height: 44 })
    playAuctionMotion(t.node, frames)()
    expect(t.element.animate).not.toHaveBeenCalled()
    expect(t.listeners.size).toBe(0)
  })

  it('cancels immediately when hidden and releases its visibility listener', () => {
    const t = target()
    playAuctionMotion(t.node, frames)
    t.doc.visibilityState = 'hidden'
    for (const listener of t.listeners) listener()
    expect(t.animation.cancel).toHaveBeenCalledOnce()
    expect(t.listeners.size).toBe(0)
  })

  it('cleans up successful completion and cancelled/rejected animations', async () => {
    const completed = target()
    playAuctionMotion(completed.node, frames)
    completed.finish()
    await Promise.resolve()
    expect(completed.listeners.size).toBe(0)
    const interrupted = target()
    const stop = playAuctionMotion(interrupted.node, frames)
    stop()
    interrupted.reject()
    await Promise.resolve()
    expect(interrupted.animation.cancel).toHaveBeenCalledOnce()
    expect(interrupted.listeners.size).toBe(0)
  })

  it('keeps content usable when WAAPI is unavailable', () => {
    const t = target()
    Object.assign(t.element, { animate: undefined })
    expect(() => playAuctionMotion(t.node, frames)()).not.toThrow()
    expect(t.listeners.size).toBe(0)
  })
})
