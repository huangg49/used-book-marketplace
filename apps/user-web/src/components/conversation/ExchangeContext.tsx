import { BookOpen } from "lucide-react";
import type { ExchangeDetail } from "../../lib/mock/exchangeDetail";
import { BookCover } from "../BookCover";
import { conditions } from "../../lib/listing-labels";
import { formatVnd } from "../../lib/routes";
import { ExchangeFinanceFacts } from "./ExchangeFinanceSummary";
import { TransactionDisclosure } from "./TransactionFrame";
import styles from "./ExchangeContext.module.css";

export function ExchangeContext({ detail }: { detail: ExchangeDetail }) {
  return (
    <div className={styles.context}>
      <header>
        <h3>Sách và thỏa thuận</h3>
        <p>
          Phiếu #{detail.transactionCode} · Với <span title={detail.partner.username}>{detail.partner.username}</span>
        </p>
      </header>
      {[
        { label: "Bạn gửi", books: detail.giveBooks },
        { label: "Bạn nhận", books: detail.receiveBooks },
      ].map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h4>
            {group.label} <span>· {group.books.length} cuốn</span>
          </h4>
          {group.books.length === 0 ? (
            <p>Chưa tải được thông tin bản sách.</p>
          ) : (
            group.books.map((book, index) => (
              <div className={styles.book} key={book.id}>
                <div className={styles.cover} data-conversation-cover={group.label === "Bạn nhận" && index === 0 ? "" : undefined}>
                  {book.coverUrl ? (
                    <BookCover
                      title={book.title}
                      coverUrl={book.coverUrl}
                      index={0}
                    />
                  ) : (
                    <BookOpen size={24} aria-hidden="true" />
                  )}
                </div>
                <div>
                  <strong dir="auto" title={book.title}>{book.title}</strong>
                  <p>{book.author}</p>
                  <span>
                    {conditions[book.condition as keyof typeof conditions] ??
                      "Chưa có dữ liệu tình trạng"}
                    {book.price != null ? ` · ${formatVnd(book.price)}` : ""}
                  </span>
                  {(book.conditionDetails || book.editionLabel) && (
                    <details>
                      <summary>Tình trạng đã ghi nhận</summary>
                      {book.editionLabel && <p>{book.editionLabel}</p>}
                      {book.conditionDetails && <p>{book.conditionDetails}</p>}
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      ))}
      <dl className={styles.money}>
        <div>
          <dt>Cọc của bạn</dt>
          <dd>
            {detail.viewerDeposit != null
              ? formatVnd(detail.viewerDeposit)
              : "Chưa có dữ liệu"}
          </dd>
        </div>
        <div>
          <dt>Tiền bù</dt>
          <dd>
            {detail.moneyCompensationType === "none"
              ? "Không bù"
              : detail.moneyAmount == null
                ? "Chưa có dữ liệu"
                : `${detail.moneyCompensationType === "user_pays" ? "Bạn bù" : "Đối tác bù"} ${formatVnd(detail.moneyAmount)}`}
          </dd>
        </div>
      </dl>
      <TransactionDisclosure title="Chi tiết các khoản theo phiếu">
        <ExchangeFinanceFacts detail={detail} />
      </TransactionDisclosure>
      {!detail.hasAgreementSnapshot && (
        <p className={styles.notice}>
          Hồ sơ cũ thiếu bản chụp sách ban đầu. Các khoản nghĩa vụ vẫn lấy từ
          phiếu đã lưu.
        </p>
      )}
    </div>
  );
}
