import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./DashboardPage.module.css";

const choices = [
  { value: "all", label: "Tất cả" },
  { value: "listings", label: "Bài đăng sách" },
  { value: "catalog", label: "Đầu sách" },
] as const;
export type ChartScope = typeof choices[number]["value"];
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d");

export function ScopeFilter({ value, onChange }: {
  value: ChartScope;
  onChange: (value: ChartScope) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const search = useRef({ text: "", at: 0 });
  const selected = choices.findIndex(choice => choice.value === value);
  const show = (index = selected) => {
    const bounds = trigger.current?.getBoundingClientRect();
    setAbove(!!bounds && window.innerHeight - bounds.bottom < 164 && bounds.top > 164);
    setActive(index);
    search.current = { text: "", at: 0 };
    setOpen(true);
  };
  const choose = (index: number) => {
    onChange(choices[index].value);
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const hide = () => setOpen(false);
    const visibility = () => { if (document.hidden) hide(); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", hide);
    };
  }, [open]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>(`[data-scope-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const key = event.key;
    if (key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); return;
    }
    if (key === "Tab") {
      if (open) choose(active);
      return;
    }
    if (key === "ArrowUp" && event.altKey && open) {
      event.preventDefault(); choose(active); return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else setActive(index => Math.max(0, Math.min(choices.length - 1, index + (key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (key === "Home" || key === "End" || key === "PageUp" || key === "PageDown") {
      event.preventDefault();
      const index = key === "Home" || key === "PageUp" ? 0 : choices.length - 1;
      if (!open) show(index); else setActive(index);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      const now = Date.now(), letter = fold(key);
      const previous = now - search.current.at < 700 ? search.current.text : "";
      const repeated = previous.length > 0 && Array.from(previous).every(character => character === letter);
      const text = repeated ? letter : previous + letter;
      const start = repeated ? (open ? active : selected) + 1 : 0;
      const index = Array.from({ length: choices.length }, (_, offset) => (start + offset) % choices.length)
        .find(index => fold(choices[index].label).startsWith(text));
      if (!open) show(index ?? selected); else if (index !== undefined) setActive(index);
      search.current = { text, at: now };
    }
  };
  return <div className={styles.scopeSelect} ref={root}>
    <span id={`${id}-label`}>Loại hồ sơ</span>
    <div className={styles.scopeControl}>
      <button type="button" ref={trigger} role="combobox" className={styles.scopeTrigger}
        aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${choices[active].value}` : undefined}
        onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown}
        onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}>
        <span>{choices[selected].label}</span>
        <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}
        className={styles.scopeMenu} data-side={above ? "top" : "bottom"}>
        {choices.map((choice, index) => <li key={choice.value} id={`${id}-${choice.value}`}
          role="option" aria-selected={choice.value === value} data-active={index === active}
          data-scope-index={index} className={styles.scopeOption}
          onPointerMove={event => { if (event.pointerType === "mouse") setActive(index); }}
          onPointerDown={event => { if (event.pointerType === "mouse") event.preventDefault(); }}
          onClick={() => { choose(index); trigger.current?.focus(); }}>
          <span>{choice.label}</span>
          {choice.value === value && <Check size={16} strokeWidth={1.6} aria-hidden="true" />}
        </li>)}
      </ul>}
    </div>
  </div>;
}
