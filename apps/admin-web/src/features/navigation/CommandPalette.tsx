import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { ArrowDown, ArrowRight, ArrowUp, Search, X } from "lucide-react";
import { BrandMark } from "../../core/brand-mark";
import {
  workspaceCommands,
  findCommands,
  nextCommandIndex,
  isCommandShortcut,
  type WorkspaceCommand,
} from "./commands";
import styles from "./CommandPalette.module.css";

export function CommandPalette({
  user,
  open,
  enabled,
  onOpen,
  onClose,
}: {
  user?: CurrentUser;
  open: boolean;
  enabled: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const titleId = useId();
  const commands = enabled ? workspaceCommands(user) : [];
  const available = enabled && commands.length > 0;
  const close = useCallback(() => {
    dialog.current?.close();
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (!available) return;
    const shortcut = (event: KeyboardEvent) => {
      if (!isCommandShortcut(event) || event.defaultPrevented) return;
      if (document.querySelector("dialog[open]") && !dialog.current?.open) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (open) close();
      else onOpen();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [available, open, close, onOpen]);
  useEffect(() => {
    const node = dialog.current;
    if (!available || !open || !node || document.querySelector("dialog[open]"))
      return;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    node.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      if (node.open) node.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [available, open]);
  if (!available) return null;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      {open && (
        <CommandContent
          commands={commands}
          currentPath={location.pathname}
          titleId={titleId}
          close={close}
          choose={(command) => {
            close();
            navigate(command.to);
          }}
        />
      )}
    </dialog>
  );
}

function CommandContent({
  commands,
  currentPath,
  titleId,
  close,
  choose,
}: {
  commands: WorkspaceCommand[];
  currentPath: string;
  titleId: string;
  close: () => void;
  choose: (command: WorkspaceCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const hintId = useId();
  const inputId = useId();
  const results = findCommands(commands, query);
  const index = results.length
    ? Math.max(0, Math.min(cursor, results.length - 1))
    : -1;
  const selectedRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [index, query]);
  return (
    <>
      <header className={styles.header}>
        <BrandMark className={styles.brand} />
        <div>
          <p className={styles.overline}>LẬT LẠI · BÀN QUẢN TRỊ</p>
          <h2 id={titleId}>Đi tới đâu?</h2>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={close}
          aria-label="Đóng tìm kiếm nhanh"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.search}>
        <Search size={20} aria-hidden="true" />
        <label className={styles.srOnly} htmlFor={inputId}>
          Tìm chức năng quản trị
        </label>
        <input
          id={inputId}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
          aria-describedby={hintId}
          value={query}
          maxLength={120}
          placeholder="Tên chức năng, có dấu hoặc không dấu…"
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setCursor(
                nextCommandIndex(
                  index,
                  event.key === "ArrowDown" ? 1 : -1,
                  results.length,
                ),
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (results[index]) choose(results[index]);
            }
          }}
        />
      </div>
      <div className={styles.resultHeading}>
        <span id={hintId}>Các khu vực bạn có quyền truy cập</span>
        <span role="status" aria-live="polite">
          {results.length} kết quả
        </span>
      </div>
      <ul
        id={listId}
        role="listbox"
        aria-label="Chức năng quản trị"
        className={styles.results}
      >
        {results.map((command, option) => {
          const current =
            currentPath === command.to ||
            currentPath.startsWith(command.to + "/");
          return (
            <li
              key={command.to}
              id={`${listId}-${option}`}
              ref={option === index ? selectedRef : undefined}
              role="option"
              aria-selected={option === index}
              className={styles.option}
              onPointerMove={(event) => {
                if (event.pointerType === "mouse") setCursor(option);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(command)}
            >
              <span className={styles.optionFace}>
              <span className={styles.number} aria-hidden="true">
                {String(option + 1).padStart(2, "0")}
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionTop}>
                  <strong>{command.label}</strong>
                  {current && <span className={styles.current}>Đang mở</span>}
                </span>
                <span className={styles.description}>
                  {command.description}
                </span>
                <span className={styles.group}>{command.group}</span>
              </span>
              <ArrowRight
                className={styles.arrow}
                size={18}
                aria-hidden="true"
              />
              </span>
            </li>
          );
        })}
      </ul>
      {!results.length && (
        <div className={styles.empty}>
          <Search size={28} strokeWidth={1.2} aria-hidden="true" />
          <h3>Chưa tìm thấy chức năng phù hợp.</h3>
          <p>
            Thử tên ngắn hơn hoặc xóa tìm kiếm để xem các chức năng bạn có thể
            mở.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCursor(0);
              document.getElementById(inputId)?.focus();
            }}
          >
            Xóa tìm kiếm
          </button>
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          <ArrowUp size={13} aria-hidden="true" />
          <ArrowDown size={13} aria-hidden="true" /> Chọn <kbd>Enter</kbd> Mở
        </span>
        <span>
          <kbd>Esc</kbd> Đóng
        </span>
      </footer>
    </>
  );
}
