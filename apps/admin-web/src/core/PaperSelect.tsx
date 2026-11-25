import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./PaperSelect.module.css";

type Choice = readonly [value: string, label: string];
export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
};
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");

// Focus stays on the trigger; the popup never submits a form or traps Tab.
export function PaperSelect({
  label,
  value,
  choices,
  options,
  placeholder = "Chọn",
  disabled = false,
  emptyText = "Không có lựa chọn khả dụng.",
  onChange,
}: {
  label: string;
  value: string;
  choices?: readonly Choice[];
  options?: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  onChange: (value: string) => void;
}) {
  const items: readonly SelectOption[] =
    options ?? (choices ?? []).map(([v, l]) => ({ value: v, label: l }));
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [above, setAbove] = useState(false);
  const search = useRef({ text: "", at: 0 });
  const selectedIndex = items.findIndex((item) => item.value === value);
  const selected = selectedIndex >= 0 ? selectedIndex : 0;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : undefined;
  const isOpen = open && !disabled;
  function show(index = selected) {
    if (disabled || !items.length) return;
    const rect = trigger.current?.getBoundingClientRect();
    const height = Math.min(items.length * 52 + 16, 380);
    setAbove(
      !!rect &&
        window.innerHeight - rect.bottom < height + 12 &&
        rect.top > height + 12,
    );
    setActive(index);
    search.current = { text: "", at: 0 };
    setOpen(true);
  }
  function choose(index: number) {
    if (items[index]) onChange(items[index].value);
    setOpen(false);
  }
  useEffect(() => {
    if (!isOpen) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const hide = () => setOpen(false);
    const visibility = () => {
      if (document.hidden) hide();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, [isOpen]);
  useEffect(() => {
    if (isOpen)
      root.current
        ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, isOpen]);
  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowUp" && e.altKey && isOpen) {
      e.preventDefault();
      choose(active);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isOpen) choose(active);
      else show();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) show();
      else
        setActive((n) =>
          Math.max(
            0,
            Math.min(items.length - 1, n + (e.key === "ArrowDown" ? 1 : -1)),
          ),
        );
      return;
    }
    if (["Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      e.preventDefault();
      const index =
        e.key === "Home" || e.key === "PageUp" ? 0 : items.length - 1;
      if (isOpen) setActive(index);
      else show(index);
      return;
    }
    if (e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      const now = Date.now(),
        letter = fold(e.key);
      const previous = now - search.current.at < 700 ? search.current.text : "";
      const repeated =
        !!previous && Array.from(previous).every((c) => c === letter);
      const text = repeated ? letter : previous + letter;
      const start = repeated ? (isOpen ? active : selected) + 1 : 0;
      const index = items
        .map((_, offset) => (start + offset) % items.length)
        .find((n) => fold(items[n].label).startsWith(text));
      if (!isOpen) show(index ?? selected);
      else if (index !== undefined) setActive(index);
      search.current = { text, at: now };
    }
  }
  return (
    <div ref={root} className={styles.select}>
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        disabled={disabled || !items.length}
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-list` : undefined}
        aria-activedescendant={isOpen ? `${id}-${active}` : undefined}
        onClick={() => (isOpen ? setOpen(false) : show())}
        onKeyDown={keyDown}
        onBlur={(e) => {
          if (e.relatedTarget && !root.current?.contains(e.relatedTarget))
            setOpen(false);
        }}
      >
        <span className={selectedItem ? styles.triggerValue : styles.placeholder}>
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={`${id}-label`}
        aria-hidden={!isOpen}
        inert={!isOpen}
        data-open={isOpen}
        data-side={above ? "top" : "bottom"}
      >
        {items.length === 0 ? (
          <li className={styles.empty} role="presentation">
            {emptyText}
          </li>
        ) : (
          items.map((item, index) => (
            <li
              key={item.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={item.value === value}
              data-value={item.value}
              data-active={active === index}
              data-option-index={index}
              onPointerMove={(e) => {
                if (e.pointerType === "mouse") setActive(index);
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse") e.preventDefault();
              }}
              onClick={() => {
                choose(index);
                trigger.current?.focus();
              }}
            >
              <span className={styles.optionCopy}>
                <span className={styles.optionLabel}>{item.label}</span>
                {item.hint && <small className={styles.optionHint}>{item.hint}</small>}
              </span>
              {item.value === value && <Check size={16} aria-hidden="true" />}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
