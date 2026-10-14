import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { startAuctionEntrance } from '../lib/auction-entrance'
import { PaperArrivalContext } from './auth/paper-journey'
import styles from './AuctionEntrance.module.css'

export function AuctionEntrance() {
  const root = useRef<HTMLDivElement>(null)
  // Keep the arrival decision for this mount, including after paper is removed.
  // A later navbar visit/Back/reload gets a new mount and its usual curtain.
  const paperArrival = useContext(PaperArrivalContext)
  const [arrivedUnderPaper] = useState(paperArrival)
  useLayoutEffect(() => {
    if (!arrivedUnderPaper && root.current) return startAuctionEntrance(root.current, styles)
  }, [arrivedUnderPaper])
  if (arrivedUnderPaper) return null
  // A body portal avoids the Hero's isolation; its frame begins below navigation.
  // It is decorative; focus, scroll or pointer interaction dismisses it immediately.
  return createPortal(<div ref={root} className={styles.entrance} data-auction-entrance aria-hidden="true" />,
    document.body)
}
