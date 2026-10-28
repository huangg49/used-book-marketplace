import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./PaperSelect.module.css";

type Choice = readonly [value: string, label: string];
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
  onChange,
}: {
  label: string;
  value: string;
  choices: readonly Choice[];
  onChange: (value: string) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [above, setAbove] = useState(false);
  const search = useRef({ text: "", at: 0 });
  const selected = Math.max(
    0,
    choices.findIndex((choice) => choice[0] === value),
  );
  function show(index = selected) {
    if (!choices.length) return;
    const rect = trigger.current?.getBoundingClientRect();
    const height = Math.min(choices.length * 44 + 16, 260);
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
    if (choices[index]) onChange(choices[index][0]);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
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
  }, [open]);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowUp" && e.altKey && open) {
      e.preventDefault();
      choose(active);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else show();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) show();
      else
        setActive((n) =>
          Math.max(
            0,
            Math.min(choices.length - 1, n + (e.key === "ArrowDown" ? 1 : -1)),
          ),
        );
      return;
    }
    if (["Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      e.preventDefault();
      const index =
        e.key === "Home" || e.key === "PageUp" ? 0 : choices.length - 1;
      if (open) setActive(index);
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
      const start = repeated ? (open ? active : selected) + 1 : 0;
      const index = choices
        .map((_, offset) => (start + offset) % choices.length)
        .find((n) => fold(choices[n][1]).startsWith(text));
      if (!open) show(index ?? selected);
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
        disabled={!choices.length}
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keyDown}
        onBlur={(e) => {
          if (e.relatedTarget && !root.current?.contains(e.relatedTarget))
            setOpen(false);
        }}
      >
        <span>{choices[selected]?.[1] ?? "Chọn"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={`${id}-label`}
        aria-hidden={!open}
        inert={!open}
        data-open={open}
        data-side={above ? "top" : "bottom"}
      >
        {choices.map(([key, text], index) => (
          <li
            key={key}
            id={`${id}-${index}`}
            role="option"
            aria-selected={key === value}
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
            <span>{text}</span>
            {key === value && <Check size={16} aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
