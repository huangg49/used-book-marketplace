import { Component, createRef, type ReactNode } from 'react'
import { playAuctionMotion } from '../lib/auction-motion'

type Position = { x: number; y: number }
type Snapshot = Map<string, Position> | null
type Props = { className: string; orderKey: string; children: ReactNode }

/** Measure before React moves the keyed cards, then animate their visual offsets.
 * No cloned exits, delayed content, per-frame React work or layout-library bundle.
 */
export class AuctionGrid extends Component<Props> {
  private root = createRef<HTMLDivElement>()
  private stops: Array<() => void> = []

  private positions() {
    const root = this.root.current
    const positions = new Map<string, Position>()
    if (!root) return positions
    const origin = root.getBoundingClientRect()
    root.querySelectorAll<HTMLElement>(':scope > [data-auction-id]').forEach((card) => {
      const rect = card.getBoundingClientRect()
      positions.set(card.dataset.auctionId!, { x: rect.left - origin.left, y: rect.top - origin.top })
    })
    return positions
  }

  getSnapshotBeforeUpdate(previous: Props): Snapshot {
    if (previous.orderKey === this.props.orderKey || document.visibilityState === 'hidden') return null
    return this.positions()
  }

  componentDidUpdate(_previous: Props, _state: unknown, before: Snapshot) {
    if (!before) return
    // Capture the current visual position before cancelling an interrupted flight.
    this.stop()
    const after = this.positions()
    this.root.current?.querySelectorAll<HTMLElement>(':scope > [data-auction-id]').forEach((card) => {
      const from = before.get(card.dataset.auctionId!)
      const to = after.get(card.dataset.auctionId!)
      if (!from || !to) return // New cards are immediately readable; removed cards leave no ghosts.
      const x = from.x - to.x
      const y = from.y - to.y
      if (Math.abs(x) < 1 && Math.abs(y) < 1) return
      this.stops.push(playAuctionMotion(card, [
        { transform: `translate(${x}px, ${y}px)` },
        { transform: 'translate(0, 0)' },
      ], 220))
    })
  }

  private stop() { this.stops.forEach((stop) => stop()); this.stops = [] }
  componentWillUnmount() { this.stop() }
  render() { return <div ref={this.root} className={this.props.className}>{this.props.children}</div> }
}
