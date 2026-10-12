import { useState } from "react";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { BookCard } from "./BookCard";
import { BookCardMotion } from "./BookCardMotion";
import type { HomeShelfBook } from "../services/home-shelves";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import styles from "./BookCard.module.css";
import { languageLabel } from "@used-books/api-contract/catalog-taxonomy";

export function HomeBookCard({
  book,
  index,
}: {
  book: HomeShelfBook;
  index: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!("preview" in book))
    return (
      <BookCardMotion>
        <BookCard book={book} index={index} compact />
      </BookCardMotion>
    );
  return (
    <BookCardMotion>
      <article
        className={`${styles.card} ${styles.compact}`}
        data-catalog-preview="true"
      >
        <div className={`${styles.cover} ${styles["ground" + (index % 4)]}`}>
          {failed ? (
            <div className={styles.fallback}>
              <BookOpen size={30} aria-hidden="true" />
              <span>Chưa tải được bìa</span>
              <button type="button" onClick={() => setFailed(false)}>
                Tải lại ảnh
              </button>
            </div>
          ) : (
            <img
              className={styles.image}
              src={book.book.coverUrl}
              alt={`Bìa ${book.book.title}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          )}
          <a
            className={styles.coverLink}
            href={book.book.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Xem ${book.book.title} trên Open Library (tab mới)`}
          />
        </div>
        <div className={styles.meta}>
          <p className={styles.condition}>
            {book.book.category} · {languageLabel(book.book.language)}
          </p>
          <h3>
            <a
              href={book.book.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={book.book.title}
            >
              {book.book.title}
            </a>
          </h3>
          <p className={styles.author}>{book.book.authors.join(", ")}</p>
          <p className={styles.condition}>
            Mẫu: {conditions[book.condition]} ·{" "}
            {book.mode === "Sale"
              ? "Bán"
              : book.mode === "Exchange"
                ? "Đổi"
                : "Bán hoặc đổi"}
          </p>
          <div className={styles.prices}>
            {book.salePrice !== null && (
              <p>
                <span>Giá bán mẫu</span>
                <strong>{formatVnd(book.salePrice)}</strong>
              </p>
            )}
            {book.exchangeValue !== null && (
              <p>
                <span>Giá trị đổi mẫu</span>
                <strong>{formatVnd(book.exchangeValue)}</strong>
              </p>
            )}
          </div>
          <a
            className={styles.view}
            href={book.book.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Xem nguồn <ArrowUpRight size={16} aria-hidden="true" />
            <span className="sr-only"> trên Open Library (tab mới)</span>
          </a>
        </div>
      </article>
    </BookCardMotion>
  );
}
