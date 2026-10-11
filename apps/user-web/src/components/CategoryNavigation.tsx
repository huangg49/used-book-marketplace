import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, ChevronDown, LayoutGrid, X } from "lucide-react";
import { categories, categoryFor } from "@used-books/api-contract/catalog-taxonomy";
import { ROUTES, searchUrl } from "../lib/routes";
import styles from "./CategoryNavigation.module.css";

// Presentation only: category labels and IDs always come from the shared vocabulary.
const columnIds = [
  ["manga", "light-novel", "literature", "children", "education", "other"],
  ["languages", "science"],
  ["business", "psychology", "history"],
];

function directoryUrl(search: string, categoryId?: string) {
  const params: Record<string, string> = {};
  const data = new URLSearchParams(search).get("data");
  if (data === "live" || data === "preview") params.data = data;
  if (categoryId) params.categoryId = categoryId;
  return searchUrl(params);
}

function onSameTabNavigate(event: MouseEvent<HTMLAnchorElement>, onNavigate: () => void) {
  if (!event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate();
}

function CategoryDirectory({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  const selected = location.pathname === ROUTES.search
    ? new URLSearchParams(location.search).get("categoryId")
    : null;
  const href = (id: string) => directoryUrl(location.search, id);
  return (
    <div className={styles.directory}>
      {columnIds.map((ids) => (
        <div className={styles.column} key={ids[0]}>
          {ids.map((id) => {
            const group = categories.find((item) => item.id === id);
            if (!group) return null;
            return (
              <section className={styles.group} key={group.id} aria-label={group.label}>
                <Link className={styles.groupLink} to={href(group.id)} onClick={(event) => onSameTabNavigate(event, onNavigate)}
                  aria-current={selected === group.id ? "page" : undefined}>
                  {group.label}<ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                {group.children.length > 0 && (
                  <div className={styles.children}>
                    {group.children.map((child) => (
                      <Link key={child.id} to={href(child.id)} onClick={(event) => onSameTabNavigate(event, onNavigate)}
                        aria-current={selected === child.id ? "page" : undefined}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function CategoryNavigation({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === location.key;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = location.pathname === ROUTES.search
    ? categoryFor(new URLSearchParams(location.search).get("categoryId") || "")
    : undefined;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenPath(null);
    };
    const closeOnNarrow = () => {
      if (window.innerWidth <= 1000) setOpenPath(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", closeOnNarrow);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", closeOnNarrow);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenPath(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpenPath(null);
          trigger.current?.focus();
        }
      }}>
      <button ref={trigger} type="button" className={styles.trigger}
        aria-label="Danh mục sách" aria-expanded={open} aria-controls="header-category-directory"
        title={selected ? `Danh mục: ${selected.label}` : "Danh mục sách"}
        onClick={() => setOpenPath(open ? null : location.key)}>
        <LayoutGrid size={22} aria-hidden="true" />
        <span>Danh mục</span>
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </button>
      {open && (
        <nav id="header-category-directory" className={styles.panel} aria-label="Danh mục sách">
          <div className={styles.panelHead}>
            <h2>Danh mục sách</h2>
            <Link className={styles.allBooks} to={directoryUrl(location.search)} onClick={(event) => onSameTabNavigate(event, onNavigate)}>Xem tất cả sách<ArrowUpRight size={17} aria-hidden="true" /></Link>
            <button type="button" className={styles.close} aria-label="Đóng danh mục"
              onClick={() => { setOpenPath(null); trigger.current?.focus(); }}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <CategoryDirectory onNavigate={onNavigate} />
        </nav>
      )}
    </div>
  );
}

export function MobileCategories({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  return (
    <details className={styles.mobile}>
      <summary><LayoutGrid size={19} aria-hidden="true" />Danh mục sách<ChevronDown size={17} aria-hidden="true" /></summary>
      <Link className={styles.allBooks} to={directoryUrl(location.search)} onClick={(event) => onSameTabNavigate(event, onNavigate)}>Xem tất cả sách<ArrowUpRight size={16} aria-hidden="true" /></Link>
      <CategoryDirectory onNavigate={onNavigate} />
    </details>
  );
}
