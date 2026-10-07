import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Search, Repeat } from "lucide-react";
import { ROUTES, searchUrl } from "../lib/routes";
import { BookCard } from "../components/BookCard";
import { getPublicListings } from "../services/public-listings";
import styles from "./HomePage.module.css";

function Shelf({ mode, title }: { mode?: "Exchange"; title: string }) {
  const query = new URLSearchParams({
    limit: "6",
    sort: "newest",
    ...(mode ? { mode } : {}),
  });
  const result = useQuery({
    queryKey: ["public-listings", query.toString()],
    queryFn: () => getPublicListings(query),
    retry: false,
  });
  return (
    <section className={styles.shelf}>
      <div className={styles.shelfHeader}>
        <div>
          <h2 className={styles.shelfTitle}>{title}</h2>
          <p className={styles.shelfSubtitle}>
            Bìa, tình trạng và giá từ từng bản sách đang được đăng.
          </p>
        </div>
        <Link
          className={styles.shelfViewAll}
          to={mode ? `${ROUTES.search}?mode=${mode}` : ROUTES.search}
        >
          Xem tất cả →
        </Link>
      </div>
      <div aria-live="polite">
        {result.isPending && <p>Đang tải kệ sách…</p>}
        {result.isError && (
          <div role="alert">
            <p>Chưa tải được sách.</p>
            <button type="button" onClick={() => void result.refetch()}>
              Thử lại
            </button>
          </div>
        )}
        {result.data?.items.length === 0 && <p>Chưa có sách trong kệ này.</p>}
        <div className={styles.shelfGrid}>
          {result.data?.items.map((book, index) => (
            <BookCard key={book.id} book={book} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
export default function HomePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(searchUrl({ q: search.trim() }));
  };
  const actions = [
    { to: ROUTES.search, title: "Khám phá sách", Icon: BookOpen },
    { to: ROUTES.sell, title: "Đăng sách", Icon: BookOpen },
    {
      to: `${ROUTES.search}?mode=Exchange`,
      title: "Sách để trao đổi",
      Icon: Repeat,
    },
  ];
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroContainer}>
          <div className={styles.heroLeft}>
            <span className={styles.heroTag}>
              LẬT LẠI · TIỆM SÁCH CHUYỀN TAY
            </span>
            <h1 id="hero-title" className={styles.heroTitle}>
              Những cuốn sách xứng đáng được đọc thêm một lần nữa.
            </h1>
            <p className={styles.heroLead}>
              Tìm một bản sách cũ, xem tình trạng thật và chọn mua hoặc trao đổi
              với người đang giữ sách.
            </p>
            <div className={styles.heroActions}>
              <Link to={ROUTES.search} className={styles.btnPrimary}>
                Dạo kệ sách
              </Link>
              <Link to={ROUTES.sell} className={styles.btnOutline}>
                Đăng sách của bạn
              </Link>
            </div>
          </div>
          <form
            onSubmit={submit}
            className={styles.featuredCard}
            style={{ padding: "2rem" }}
          >
            <label
              htmlFor="home-book-search"
              style={{ display: "block", marginBottom: "1rem" }}
            >
              Bạn muốn tìm cuốn nào?
            </label>
            <input
              id="home-book-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tên sách, tác giả hoặc ISBN"
              style={{
                width: "100%",
                padding: "0.75rem",
                marginBottom: "1rem",
              }}
            />
            <button type="submit" className={styles.btnBidPrimary}>
              <Search size={18} aria-hidden="true" /> Tìm sách
            </button>
          </form>
        </div>
      </section>
      <section className={styles.quickActions}>
        <div className={styles.quickActionsGrid}>
          {actions.map(({ to, title, Icon }) => (
            <Link key={to} to={to} className={styles.actionCard}>
              <Icon aria-hidden="true" />
              <h2 className={styles.actionTitle}>{title}</h2>
            </Link>
          ))}
        </div>
      </section>
      <main className={styles.shelves} id="kham-pha">
        <Shelf title="Mới lên kệ" />
        <Shelf title="Sẵn sàng trao đổi" mode="Exchange" />
      </main>
    </div>
  );
}
