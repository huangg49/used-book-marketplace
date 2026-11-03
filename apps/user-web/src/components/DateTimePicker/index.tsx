import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import styles from './DateTimePicker.module.css'

// Value, min and max use the <input type="datetime-local"> format in local time.
const pad = (n: number) => String(n).padStart(2, '0')
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null
}
const format = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const dayKey = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function DateTimePicker({ id, label, value, min, max, disabled, onChange }: {
  id: string
  label: string
  value: string
  min?: string
  max?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const selected = parse(value)
  const lo = min ? parse(min) : null
  const hi = max ? parse(max) : null
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const base = selected ?? lo ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' })

  // The panel is a manual popover: it sits in the top layer above the modal
  // dialog, floats over the form and is placed beside the trigger.
  useLayoutEffect(() => {
    const el = panel.current
    if (!open || !el) return
    try { el.showPopover() } catch { /* already shown or unsupported: stays inline */ }
    const position = () => {
      const t = trigger.current?.getBoundingClientRect()
      if (!t) return
      const gap = 6, edge = 12
      const w = el.offsetWidth, h = el.offsetHeight
      const below = window.innerHeight - t.bottom - gap - edge
      const top = below >= h || t.top - gap - edge < h ? t.bottom + gap : t.top - gap - h
      const left = Math.min(Math.max(edge, t.left), window.innerWidth - w - edge)
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
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes only the picker, wherever focus is; preventDefault in the
    // capture phase stops the surrounding <dialog> from treating it as cancel.
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])
  // Keep the chosen hour/minute in view when the panel opens or the value moves.
  useEffect(() => {
    if (!open) return
    root.current?.querySelectorAll('[role="listbox"] [aria-pressed="true"]').forEach((el) => {
      const list = el.parentElement as HTMLElement
      const target = el as HTMLElement
      list.scrollTop = target.offsetTop - list.offsetTop - list.clientHeight / 2 + target.clientHeight / 2
    })
  }, [open, value])

  // Clamp into [min, max] so a day or time change never yields an invalid value.
  const commit = (d: Date) => {
    let next = d
    if (lo && next < lo) next = lo
    if (hi && next > hi) next = hi
    onChange(format(next))
  }
  const dayDisabled = (d: Date) => (lo && dayKey(d) < dayKey(lo)) || (hi && dayKey(d) > dayKey(hi))
  const timeDisabled = (h: number, m: number) => {
    if (!selected) return false
    const t = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, m)
    // The minimum is rounded up to the next 5 minutes so the step grid always has a valid slot.
    return (lo && t.getTime() + 5 * 60_000 <= lo.getTime()) || (hi && t > hi)
  }
  const pickDay = (d: Date) => {
    const base = selected ?? lo ?? new Date()
    commit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes()))
  }
  const pickTime = (h: number, m: number) => {
    const base = selected ?? lo ?? new Date()
    commit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m))
  }

  const first = new Date(view.getFullYear(), view.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i - offset + 1))
  const today = dayKey(new Date())
  const canPrev = !lo || new Date(view.getFullYear(), view.getMonth(), 0) >= new Date(lo.getFullYear(), lo.getMonth(), 1)
  const canNext = !hi || new Date(view.getFullYear(), view.getMonth() + 1, 1) <= hi
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1))

  const gridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!step || !selected) return
    e.preventDefault()
    const d = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + step)
    if (dayDisabled(d)) return
    pickDay(d)
    setView(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  const display = selected
    ? selected.toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Chọn ngày giờ'
  const time = selected ? `${pad(selected.getHours())}:${pad(selected.getMinutes())}` : '--:--'

  return (
    <div ref={root} className={styles.picker}>
      <button
        id={id}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-label={`${label}: ${selected ? `${display} ${time}` : 'chưa chọn'}`}
        aria-expanded={open}
        aria-controls={panelId}
        ref={trigger}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false) } }}
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span className={styles.date}>{display}</span>
        <span className={styles.time}><Clock size={14} aria-hidden="true" />{time}</span>
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          popover="manual"
          // Lenis smooth scrolling swallows wheel events; let the hour/minute lists scroll natively.
          data-lenis-prevent=""
          style={place}
          className={styles.panel}
          role="group"
          aria-label={label}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false) } }}
        >
          <div className={styles.calendar}>
            <div className={styles.month}>
              <button type="button" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Tháng trước">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <strong aria-live="polite">Tháng {view.getMonth() + 1}, {view.getFullYear()}</strong>
              <button type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Tháng sau">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div className={styles.weekdays} aria-hidden="true">
              {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className={styles.days} role="grid" onKeyDown={gridKey}>
              {days.map((d) => {
                const key = dayKey(d)
                const isSelected = !!selected && key === dayKey(selected)
                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    tabIndex={isSelected ? 0 : -1}
                    disabled={!!dayDisabled(d)}
                    aria-pressed={isSelected}
                    aria-label={d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    data-outside={d.getMonth() !== view.getMonth()}
                    data-today={key === today}
                    onClick={() => pickDay(d)}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
          <div className={styles.clock}>
            <span className={styles.clockLabel}>Giờ</span>
            <span className={styles.clockLabel}>Phút</span>
            <div className={styles.column} role="listbox" aria-label="Giờ">
              {HOURS.map((h) => {
                const on = selected?.getHours() === h
                const off = MINUTES.every((m) => timeDisabled(h, m))
                return (
                  <button key={h} type="button" role="option" aria-selected={on} aria-pressed={on} disabled={!!off} onClick={() => {
                    const m = selected?.getMinutes() ?? 0
                    const ok = MINUTES.find((x) => x >= m && !timeDisabled(h, x)) ?? MINUTES.find((x) => !timeDisabled(h, x)) ?? m
                    pickTime(h, ok)
                  }}>{pad(h)}</button>
                )
              })}
            </div>
            <div className={styles.column} role="listbox" aria-label="Phút">
              {/* An off-grid minute (e.g. the default start) still shows as chosen. */}
              {[...new Set([...MINUTES, selected?.getMinutes() ?? 0])].sort((a, b) => a - b).map((m) => {
                const on = selected?.getMinutes() === m
                const h = selected?.getHours() ?? 0
                return (
                  <button key={m} type="button" role="option" aria-selected={on} aria-pressed={on} disabled={!!timeDisabled(h, m)} onClick={() => pickTime(h, m)}>
                    {pad(m)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className={styles.footer}>
            <button type="button" className={styles.link} onClick={() => { if (lo) { commit(lo); setView(new Date(lo.getFullYear(), lo.getMonth(), 1)) } }} disabled={!lo}>
              Sớm nhất
            </button>
            <button type="button" className={styles.done} onClick={() => setOpen(false)}>Xong</button>
          </div>
        </div>
      )}
    </div>
  )
}
