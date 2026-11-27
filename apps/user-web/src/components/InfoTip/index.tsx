import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import styles from './InfoTip.module.css'

/**
 * Toggletip: a small "i" button that keeps secondary explanations off the page.
 * Mouse hover previews it, click/Enter/Space pins it, Escape or a click outside
 * closes it. The bubble stays in the DOM so `aria-describedby` still reads the
 * text to screen readers while it is closed.
 */
export function InfoTip({ label, children, className, id: givenId }: { label: string; children: ReactNode; className?: string; id?: string }) {
  const autoId = useId()
  // A caller-provided id lets the field it explains point aria-describedby at the same text.
  const id = givenId ?? autoId
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' })
  const open = pinned || hovered

  // Top-layer popover, placed under (or above) the icon and kept inside the viewport.
  useLayoutEffect(() => {
    const el = bubble.current
    if (!open || !el) return
    try { el.showPopover() } catch { /* unsupported: CSS fallback keeps it inline */ }
    const position = () => {
      const t = trigger.current?.getBoundingClientRect()
      if (!t) return
      const gap = 8, edge = 12
      const w = el.offsetWidth, h = el.offsetHeight
      const below = window.innerHeight - t.bottom - gap - edge
      const top = below >= h || t.top - gap - edge < h ? t.bottom + gap : t.top - gap - h
      const left = Math.min(Math.max(edge, t.left + t.width / 2 - w / 2), window.innerWidth - w - edge)
      setPlace({ top: Math.max(edge, top), left })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      setPlace({ visibility: 'hidden' })
      try { el.hidePopover() } catch { /* already hidden */ }
    }
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setPinned(false) }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation()
      setPinned(false); setHovered(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true) }
  }, [pinned])

  return (
    <span ref={root} className={`${styles.root} ${className ?? ''}`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false) }}>
      <button ref={trigger} type="button" className={styles.trigger} aria-label={`Giải thích: ${label}`}
        aria-expanded={open} aria-controls={id} aria-describedby={id}
        // A button inside a <label> must not toggle the label's control.
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPinned((p) => !p) }}
        onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node)) setPinned(false) }}>
        <Info size={16} aria-hidden="true" />
      </button>
      <span ref={bubble} id={id} role="tooltip" popover="manual" className={styles.bubble} style={place} hidden={!open}>
        {children}
      </span>
    </span>
  )
}
