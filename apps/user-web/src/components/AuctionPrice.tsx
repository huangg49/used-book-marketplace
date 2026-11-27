import { useEffect, useRef, useState } from 'react'
import { useAuctionChangeMotion } from '../hooks/useAuctionMotion'
import { priceFrames } from '../lib/auction-motion'
import { formatVnd } from '../lib/routes'
import styles from './AuctionPrice.module.css'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function TickerDigit({ digit, delayMs, settled }: { digit: number; delayMs: number; settled: boolean }) {
  const shown = settled ? digit : 0
  return (
    <span className={styles.slot}>
      <span
        className={styles.reel}
        style={{
          transform: `translate3d(0, -${shown * 10}%, 0)`,
          transitionDelay: `${delayMs}ms`,
        }}
      >
        {DIGITS.map((n) => (
          <span key={n} className={styles.glyph}>{n}</span>
        ))}
      </span>
    </span>
  )
}

/**
 * Rolling-digit number ticker for live auction prices.
 * Keeps the exact formatted currency in an sr-only span so screen readers and
 * instant DOM assertions always read live server truth while visible digits
 * glide vertically on mount and on every live price update.
 */
export function AuctionPrice({ auctionId, amount }: { auctionId: string; amount: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [settled, setSettled] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden')
  useAuctionChangeMotion(auctionId, amount, ref, priceFrames)

  useEffect(() => {
    if (settled) return
    const el = ref.current
    let raf1 = 0
    let raf2 = 0
    const startRoll = () => {
      // Double rAF guarantees the browser paints the starting 0-digit frame
      // before transitioning to the target digits.
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setSettled(true))
      })
    }
    if (!el || typeof IntersectionObserver === 'undefined') {
      startRoll()
      return () => {
        if (raf1) cancelAnimationFrame(raf1)
        if (raf2) cancelAnimationFrame(raf2)
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          startRoll()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [settled])

  const formatted = formatVnd(amount)
  const chars = [...formatted]
  // Index from the right so adding a leading digit (90.000 -> 100.000) keeps
  // existing digit columns stable and rolls smoothly without remounting.
  const total = chars.length
  let digitOrder = 0

  return (
    <span ref={ref} className={styles.root}>
      <span className={styles.srOnly}>{formatted}</span>
      <span className={styles.visual} aria-hidden="true">
        {chars.map((char, idx) => {
          const rightIndex = total - 1 - idx
          if (char >= '0' && char <= '9') {
            const delay = Math.min(digitOrder * 65, 360)
            digitOrder += 1
            return (
              <TickerDigit
                key={`d-${rightIndex}`}
                digit={Number(char)}
                delayMs={delay}
                settled={settled}
              />
            )
          }
          return (
            <span key={`s-${rightIndex}-${char}`} className={styles.sep}>
              {char}
            </span>
          )
        })}
      </span>
    </span>
  )
}
