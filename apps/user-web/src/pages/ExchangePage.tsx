import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { ROUTES, formatVnd, searchUrl } from "../lib/routes";
import {
  getPublicListings,
  type PublicListing,
} from "../services/public-listings";
import { ListingPhoto } from "../components/BookCard";
import styles from "./ExchangePage.module.css";

function ExchangeBookCard({ book }: { book: PublicListing }) {
  return (
    <article className={styles.card}>
      <div className={styles.cover}>
        <ListingPhoto book={book} />
      </div>
      <h3 className={styles.cardTitle}>{book.book.title}</h3>
      <p className={styles.cardAuthor}>{book.book.authors.join(", ")}</p>
      <p className={styles.cardMeta}>
        <span className={styles.cardLocation}>
          <MapPin size={13} aria-hidden="true" /> TP.HCM
        </span>
        <span>Giá trị đổi {formatVnd(book.exchangeValue ?? 0)}</span>
      </p>
      <Link className={styles.cardCta} to={ROUTES.bookDetail(book.id)}
        aria-label={`Xem sách ${book.book.title}`}>
        Xem sách
      </Link>
    </article>
  );
}
export default function ExchangePage() {
  const query = useQuery({
    queryKey: ["exchange-public-listings"],
    queryFn: () =>
      getPublicListings(new URLSearchParams({ mode: "Exchange", limit: "12" })),
  });
  return (
    <>
      <section className={styles.open} aria-labelledby="open-title">
        <div className={styles.container}>
          <div className={styles.openHeader}>
            <div>
              <h1 id="open-title" className={styles.openTitle}>Tìm sách để đổi</h1>
            </div>
            <Link className={styles.moreButton} to={ROUTES.exchangeMine}>Trao đổi của tôi</Link>
          </div>
          {query.isLoading && <p role="status">Đang tải sách…</p>}
          {query.isError && (
            <div role="alert">
              <p>Chưa tải được sách để đổi.</p>
              <button
                type="button"
                className={styles.moreButton}
                onClick={() => void query.refetch()}
              >
                Thử lại
              </button>
            </div>
          )}
          {query.data && !query.data.items.length && (
            <p>Chưa có bài đăng đang mở trao đổi.</p>
          )}
          {!query.isError && (
            <div className={styles.bookGrid}>
              {query.data?.items.map((book) => (
                <ExchangeBookCard key={book.id} book={book} />
              ))}
            </div>
          )}
          <div className={styles.moreWrap}>
            <Link
              className={styles.moreButton}
              to={searchUrl({ mode: "Exchange" })}
            >
              Khám phá tất cả sách trao đổi
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
