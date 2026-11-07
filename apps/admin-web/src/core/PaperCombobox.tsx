import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";
import styles from "./PaperCombobox.module.css";

export type ComboOption = {
  value: string;
  label: string;
  hint?: string;
};

// Typeable combobox: the caller owns the query and fetches options for it.
// Focus stays in the input; the popup never submits a form or traps Tab.
export function PaperCombobox({
  label,
  query,
  onQueryChange,
  options,
  value,
  onChange,
  placeholder,
  busy = false,
  emptyText = "Không có kết quả.",
}: {
  label: string;
  query: string;
  onQueryChange: (query: string) => void;
  options: readonly ComboOption[];
  value?: string;
  onChange: (option: ComboOption) => void;
  placeholder?: string;
  busy?: boolean;
  emptyText?: string;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  // Callers rebuild the array each render; reset only when the results change.
  const resultKey = options.map((option) => option.value).join("|");
  useEffect(() => setActive(0), [resultKey]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector(`[data-option-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option);
    setOpen(false);
  }
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + step)));
    } else if (e.key === "Enter") {
      // Never let Enter submit the surrounding action form.
      e.preventDefault();
      if (open) choose(active);
      else setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }
  const showList = open && (options.length > 0 || !busy);
  return (
    <div ref={root} className={styles.combo}>
      <label htmlFor={`${id}-input`}>{label}</label>
      <div data-focus-surface className={styles.control}>
        <Search size={16} aria-hidden="true" />
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            showList && options[active] ? `${id}-${active}` : undefined
          }
          aria-busy={busy}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={keyDown}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget)) setOpen(false);
          }}
        />
        {busy && (
          <LoaderCircle className={styles.spin} size={16} aria-hidden="true" />
        )}
      </div>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        data-open={showList}
      >
        {options.length === 0 && (
          <li className={styles.empty} role="presentation">
            {emptyText}
          </li>
        )}
        {options.map((option, index) => (
          <li
            key={option.value}
            id={`${id}-${index}`}
            role="option"
            aria-selected={option.value === value}
            data-active={active === index}
            data-option-index={index}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") setActive(index);
            }}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(index)}
          >
            <span>
              <strong>{option.label}</strong>
              {option.hint && <small>{option.hint}</small>}
            </span>
            {option.value === value && <Check size={16} aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
