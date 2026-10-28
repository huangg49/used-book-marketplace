import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Revision } from "./contracts";
import styles from "./RevisionComparison.module.css";

// Follows the existing Dashboard's paper listbox, scoped to submitted revisions.
export function RevisionPicker({
  label,
  value,
  currentId,
  revisions,
  onChange,
}: {
  label: string;
  value: string;
  currentId: string;
  revisions: Revision[];
  onChange: (value: string) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [above, setAbove] = useState(false);
  const selected = Math.max(
    0,
    revisions.findIndex((r) => r.id === value),
  );
  const title = (r: Revision) =>
    `Bản ${r.number}${r.id === currentId ? " · hiện tại" : ""}`;
  function show(index = selected) {
    const bounds = trigger.current?.getBoundingClientRect();
    setAbove(
      !!bounds && window.innerHeight - bounds.bottom < 260 && bounds.top > 260,
    );
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    onChange(revisions[index].id);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", hide);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector<HTMLElement>(`[data-revision-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else
        setActive((n) =>
          Math.max(
            0,
            Math.min(
              revisions.length - 1,
              n + (event.key === "ArrowDown" ? 1 : -1),
            ),
          ),
        );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const n = event.key === "Home" ? 0 : revisions.length - 1;
      if (open) setActive(n);
      else show(n);
    }
  }
  return (
    <div className={styles.picker} ref={root}>
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onKeyDown={keyDown}
        onClick={() => (open ? setOpen(false) : show())}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span>
          {revisions[selected] ? title(revisions[selected]) : "Chọn bản gửi"}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          data-side={above ? "top" : "bottom"}
        >
          {revisions.map((r, index) => (
            <li
              key={r.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={r.id === value}
              data-revision-index={index}
              data-active={active === index}
              onPointerMove={(event) => {
                if (event.pointerType === "mouse") setActive(index);
              }}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") event.preventDefault();
              }}
              onClick={() => {
                choose(index);
                trigger.current?.focus();
              }}
            >
              <span>{title(r)}</span>
              {r.id === value && <Check size={16} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
