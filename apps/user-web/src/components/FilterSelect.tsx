import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import styles from "./FilterSelect.module.css";

export interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}
function subscribeViewport(notify: () => void) {
  const media = window.matchMedia("(max-width: 900px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
const narrowSnapshot = () => window.matchMedia("(max-width: 900px)").matches;
const fold = (text: string) =>
  text
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");

export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: FilterSelectProps) {
  const narrow = useSyncExternalStore(
    subscribeViewport,
    narrowSnapshot,
    () => true,
  );
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<CSSProperties>({});
  const expanded = open && !narrow;
  const selected =
    options.find((option) => option.value === value)?.label || "";
  const matches = options.filter((option) =>
    fold(option.label).includes(fold(query.trim())),
  );
  const activeId =
    expanded && matches[active] ? `${id}-option-${active}` : undefined;

  function show() {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const upward =
      below < Math.min(288, options.length * 36 + 12) && above > below;
    setPlacement({
      left: Math.max(
        16,
        Math.min(rect.left, window.innerWidth - rect.width - 16),
      ),
      width: rect.width,
      maxHeight: Math.min(288, Math.max(72, (upward ? above : below) - 6)),
      ...(upward
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  }
  function choose(next: string) {
    setOpen(false);
    onChange(next);
  }
  useEffect(() => {
    if (narrow && focused.current) native.current?.focus();
  }, [narrow]);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popup.current?.contains(target))
        setOpen(false);
    };
    const close = () => setOpen(false);
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("popstate", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("popstate", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [expanded]);
  useEffect(() => {
    if (expanded)
      popup.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [expanded, active]);

  return (
    <div className={styles.root} ref={root}>
      {narrow ? (
        <>
          <select
            ref={native}
            id={id}
            aria-label={label}
            className={styles.native}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className={styles.icon} size={16} aria-hidden="true" />
        </>
      ) : (
        <>
          <input
            ref={input}
            id={id}
            className={styles.control}
            role="combobox"
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={`${id}-options`}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            aria-describedby={`${id}-help`}
            title={selected}
            value={expanded ? query : selected}
            placeholder={selected}
            onFocus={() => {
              focused.current = true;
              show();
            }}
            onClick={() => {
              if (!expanded) show();
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onBlur={(event) => {
              if (!popup.current?.contains(event.relatedTarget)) {
                focused.current = false;
                setOpen(false);
              }
            }}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                if (!expanded) show();
                else
                  setActive(
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? Math.max(0, matches.length - 1)
                        : matches.length
                          ? (active +
                              (event.key === "ArrowDown" ? 1 : -1) +
                              matches.length) %
                            matches.length
                          : 0,
                  );
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (expanded && matches[active]) choose(matches[active].value);
                else if (!expanded) show();
              } else if (event.key === "Escape" && expanded) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              } else if (event.key === "Tab") setOpen(false);
            }}
          />
          {expanded ? (
            <Search className={styles.icon} size={16} aria-hidden="true" />
          ) : (
            <ChevronDown className={styles.icon} size={16} aria-hidden="true" />
          )}
          <span id={`${id}-help`} className="sr-only">
            Gõ để tìm; dùng phím mũi tên và Enter để chọn. Escape để đóng.
          </span>
          {expanded &&
            createPortal(
              <div
                ref={popup}
                id={`${id}-options`}
                role="listbox"
                aria-label={label}
                className={styles.popup}
                style={placement}
              >
                {matches.map((option, index) => (
                  <div
                    key={option.value}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={value === option.value}
                    data-active={active === index || undefined}
                    className={styles.option}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(option.value)}
                  >
                    <span>{option.label}</span>
                    <Check size={15} aria-hidden="true" />
                  </div>
                ))}
                {!matches.length && (
                  <p role="status">
                    Không có lựa chọn phù hợp. Thử từ khóa khác.
                  </p>
                )}
              </div>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}
