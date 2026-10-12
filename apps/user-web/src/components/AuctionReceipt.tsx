import { useLayoutEffect, useRef } from 'react'
import { Gavel } from 'lucide-react'
import { playAuctionMotion, standingFrames } from '../lib/auction-motion'
import styles from './AuctionReceipt.module.css'

/** Mounted only after a known successful command response, never optimistically. */
export function AuctionReceipt({ message, bid }: { message: string; bid: boolean }) {
  const sheet = useRef<HTMLDivElement>(null)
  const gavel = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const stopSheet = playAuctionMotion(sheet.current, standingFrames, 280)
    const stopGavel = bid ? playAuctionMotion(gavel.current, [
      { transform: 'rotate(-18deg)' },
      { transform: 'rotate(8deg)', offset: 0.6 },
      { transform: 'rotate(0)' },
    ], 380) : () => {}
    return () => { stopSheet(); stopGavel() }
  }, [bid])
  return <div ref={sheet} className={styles.receipt} role="status">
    {bid && <Gavel ref={gavel} size={20} aria-hidden="true" />}
    <p>{message}</p>
  </div>
}
