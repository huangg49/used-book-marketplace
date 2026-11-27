import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import styles from './SelectMenu.module.css'

export type SelectMenuOption = { value: string; label: string; /** Draw a divider above this option. */ separated?: boolean }

/**
 * Brand-themed single select (WAI-ARIA select-only combobox). Focus stays on
 * the button; arrows move the active option, Enter/Space picks, Escape closes.
 * The list is a manual popover so it sits above a modal <dialog>, placed under
 * (or above) the button and exactly as wide as it.
 */
export function SelectMenu({ id, labelledBy, value, options, disabled, onChange }: {
  id: string
  labelledBy: string
  value: string
  options: SelectMenuOption[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const [active, setActive] = useState(selectedIndex)
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' })
  const optionId = (i: number) => `${listId}-opt-${i}`

  useLayoutEffect(() => {
    const el = list.current
    if (!open || !el) return
    try { el.showPopover() } catch { /* already shown or unsupported: stays inline */ }
    const position = () => {
      const t = trigger.current?.getBoundingClientRect()
      if (!t) return
      const gap = 6, edge = 12
      const h = el.offsetHeight
      const below = window.innerHeight - t.bottom - gap - edge
      const top = below >= h || t.top - gap - edge < h ? t.bottom + gap : t.top - gap - h
      setPlace({ top: Math.max(edge, top), left: t.left, width: t.width })
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
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    // Escape closes only the menu; capture + preventDefault keeps the <dialog> open.
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true) }
  }, [open])

  // Keep the active option in view.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active])

  const show = () => { setActive(selectedIndex); setOpen(true) }
  const pick = (i: number) => { onChange(options[i].value); setOpen(false); trigger.current?.focus() }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
      return
    }
    const move: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last, PageDown: Math.min(last, active + 5), PageUp: Math.max(0, active - 5) }
    if (e.key in move) { e.preventDefault(); setActive(move[e.key]) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active) }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div ref={root} className={styles.root}>
      <button
        ref={trigger} id={id} type="button" role="combobox" className={styles.trigger} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-labelledby={`${labelledBy} ${id}`}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKeyDown}
      >
        <span className={styles.value}>{options[selectedIndex]?.label}</span>
        <ChevronDown size={18} aria-hidden="true" className={styles.chevron} />
      </button>
      <ul ref={list} id={listId} role="listbox" aria-labelledby={labelledBy} popover="manual" hidden={!open} className={styles.list} style={place}>
        {options.map((o, i) => (
          <li
            key={o.value} id={optionId(i)} role="option" aria-selected={i === selectedIndex}
            className={styles.option} data-active={i === active || undefined} data-separated={o.separated || undefined}
            onPointerEnter={() => setActive(i)}
            // Keep focus on the button so the dialog never loses it.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => pick(i)}
          >
            <span>{o.label}</span>
            {i === selectedIndex && <Check size={16} aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
