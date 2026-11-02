import { useState } from "react";
import { BookOpen, ChevronRight, MapPin, UserRound } from "lucide-react";
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
      <BookCardMotion index={index}>
        <BookCard book={book} index={index} compact />
      </BookCardMotion>
    );
  return (
    <BookCardMotion index={index}>
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
              className={styles.titleLink}
            >
              {book.book.title}
            </a>
            {book.book.title.length > 28 && (
              <span className={styles.titleTooltip} role="tooltip" aria-hidden="true">
                {book.book.title}
              </span>
            )}
          </h3>
          <div className={styles.information}>
            <p className={styles.seller} title="Người đăng: Lật Lại Tuyển Chọn">
              <UserRound size={13} aria-hidden="true" />
              <span className="sr-only">Người đăng: </span>
              <span className={styles.ellipsis}>
                Lật Lại Tuyển Chọn
              </span>
            </p>
            <p className={styles.location} title="Khu vực: Toàn quốc">
              <MapPin size={13} aria-hidden="true" />
              <span className="sr-only">Khu vực: </span>
              <strong className={`${styles.region} ${styles.ellipsis}`}>
                Toàn quốc
              </strong>
            </p>
          </div>
          <div className={styles.footerRow}>
            <div className={styles.prices}>
              <div className={styles.primaryRow}>
                <span className={styles.priceLabel}>
                  {book.salePrice !== null ? "Giá bán mẫu" : "Giá trị đổi"}
                </span>
                <strong className={styles.amount}>
                  <CardFitText>
                    {book.salePrice !== null
                      ? formatVnd(book.salePrice)
                      : book.exchangeValue !== null
                        ? formatVnd(book.exchangeValue)
                        : "Thỏa thuận"}
                  </CardFitText>
                </strong>
              </div>
              <div className={styles.secondaryRow}>
                {book.salePrice !== null && book.exchangeValue !== null ? (
                  <span
                    className={styles.exchangeNote}
                    title={`Có thể đổi với sách tương đương ${formatVnd(book.exchangeValue)}`}
                  >
                    Hoặc đổi ~{formatVnd(book.exchangeValue)}
                  </span>
                ) : book.salePrice !== null ? (
                  <span className={styles.modeNote}>Chỉ bán trực tiếp</span>
                ) : book.exchangeValue !== null ? (
                  <span className={styles.modeNote}>Chỉ nhận trao đổi</span>
                ) : (
                  <span className={styles.modeNote}>Thỏa thuận trực tiếp</span>
                )}
              </div>
            </div>
            <a
              className={styles.view}
              href={book.book.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Xem ${book.book.title} trên Open Library (tab mới)`}
            >
              <span>Xem nguồn</span>
              <ChevronRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </article>
    </BookCardMotion>
  );
}
