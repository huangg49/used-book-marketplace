import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, ChevronDown, LayoutGrid, X } from "lucide-react";
import {
  categories,
  categoryFor,
  categoryDirectorySections,
  foldCatalogText,
} from "@used-books/api-contract/catalog-taxonomy";
import { ROUTES, searchUrl } from "../lib/routes";
import styles from "./CategoryNavigation.module.css";

function directoryUrl(search: string, categoryId?: string, pathname = "") {
  const params: Record<string, string> = {};
  const data = new URLSearchParams(search).get("data");
  if (data === "live" || data === "preview") params.data = data;
  else if (pathname.startsWith(`${ROUTES.search}/`)) params.data = "live";
  if (categoryId) params.categoryId = categoryId;
  return searchUrl(params);
}

function onSameTabNavigate(
  event: MouseEvent<HTMLAnchorElement>,
  onNavigate: () => void,
) {
  if (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
    onNavigate();
}

function CategoryDirectory({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string[]>(() => {
    const c = categoryFor(
      new URLSearchParams(location.search).get("categoryId") || "",
    );
    return c?.parentId ? [c.parentId] : [];
  });
  const selected =
    location.pathname === ROUTES.search
      ? new URLSearchParams(location.search).get("categoryId")
      : null;
  const href = (id: string) =>
    directoryUrl(location.search, id, location.pathname);
  const term = foldCatalogText(query).trim();
  const visible = categories.filter(
    (group) =>
      !term ||
      foldCatalogText(
        [group.label, ...group.children.map((c) => c.label)].join(" "),
      ).includes(term),
  );
  return (
    <>
      <div className={styles.directorySearch}>
        <label htmlFor={searchId}>Tìm danh mục</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ví dụ: manga, tiếng Nhật, thiết kế…"
        />
      </div>
      {!visible.length && (
        <p className={styles.noResults} role="status">
          Không tìm thấy danh mục. Thử từ khóa khác.
        </p>
      )}
      <div className={styles.directory}>
        {categoryDirectorySections.map(({ ids, label }) => (
          <div className={styles.column} key={label}>
            {ids.some((id) => visible.some((c) => c.id === id)) && (
              <h3 className={styles.columnTitle}>{label}</h3>
            )}
            {ids.map((id) => {
              const group = categories.find((item) => item.id === id);
              if (!group || !visible.includes(group)) return null;
              const childrenOpen = !!term || expanded.includes(id);
              const children = group.children.filter(
                (c) =>
                  !term ||
                  foldCatalogText(group.label).includes(term) ||
                  foldCatalogText(c.label).includes(term),
              );
              return (
                <section
                  className={styles.group}
                  key={group.id}
                  aria-label={group.label}
                >
                  <div className={styles.groupHead}>
                    <Link
                      className={styles.groupLink}
                      to={href(group.id)}
                      onClick={(event) => onSameTabNavigate(event, onNavigate)}
                      aria-current={selected === group.id ? "page" : undefined}
                    >
                      {group.label}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                    {group.children.length > 0 && (
                      <button
                        type="button"
                        className={styles.expandGroup}
                        aria-expanded={!!childrenOpen}
                        aria-label={`Nhóm sách ${group.label}`}
                        aria-controls={`${searchId}-${id}`}
                        onClick={() =>
                          setExpanded(
                            expanded.includes(id)
                              ? expanded.filter((v) => v !== id)
                              : [...expanded, id],
                          )
                        }
                      >
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {group.children.length > 0 && childrenOpen && (
                    <div className={styles.children} id={`${searchId}-${id}`}>
                      {children.map((child) => (
                        <Link
                          key={child.id}
                          to={href(child.id)}
                          onClick={(event) =>
                            onSameTabNavigate(event, onNavigate)
                          }
                          aria-current={
                            selected === child.id ? "page" : undefined
                          }
                        >
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
    </>
  );
}

export function CategoryNavigation({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === location.key;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected =
    location.pathname === ROUTES.search
      ? categoryFor(
          new URLSearchParams(location.search).get("categoryId") || "",
        )
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
        type="button"
        className={styles.trigger}
        aria-label="Danh mục sách"
        aria-expanded={open}
        aria-controls="header-category-directory"
        title={selected ? `Danh mục: ${selected.label}` : "Danh mục sách"}
        onClick={() => setOpenPath(open ? null : location.key)}
      >
        <LayoutGrid size={22} aria-hidden="true" />
        <span>Danh mục</span>
        <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
      </button>
      {open && (
        <nav
          id="header-category-directory"
          className={styles.panel}
          aria-label="Danh mục sách"
        >
          <div className={styles.panelHead}>
            <h2>Danh mục sách</h2>
            <Link
              className={styles.allBooks}
              to={directoryUrl(location.search, undefined, location.pathname)}
              onClick={(event) => onSameTabNavigate(event, onNavigate)}
            >
              Xem tất cả sách
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <button
              type="button"
              className={styles.close}
              aria-label="Đóng danh mục"
              onClick={() => {
                setOpenPath(null);
                trigger.current?.focus();
              }}
            >
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
      <summary>
        <LayoutGrid size={19} aria-hidden="true" />
        Danh mục sách
        <ChevronDown size={17} aria-hidden="true" />
      </summary>
      <Link
        className={styles.allBooks}
        to={directoryUrl(location.search, undefined, location.pathname)}
        onClick={(event) => onSameTabNavigate(event, onNavigate)}
      >
        Xem tất cả sách
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
      <CategoryDirectory onNavigate={onNavigate} />
    </details>
  );
}
