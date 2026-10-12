import { useLayoutEffect, useRef, type RefObject } from 'react'
import { createAuctionChangeTracker, playAuctionMotion } from '../lib/auction-motion'

export function useAuctionChangeMotion(
  identity: string,
  value: string | number | boolean | undefined,
  target: RefObject<Element | null>,
  frames: Keyframe[],
  duration = 500,
) {
  const changed = useRef(createAuctionChangeTracker())
  useLayoutEffect(() => {
    if (changed.current(identity, value)) return playAuctionMotion(target.current, frames, duration)
  }, [identity, value, target, frames, duration])
}
