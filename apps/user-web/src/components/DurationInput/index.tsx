import { useEffect, useRef, useState } from 'react'
import styles from './DurationInput.module.css'

// A length in whole seconds, typed as hours / minutes / seconds (ADR 0069).
// Bounds are shown, not enforced while typing; the caller validates the total.
const UNITS = [
  { key: 'h', label: 'Giờ', size: 3600, max: 168 },
  { key: 'm', label: 'Phút', size: 60, max: 59 },
  { key: 's', label: 'Giây', size: 1, max: 59 },
] as const

const pad = (n: number) => String(n).padStart(2, '0')
const split = (total: number) => ({
  h: Math.floor(total / 3600),
  m: Math.floor((total % 3600) / 60),
  s: total % 60,
})

export function formatDuration(total: number) {
  const { h, m, s } = split(total)
  const days = Math.floor(h / 24)
  const parts = [
    days && `${days} ngày`,
    h % 24 && `${h % 24} giờ`,
    m && `${m} phút`,
    s && `${s} giây`,
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : '0 giây'
}

export function DurationInput({ id, label, value, presets, disabled, onChange }: {
  id: string
  label: string
  value: number
  presets: readonly number[]
  disabled?: boolean
  onChange: (seconds: number) => void
}) {
  // Text drafts let a field be empty while typing without forcing a 0.
  const [draft, setDraft] = useState(() => {
    const p = split(value)
    return { h: pad(p.h), m: pad(p.m), s: pad(p.s) }
  })
  useEffect(() => {
    const p = split(value)
    setDraft((d) => {
      const same = UNITS.every((u) => (Number(d[u.key]) || 0) === p[u.key])
      return same ? d : { h: pad(p.h), m: pad(p.m), s: pad(p.s) }
    })
  }, [value])

  const parts = split(value)
  const set = (key: 'h' | 'm' | 's', raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 3)
    setDraft((d) => ({ ...d, [key]: clean }))
    const unit = UNITS.find((u) => u.key === key)!
    const n = Math.min(unit.max, Number(clean) || 0)
    onChange(value - parts[key] * unit.size + n * unit.size)
  }
  const step = (key: 'h' | 'm' | 's', by: number) => {
    const unit = UNITS.find((u) => u.key === key)!
    const n = Math.max(0, Math.min(unit.max, parts[key] + by))
    onChange(value - parts[key] * unit.size + n * unit.size)
  }

  // Scrolling over a number steps it like a drum: wheel up adds, wheel down subtracts.
  // A native non-passive listener is needed to keep the page from scrolling too.
  const clock = useRef<HTMLDivElement>(null)
  const latest = useRef({ step, disabled })
  latest.current = { step, disabled }
  useEffect(() => {
    const el = clock.current
    if (!el) return
    let travel = 0
    const wheel = (e: WheelEvent) => {
      const key = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]')?.dataset.unit as 'h' | 'm' | 's' | undefined
      if (!key || latest.current.disabled) return
      e.preventDefault()
      // A mouse notch (large delta) is one step; trackpads send many small deltas,
      // so those accumulate to one step per ~40px.
      const delta = e.deltaMode === 0 ? e.deltaY : e.deltaY * 40
      if (Math.abs(delta) >= 50) {
        travel = 0
        latest.current.step(key, delta > 0 ? -1 : 1)
        return
      }
      travel += delta
      const steps = Math.trunc(travel / 40)
      if (!steps) return
      travel -= steps * 40
      latest.current.step(key, -steps)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  return (
    <div className={styles.duration} role="group" aria-labelledby={`${id}-label`}>
      <div className={styles.head}>
        <span id={`${id}-label`} className={styles.label}>{label}</span>
        <span className={styles.total} aria-live="polite">{formatDuration(value)}</span>
      </div>
      <div ref={clock} data-focus-surface className={styles.clock} data-disabled={disabled || undefined} data-lenis-prevent="">
        {UNITS.map((u, i) => (
          <div key={u.key} className={styles.segment} data-unit={u.key} title="Cuộn chuột hoặc dùng ↑/↓ để đổi">
            {i > 0 && <span className={styles.colon} aria-hidden="true">:</span>}
            <input
              id={i === 0 ? id : `${id}-${u.key}`}
              inputMode="numeric"
              autoComplete="off"
              disabled={disabled}
              value={draft[u.key]}
              aria-label={u.label}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => set(u.key, e.target.value)}
              onBlur={() => setDraft((d) => ({ ...d, [u.key]: pad(parts[u.key]) }))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  step(u.key, e.key === 'ArrowUp' ? 1 : -1)
                }
              }}
            />
            <span className={styles.unit} aria-hidden="true">{u.label.toLowerCase()}</span>
          </div>
        ))}
      </div>
      <div className={styles.presets} role="group" aria-label="Chọn nhanh">
        {presets.map((p) => (
          <button key={p} type="button" disabled={disabled} aria-pressed={value === p} onClick={() => onChange(p)}>
            {formatDuration(p)}
          </button>
        ))}
      </div>
    </div>
  )
}
