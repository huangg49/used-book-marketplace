import { useRef } from 'react'
import { useAuctionChangeMotion } from '../hooks/useAuctionMotion'
import { priceFrames } from '../lib/auction-motion'
import { formatVnd } from '../lib/routes'

export function AuctionPrice({ auctionId, amount }: { auctionId: string; amount: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useAuctionChangeMotion(auctionId, amount, ref, priceFrames)
  return <span ref={ref} style={{ display: 'inline-block' }}>{formatVnd(amount)}</span>
}
