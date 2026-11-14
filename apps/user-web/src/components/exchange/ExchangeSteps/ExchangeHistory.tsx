import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock, ShieldCheck } from "lucide-react";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { conditions } from "../../../lib/listing-labels";
import { formatVnd } from "../../../lib/routes";
import { BookCover } from "../../BookCover";
import styles from "./ExchangeHistory.module.css";

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

function amount(value?: number) {
  return value == null ? "Chưa có dữ liệu" : formatVnd(value);
}

function bookTotal(books: ExchangeDetail["giveBooks"]) {
  if (!books.length || books.some(book => book.price == null)) return undefined;
  return books.reduce((sum, book) => sum + (book.price ?? 0), 0);
}

export function ExchangeBookList({ books, hasSnapshot, incoming = false, heading }: {
  books: ExchangeDetail["giveBooks"];
  hasSnapshot?: boolean;
  incoming?: boolean;
  heading?: string;
}) {
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  const total = hasSnapshot ? bookTotal(books) : undefined;
  return (
    <section className={styles.bookGroup} data-incoming={incoming || undefined}>
      <header>
        <h3><Icon size={19} aria-hidden="true" />{heading ?? (incoming ? "Bạn nhận" : "Bạn gửi")}</h3>
        <p>{books.length} cuốn{total != null && <> <span aria-hidden="true">·</span> {formatVnd(total)}</>}</p>
      </header>
      {books.length ? (
        <ul className={styles.books}>
          {books.map((book, index) => (
            <li key={book.id} className={styles.book}>
              <div className={styles.cover} aria-hidden="true">
                <BookCover title={book.title} coverUrl={book.coverUrl} index={index} />
              </div>
              <div className={styles.bookText}>
                <strong title={book.title} dir="auto">{book.title}</strong>
                {book.author && <p className={styles.author} title={book.author} dir="auto">{book.author}</p>}
                <p className={styles.bookFacts}>
                  {conditions[book.condition as keyof typeof conditions] ?? "Chưa rõ tình trạng"}
                  {hasSnapshot && book.price != null && <span>{formatVnd(book.price)}</span>}
                </p>
                {(book.conditionDetails || book.editionLabel) && (
                  <details className={styles.condition}>
                    <summary>Tình trạng đã ghi nhận <ChevronDown size={14} aria-hidden="true" /></summary>
                    {book.editionLabel && <p>{book.editionLabel}</p>}
                    {book.conditionDetails && <p>{book.conditionDetails}</p>}
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className={styles.empty}>Chưa có thông tin sách.</p>}
    </section>
  );
}

export function ProposalHistory({ detail }: { detail: ExchangeDetail }) {
  const compensation = detail.moneyCompensationType;
  return (
    <>
      <div className={styles.comparison}>
        <ExchangeBookList books={detail.giveBooks} hasSnapshot={detail.hasAgreementSnapshot} />
        <ExchangeBookList books={detail.receiveBooks} hasSnapshot={detail.hasAgreementSnapshot} incoming />
      </div>
      {!detail.hasAgreementSnapshot && <p className={styles.note}>Phiếu cũ thiếu bản chụp sách ban đầu.</p>}
      <div className={styles.financialSection}>
        <h3 className={styles.financialTitle}>
          <ShieldCheck size={16} aria-hidden="true" /> Cam kết tài chính & Ký quỹ an toàn
        </h3>
        <dl className={styles.agreement}>
          <div className={styles.agreementCard}>
            <dt>Cọc của bạn</dt>
            <dd>{amount(detail.viewerDeposit)}</dd>
            <span className={styles.agreementHint}>Hoàn trả khi nhận sách</span>
          </div>
          <div className={styles.agreementCard}>
            <dt>Cọc của đối tác</dt>
            <dd>{amount(detail.partnerDeposit)}</dd>
            <span className={styles.agreementHint}>Lật Lại đang bảo chứng</span>
          </div>
          <div className={`${styles.agreementCard} ${detail.moneyAmount ? styles.highlightCard : ""}`}>
            <dt>{compensation === "user_pays" ? "Tiền bù bạn trả" : compensation === "other_pays" ? "Tiền bù đối tác trả" : "Tiền bù"}</dt>
            <dd>{compensation === "none" ? "Không có" : amount(detail.moneyAmount)}</dd>
            <span className={styles.agreementHint}>
              {compensation === "user_pays" ? "Cộng vào đơn đối tác" : compensation === "other_pays" ? "Chuyển vào ví bạn" : "Giá trị hai bên cân bằng"}
            </span>
          </div>
        </dl>
        <p className={styles.escrowNote}>
          🛡️ Toàn bộ tiền cọc và tiền bù được bảo chứng an toàn trong tài khoản ký quỹ Lật Lại, tự động quyết toán sau khi hai bên hoàn tất giao nhận.
        </p>
      </div>
    </>
  );
}

function FundingSide({ label, fundedAt, deposit, compensation, total, incoming = false }: {
  label: string;
  fundedAt?: string;
  deposit?: number;
  compensation?: { amount?: number };
  total?: number;
  incoming?: boolean;
}) {
  const date = fundedAt ? new Date(fundedAt) : undefined;
  const Icon = date ? Check : Clock;
  return (
    <section className={styles.fundingSide} data-incoming={incoming || undefined}>
      <header>
        <h3>{label}</h3>
        <p className={styles.fundingStatus} data-funded={Boolean(date) || undefined}>
          <Icon size={15} aria-hidden="true" />{date ? "Đã ghi nhận nộp" : "Chưa ghi nhận nộp"}
        </p>
      </header>
      <div className={styles.fundingMain}>
        <p>{date ? "Tổng đã nộp" : "Tổng theo thỏa thuận"}</p>
        <strong>{amount(total)}</strong>
        {date && <time dateTime={fundedAt}>{timeFormat.format(date)} · {dateFormat.format(date)}</time>}
      </div>
      <dl className={styles.breakdown}>
        <div><dt>Cọc bảo chứng</dt><dd>{amount(deposit)}</dd></div>
        <div><dt>Tiền bù trả</dt><dd>{compensation ? amount(compensation.amount) : "Không có"}</dd></div>
      </dl>
    </section>
  );
}

export function FundingHistory({ detail }: { detail: ExchangeDetail }) {
  const viewerPays = detail.moneyCompensationType === "user_pays";
  const partnerPays = detail.moneyCompensationType === "other_pays";
  const compensation = { amount: detail.moneyAmount };
  const partnerExtra = partnerPays ? compensation.amount : 0;
  const partnerTotal = detail.partnerDeposit == null || partnerExtra == null
    ? undefined : detail.partnerDeposit + partnerExtra;
  return (
    <>
      <div className={styles.comparison}>
        <FundingSide label="Bạn" fundedAt={detail.viewerFundedAt}
          deposit={detail.viewerDeposit} total={detail.viewerFundingAmount}
          compensation={viewerPays ? compensation : undefined} />
        <FundingSide label="Đối tác" fundedAt={detail.partnerFundedAt}
          deposit={detail.partnerDeposit} total={partnerTotal}
          compensation={partnerPays ? compensation : undefined} incoming />
      </div>
      <p className={styles.note}>Các khoản nộp từ ví mô phỏng. Phí giao nhận tính riêng.</p>
    </>
  );
}
