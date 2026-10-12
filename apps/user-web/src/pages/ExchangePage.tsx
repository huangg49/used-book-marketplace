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

const EXCHANGE_STEPS = [
  {
    title: "Chọn sách muốn nhận",
    description: "Tìm một bản sách đang cho phép trao đổi tại TP.HCM.",
  },
  {
    title: "Chọn sách để đổi",
    description:
      "Chọn một bản sách đã duyệt trong kệ của bạn. Tiền bù được tính từ giá trị đổi của hai bản sách.",
  },
  {
    title: "Đặt cọc và giao nhận",
    description:
      "Sau khi đề nghị được chấp nhận, hai bên đặt cọc từ ví mô phỏng, gửi sách và xác nhận khi đã nhận đúng sách.",
  },
];

function ExchangeBookCard({ book }: { book: PublicListing }) {
  return (
    <article className={styles.card}>
      <div className={styles.cover}>
        <ListingPhoto book={book} />
      </div>
      <h3 className={styles.cardTitle}>{book.book.title}</h3>
      <p className={styles.cardAuthor}>{book.book.authors.join(", ")}</p>
      <p className={styles.cardWants}>
        <span className={styles.cardWantsLabel}>Cho phép đổi sách</span> · Chọn
        bản sách của bạn để gửi đề nghị
      </p>
      <p className={styles.cardMeta}>
        <span className={styles.cardLocation}>
          <MapPin size={13} aria-hidden="true" /> TP.HCM
        </span>
        <span>Giá trị đổi {formatVnd(book.exchangeValue ?? 0)}</span>
      </p>
      <Link
        className={styles.cardCta}
        to={ROUTES.exchangeCompose(book.id)}
        aria-label={`Gửi đề nghị trao đổi cho ${book.book.title}`}
      >
        Gửi đề nghị
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
      <section className={styles.intro} aria-labelledby="exchange-title">
        <p className={styles.tagline}>
          Từ tay này sang tay kia, mỗi câu chuyện đều tiếp tục
        </p>
        <h1 id="exchange-title" className={styles.title}>
          Góc trao đổi sách
        </h1>
        <p className={styles.lead}>
          Nơi những cuốn sách cũ tìm thấy mái nhà mới, qua sự kết nối giữa những
          người yêu văn chương.
        </p>
        <ol className={styles.steps}>
          {EXCHANGE_STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <h2 className={styles.stepTitle}>{step.title}</h2>
              <p className={styles.stepText}>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className={styles.matches} aria-labelledby="matches-title">
        <div className={styles.container}>
          <div className={styles.matchesHeader}>
            <h2 id="matches-title" className={styles.matchesTitle}>
              Trao đổi của bạn
            </h2>
            <div className={styles.matchesRule} aria-hidden="true" />
            <Link className={styles.moreButton} to={ROUTES.exchangeMine}>
              Xem đề nghị và tiến trình
            </Link>
          </div>
          <p>
            Gợi ý khớp tự động chưa khả dụng. Chọn sách đang cho phép đổi để gửi
            đề nghị.
          </p>
        </div>
      </section>
      <section className={styles.open} aria-labelledby="open-title">
        <div className={styles.container}>
          <div className={styles.openHeader}>
            <div>
              <h2 id="open-title" className={styles.openTitle}>
                Sách đang mở trao đổi
              </h2>
              <p className={styles.openLead}>
                Những bản sách được duyệt và đang cho phép đổi.
              </p>
            </div>
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
