import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./CatalogSort.module.css";

const criteria = [
  ["newest", "Mới đăng"],
  ["salePriceAsc", "Giá bán tăng dần"],
  ["salePriceDesc", "Giá bán giảm dần"],
  ["exchangeValueAsc", "Giá trị đổi tăng dần"],
  ["exchangeValueDesc", "Giá trị đổi giảm dần"],
] as const;
const searchText = (text: string) =>
  text.toLocaleLowerCase("vi-VN").normalize("NFD").replace(/\p{M}/gu, "");

export function CatalogSort({
  value,
  preview,
  onChange,
}: {
  value: string;
  preview: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const typed = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = criteria.map(([key, label]) => ({
    value: key,
    label: key === "newest" && preview ? "Thứ tự mặc định" : label,
  }));
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useEffect(() => {
    if (open) items.current[active]?.focus();
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => {
      const ownedFocus = root.current?.contains(document.activeElement);
      setOpen(false);
      if (ownedFocus) {
        if (window.innerWidth <= 600) native.current?.focus();
        else trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    window.addEventListener("popstate", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
      window.removeEventListener("popstate", resize);
    };
  }, [open]);

  function show(index = selected) {
    typed.current = { text: "", time: 0 };
    setActive(index);
    setOpen(true);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    // Leave the phone's native picker keyboard behavior to the browser.
    if ((event.target as HTMLElement).tagName === "SELECT") return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) show(event.key === "ArrowUp" ? options.length - 1 : selected);
      else
        setActive(
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (active +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length,
        );
    } else if (
      open &&
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = event.timeStamp;
      const letter = searchText(event.key);
      const prefix =
        now - typed.current.time < 600 ? typed.current.text + letter : letter;
      const find = (text: string) =>
        options.findIndex((_, offset) =>
          searchText(
            options[(active + 1 + offset) % options.length].label,
          ).startsWith(text),
        );
      let offset = find(prefix);
      let text = prefix;
      if (offset < 0) {
        offset = find(letter);
        text = letter;
      }
      typed.current = { text: offset < 0 ? "" : text, time: now };
      if (offset >= 0) setActive((active + 1 + offset) % options.length);
    }
  }

  return (
    <div
      className={styles.root}
      ref={root}
      onKeyDown={keyboard}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span id={`${id}-label`} className={styles.label}>
        Sắp xếp
      </span>
      <div className={styles.desktop}>
        <button
          ref={trigger}
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <span id={`${id}-value`}>{options[selected].label}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && (
          <div
            id={`${id}-menu`}
            role="menu"
            aria-labelledby={`${id}-label`}
            className={styles.menu}
          >
            {options.map((option, index) => (
              <button
                type="button"
                key={option.value}
                role="menuitemradio"
                aria-checked={value === option.value}
                tabIndex={index === active ? 0 : -1}
                ref={(element) => {
                  items.current[index] = element;
                }}
                onFocus={() => setActive(index)}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  onChange(option.value);
                }}
              >
                <span>{option.label}</span>
                <Check size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>
      <select
        ref={native}
        className={styles.native}
        aria-label="Sắp xếp"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
