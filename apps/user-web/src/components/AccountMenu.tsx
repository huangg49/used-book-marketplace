import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import { accountNavigation } from "../lib/account-navigation";
import { useAccountLogout } from "../hooks/useAccountLogout";
import styles from "./AccountMenu.module.css";

export function AccountMenu({ displayName }: { displayName: string }) {
  const location = useLocation();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusFirst = useRef(false);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === location.key;
  const { busy, error, logout } = useAccountLogout();
  useEffect(() => {
    if (!open) return;
    if (focusFirst.current) {
      focusFirst.current = false;
      root.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenPath(null);
    };
    const narrow = () => {
      if (window.innerWidth <= 1000) setOpenPath(null);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", narrow);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", narrow);
    };
  }, [open]);
  return (
    <div
      className={styles.root}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setOpenPath(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpenPath(null);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className={styles.trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpenPath(open ? null : location.key)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (open)
              root.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
            else {
              focusFirst.current = true;
              setOpenPath(location.key);
            }
          }
        }}
      >
        Tài khoản <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={id} className={styles.popover} hidden={!open}>
        <div className={styles.identity}>
          <span className={styles.initial} aria-hidden="true">
            {Array.from(displayName.trim())[0]?.toLocaleUpperCase("vi-VN") ||
              "L"}
          </span>
          <strong>{displayName}</strong>
        </div>
        <nav aria-label="Tài khoản cá nhân">
          {accountNavigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end>
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.exit}>
          <button type="button" disabled={busy} onClick={() => void logout()}>
            <LogOut size={19} aria-hidden="true" />
            {busy ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
