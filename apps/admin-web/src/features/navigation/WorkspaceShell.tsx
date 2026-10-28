import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  BookCheck,
  BookPlus,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Gavel,
  Handshake,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Search,
  TriangleAlert,
  Truck,
  UsersRound,
  Warehouse,
  X,
} from "lucide-react";
import { BrandMark } from "../../core/brand-mark";
import { Button, ErrorNotice } from "../../core/ui";
import {
  navigationGroups,
  workspaceRole,
  type NavigationIcon,
} from "./navigation";
import styles from "./WorkspaceShell.module.css";
import { CommandPalette } from "./CommandPalette";
import { SidebarPreferences } from "./SidebarPreferences";
import { createSidebarPreview, readSidebarMode, saveSidebarMode, type SidebarMode } from "./sidebar-preferences";

const mobileQuery = "(max-width: 720px)";
const subscribeMobile = (listener: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const getMobile = () => window.matchMedia(mobileQuery).matches;
const subscribeShort = (listener: () => void) => {
  const media = window.matchMedia("(max-height: 720px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const getShort = () => window.matchMedia("(max-height: 720px)").matches;
const icons: Record<NavigationIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  books: BookCheck,
  catalog: BookPlus,
  intake: PackageCheck,
  collection: Handshake,
  incident: TriangleAlert,
  resolution: Scale,
  auction: Gavel,
  overdue: Clock,
  point: MapPin,
  users: UsersRound,
  carrier: Truck,
};

export function SidebarNavigation({
  user,
  busy = false,
  compact = false,
}: {
  user?: CurrentUser;
  busy?: boolean;
  compact?: boolean;
}) {
  const groups = navigationGroups(user);
  const location = useLocation();
  const [disclosure, setDisclosure] = useState<{
    key: string;
    group: string | null;
  }>();
  const activeGroup = groups.find((group) =>
    group.items.some(
      (item) =>
        location.pathname === item.to ||
        location.pathname.startsWith(item.to + "/"),
    ),
  );
  const defaultGroup =
    activeGroup &&
    activeGroup.id !== "workspace" &&
    activeGroup.id !== "management"
      ? activeGroup.id
      : groups.find((group) => group.id === "review")?.id;
  const openGroup =
    disclosure?.key === location.key ? disclosure.group : defaultGroup;
  return (
    <nav className={styles.navigation} aria-label="Khu vực quản trị">
      {groups.map((group) => {
        const titled = group.id !== "workspace" && group.id !== "management";
        const collapsible = compact && titled;
        const open = !collapsible || group.id === openGroup;
        const GroupIcon =
          group.id === "review"
            ? ClipboardCheck
            : group.id === "simulation"
              ? Truck
              : Warehouse;
        return (
          <section
            className={styles.group}
            key={group.id}
            aria-labelledby={`nav-${group.id}`}
            data-titled={titled}
          >
            <h2
              id={`nav-${group.id}`}
              className={styles.groupTitle}
              data-disclosure={collapsible}
            >
              {collapsible ? (
                <button
                  className={styles.groupToggle}
                  type="button"
                  aria-expanded={open}
                  aria-controls={`nav-items-${group.id}`}
                  title={group.label}
                  onClick={() =>
                    setDisclosure({
                      key: location.key,
                      group: open ? null : group.id,
                    })
                  }
                >
                  <GroupIcon
                    className={styles.groupIcon}
                    size={18}
                    aria-hidden="true"
                  />
                  <span>{group.label}</span>
                  <ChevronDown
                    className={styles.chevron}
                    size={15}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <span>{group.label}</span>
              )}
            </h2>
            <div
              className={styles.groupItems}
              id={`nav-items-${group.id}`}
              hidden={!open}
            >
              {group.items.map((item) => {
                const Icon = icons[item.icon];
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={styles.link}
                    title={item.label}
                    aria-label={item.label}
                    aria-disabled={busy || undefined}
                    onClick={(event) => {
                      if (busy) event.preventDefault();
                    }}
                  >
                    <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.linkLabel}>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </section>
        );
      })}
      {groups.length > 0 && (
        <div
          className={styles.upcoming}
          aria-disabled="true"
          title="Report · Sắp triển khai"
        >
          <ChartNoAxesCombined size={20} strokeWidth={1.7} aria-hidden="true" />
          <span className={styles.linkLabel}>Report</span>
          <small className={styles.soon}>Sắp triển khai</small>
        </div>
      )}
    </nav>
  );
}

type Props = {
  user?: CurrentUser;
  displayName: string;
  profileFailed: boolean;
  logoutBusy: boolean;
  logoutError?: unknown;
  onLogout: () => void;
  children: ReactNode;
};

export function WorkspaceShell({
  user,
  displayName,
  profileFailed,
  logoutBusy,
  logoutError,
  onLogout,
  children,
}: Props) {
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);
  const short = useSyncExternalStore(subscribeShort, getShort, () => false);
  const [mode, setMode] = useState(readSidebarMode);
  const [preferenceSaved, setPreferenceSaved] = useState(true);
  const [preview] = useState(createSidebarPreview);
  const previewOpen = useSyncExternalStore(preview.subscribe, preview.snapshot, () => false);
  const pinned = mode === "expanded";
  const [mobileLocation, setMobileLocation] = useState<string | null>(null);
  const [commandLocation, setCommandLocation] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const mobileOpen = mobile && mobileLocation === location.key;
  const expanded =
    mobile || pinned || (mode === "auto" && previewOpen) || logoutError !== undefined;
  const chooseMode = (next: SidebarMode) => {
    preview.reset();
    setMode(next);
    setPreferenceSaved(saveSidebarMode(next));
  };
  const role = workspaceRole(user);
  const initial =
    Array.from(displayName.trim())[0]?.toLocaleUpperCase("vi-VN") || "L";
  const commandEnabled =
    !profileFailed && !logoutBusy && navigationGroups(user).length > 0;
  if (!commandEnabled && commandLocation !== null) setCommandLocation(null);
  const closeCommands = useCallback(() => setCommandLocation(null), []);
  const openCommands = useCallback(() => {
    document.querySelector<HTMLElement>("[data-sidebar-preferences]:popover-open")?.hidePopover();
    preview.reset();
    dialog.current?.close();
    setMobileLocation(null);
    setCommandLocation(location.key);
  }, [location.key, preview]);

  useLayoutEffect(() => {
    preview.configure(mode === "auto" && !mobile);
    return () => preview.configure(false);
  }, [preview, mode, mobile, location.key]);
  useEffect(() => {
    const hide = () => {
      document.querySelector<HTMLElement>("[data-sidebar-preferences]:popover-open")?.hidePopover();
      preview.reset();
    };
    const visibility = () => { if (document.hidden) hide(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !preview.snapshot() ||
        document.querySelector("dialog[open], [popover]:popover-open")) return;
      preview.dismiss();
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", hide);
    };
  }, [preview]);

  // Close only once Router accepts navigation, preserving existing leave guards.
  useEffect(() => {
    const media = window.matchMedia(mobileQuery);
    const close = () => setMobileLocation(null);
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!mobile || !mobileOpen || !node) return;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (node.open) node.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [mobile, mobileOpen]);

  const content = (
    <>
      <header className={styles.header}>
        <Link
          className={styles.brand}
          to="/dashboard"
          aria-label="Lật Lại · Bàn quản trị"
        >
          <span className={styles.markViewport}>
            <BrandMark className={styles.logo} wordmark tone="cream" />
          </span>
        </Link>
        {mobile ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setMobileLocation(null)}
            aria-label="Đóng thanh điều hướng"
            autoFocus
          >
            <X size={19} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              chooseMode(pinned ? "collapsed" : "expanded");
            }}
            aria-label={
              pinned ? "Thu gọn thanh điều hướng" : "Mở cố định thanh điều hướng"
            }
            title={
              pinned ? "Thu gọn thanh điều hướng" : "Mở cố định thanh điều hướng"
            }
            aria-expanded={expanded}
            aria-controls="admin-navigation-panel"
          >
            {pinned ? (
              <PanelLeftClose size={19} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={19} aria-hidden="true" />
            )}
          </button>
        )}
      </header>
      {commandEnabled && (
        <button
          type="button"
          className={styles.commandButton}
          onClick={openCommands}
          aria-label="Tìm kiếm nhanh"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          title="Tìm kiếm nhanh · Ctrl + K"
        >
          <Search size={18} aria-hidden="true" />
          <span className={styles.commandLabel}>Tìm kiếm nhanh</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}
      <div className={styles.scrollArea} id="admin-navigation-panel">
        {!user && (
          <p className={styles.menuState}>
            {profileFailed
              ? "Chưa tải được menu. Thử tải lại quyền trong nội dung chính."
              : "Đang kiểm tra quyền truy cập…"}
          </p>
        )}
        <SidebarNavigation
          user={user}
          busy={logoutBusy}
          compact={
            mobile ||
            short ||
            navigationGroups(user).flatMap((group) => group.items).length > 9
          }
        />
      </div>
      <SidebarPreferences key={`${location.key}-${mobile}`} mode={mode} saved={preferenceSaved}
        onChange={chooseMode} onHold={preview.hold} />
      <footer className={styles.account} data-account>
        <div className={styles.identity} title={`${displayName} · ${role}`}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <div className={styles.accountDetails}>
            <strong>{displayName}</strong>
            <span>{role}</span>
          </div>
        </div>
        <Button
          className={styles.logout}
          busy={logoutBusy}
          onClick={onLogout}
          aria-label={logoutBusy ? "Đang đăng xuất…" : "Đăng xuất"}
          title="Đăng xuất"
        >
          {!logoutBusy && <LogOut size={18} aria-hidden="true" />}
        </Button>
        {logoutError !== undefined && (
          <div className={styles.logoutError}>
            <ErrorNotice error={logoutError} />
          </div>
        )}
      </footer>
    </>
  );

  return (
    <div className={styles.shell} data-pinned={pinned}>
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <header className={styles.mobileHeader}>
        <Link
          className={styles.mobileBrand}
          to="/dashboard"
          aria-label="Lật Lại · Bàn quản trị"
        >
          <BrandMark className={styles.logo} wordmark />
        </Link>
        <div className={styles.mobileActions}>
          {commandEnabled && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={openCommands}
              aria-label="Tìm kiếm nhanh"
              aria-haspopup="dialog"
              title="Tìm kiếm nhanh"
            >
              <Search size={20} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMobileLocation(location.key)}
            aria-label="Mở thanh điều hướng"
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar"
          >
            <Menu size={21} aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </header>
      {mobile ? (
        <dialog
          ref={dialog}
          id="admin-sidebar"
          className={styles.drawer}
          aria-label="Điều hướng quản trị"
          data-expanded="true"
          onClose={() => setMobileLocation(null)}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              setMobileLocation(null);
          }}
        >
          {content}
        </dialog>
      ) : (
        <aside
          id="admin-sidebar"
          className={styles.sidebar}
          aria-label="Điều hướng quản trị"
          data-expanded={expanded}
          data-peeking={!pinned && expanded}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse" && event.buttons === 0 && window.matchMedia("(hover: hover) and (pointer: fine)").matches) preview.enter();
          }}
          onPointerLeave={preview.leave}
          onFocusCapture={preview.focus}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              preview.blur();
          }}
        >
          {content}
        </aside>
      )}
      <div className="workspace-frame">{children}</div>
      <CommandPalette
        user={user}
        enabled={commandEnabled}
        open={commandEnabled && commandLocation === location.key}
        onOpen={openCommands}
        onClose={closeCommands}
      />
    </div>
  );
}
