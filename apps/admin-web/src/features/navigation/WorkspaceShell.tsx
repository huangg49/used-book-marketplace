import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Link, matchPath, NavLink, useLocation } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import {
  BookCheck,
  BookOpen,
  BookPlus,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FlaskConical,
  Gavel,
  Handshake,
  Headset,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ScanSearch,
  Search,
  ChartNoAxesCombined,
  Star,
  TriangleAlert,
  Truck,
  UsersRound,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { BrandMark } from "../../core/brand-mark";
import { Button, ErrorNotice } from "../../core/ui";
import {
  navigationGroups,
  workspaceRole,
  type NavigationGroup,
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
const icons: Record<NavigationIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  statistics: ChartNoAxesCombined,
  ledger: BookOpen,
  books: BookCheck,
  catalog: BookPlus,
  review: ClipboardCheck,
  rating: Star,
  ai: ScanSearch,
  intake: PackageCheck,
  collection: Handshake,
  incident: TriangleAlert,
  resolution: Scale,
  auction: Gavel,
  overdue: Clock,
  point: MapPin,
  users: UsersRound,
  wallet: Wallet,
  support: Headset,
  operations: Warehouse,
  simulation: FlaskConical,
  carrier: Truck,
};

const isDisclosureGroup = (group: NavigationGroup) =>
  Boolean(group.icon) && group.items.length > 1;

export function SidebarNavigation({
  user,
  busy = false,
  visible = true,
}: {
  user?: CurrentUser;
  busy?: boolean;
  visible?: boolean;
}) {
  const groups = navigationGroups(user);
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  const [disclosure, setDisclosure] = useState<{
    pathname: string;
    group: string | null;
  }>();
  const activeGroup = groups.find((group) =>
    group.items.some((item) => matchPath({ path: item.to, end: false }, pathname)),
  );
  const defaultGroup = activeGroup && isDisclosureGroup(activeGroup)
    ? activeGroup.id
    : groups.find(isDisclosureGroup)?.id;
  const openGroup = disclosure?.pathname === pathname ? disclosure.group : defaultGroup;

  useEffect(() => {
    if (!visible || !activeGroup?.id) return;
    const frame = requestAnimationFrame(() => {
      const scrollArea = nav.current?.parentElement;
      const current = nav.current?.querySelector<HTMLElement>(
        'a[aria-current="page"]:not([hidden] *)',
      );
      if (!scrollArea || !current) return;
      const viewport = scrollArea.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      if (item.top < viewport.top) scrollArea.scrollTop -= viewport.top - item.top + 4;
      if (item.bottom > viewport.bottom) scrollArea.scrollTop += item.bottom - viewport.bottom + 4;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, activeGroup?.id, visible]);

  return (
    <nav ref={nav} className={styles.navigation} aria-label="Khu vực quản trị">
      {groups.map((group) => {
        const GroupIcon = group.icon && isDisclosureGroup(group) ? icons[group.icon] : undefined;
        const open = !GroupIcon || group.id === openGroup;
        return (
          <section
            className={styles.group}
            key={group.id}
            aria-labelledby={GroupIcon ? `nav-${group.id}` : undefined}
            aria-label={GroupIcon ? undefined : group.label}
            data-group={group.id}
            data-disclosure={GroupIcon ? true : undefined}
            data-open={GroupIcon && open ? true : undefined}
            data-current={GroupIcon && group.id === activeGroup?.id ? true : undefined}
          >
            {GroupIcon && (
              <h2 id={`nav-${group.id}`} className={styles.groupTitle}>
                <button
                  className={styles.groupToggle}
                  type="button"
                  aria-expanded={open}
                  aria-controls={`nav-items-${group.id}`}
                  title={group.label}
                  onClick={() => setDisclosure({ pathname, group: open ? null : group.id })}
                >
                  <GroupIcon className={styles.groupIcon} size={18} strokeWidth={1.7} aria-hidden="true" />
                  <span>{group.label}</span>
                  <ChevronDown className={styles.chevron} size={15} aria-hidden="true" />
                </button>
              </h2>
            )}
            <div className={styles.groupItems} id={`nav-items-${group.id}`} hidden={!open}>
              {group.items.map((item) => {
                const Icon = icons[item.icon];
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
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
          {!mobile && <kbd>Ctrl K</kbd>}
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
        <SidebarNavigation user={user} busy={logoutBusy} visible={!mobile || mobileOpen} />
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
      <a className="skip-link" href="#main" onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const main = document.getElementById("main");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView({block: "start"});
      }}>
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
          data-focus-inverse
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
          data-focus-inverse
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
