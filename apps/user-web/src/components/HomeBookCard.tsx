import { useState } from "react";
import { BookOpen, ChevronRight, MapPin, Tag, UserRound } from "lucide-react";
import { BookCard } from "./BookCard";
import { BookCardMotion } from "./BookCardMotion";
import { CardFitText } from "./CardFitText";
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
        <div className={styles.cover}>
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
          <span className={styles.condition}>
            <BookOpen size={15} aria-hidden="true" />
            Mẫu: {conditions[book.condition]} ·{" "}
            {book.mode === "Sale"
              ? "Bán"
              : book.mode === "Exchange"
                ? "Đổi"
                : "Bán hoặc đổi"}
          </span>
        </div>
        <div className={styles.meta}>
          <h3 className={styles.previewHeading}>
            <span
              className={styles.previewNote}
              title={`${book.book.category} · ${languageLabel(book.book.language)}`}
            >
              {book.book.category} · {languageLabel(book.book.language)}
            </span>
            <a
              href={book.book.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={book.book.title}
            >
              <CardFitText>{book.book.title}</CardFitText>
            </a>
          </h3>
          <div className={styles.information}>
            <p className={styles.author}>
              <UserRound size={18} aria-hidden="true" />
              <span className="sr-only">Tác giả: </span>
              <CardFitText minimumRem={0.6875}>
                {book.book.authors.join(", ") || "Chưa rõ tác giả"}
              </CardFitText>
            </p>
            <p className={styles.location}>
              <MapPin size={18} aria-hidden="true" />
              <span>
                <span className={styles.fieldLabel}>Khu vực</span>
                <strong className={styles.region}>
                  <CardFitText minimumRem={0.6875}>
                    Không áp dụng cho sách mẫu
                  </CardFitText>
                </strong>
              </span>
            </p>
          </div>
          <div className={styles.prices}>
            {book.salePrice !== null && (
              <p>
                <Tag size={24} aria-hidden="true" />
                <span>
                  <span className={styles.fieldLabel}>Giá bán mẫu</span>
                  <strong className={styles.amount}>
                    <CardFitText>{formatVnd(book.salePrice)}</CardFitText>
                  </strong>
                </span>
              </p>
            )}
            {book.exchangeValue !== null && (
              <p>
                <Tag size={24} aria-hidden="true" />
                <span>
                  <span className={styles.fieldLabel}>Giá trị đổi mẫu</span>
                  <strong className={styles.amount}>
                    <CardFitText>{formatVnd(book.exchangeValue)}</CardFitText>
                  </strong>
                </span>
              </p>
            )}
          </div>
          <a
            className={styles.view}
            href={book.book.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen size={18} aria-hidden="true" /> Xem nguồn{" "}
            <ChevronRight size={19} aria-hidden="true" />
            <span className="sr-only"> trên Open Library (tab mới)</span>
          </a>
        </div>
      </article>
    </BookCardMotion>
  );
}
