import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import type { ReactNode } from "react";
import { useExchangeRecovery } from "../../hooks/useExchangeRecovery";
import type { ExchangeDetail } from "../../lib/mock/exchangeDetail";
import { formatVnd } from "../../lib/routes";
import { getExchangeDetail } from "../../services/exchangeDetail";
import { pendingExchange } from "../../services/exchange";
import styles from "../../pages/DirectOrders.module.css";
import local from "./ExchangeFinanceSummary.module.css";

const money = (value: number | null | undefined) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? (
    <span className={local.amount}>{formatVnd(value)}</span>
  ) : (
    "Chưa có dữ liệu"
  );

function total(books: ExchangeDetail["giveBooks"]) {
  if (!books.length || books.some((book) => book.price == null))
    return undefined;
  return books.reduce((sum, book) => sum + book.price!, 0);
}

function Row({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`${styles.paymentRow} ${local.row} ${emphasis ? styles.paymentTotalRow : ""}`}
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ExchangeFinanceFacts({
  detail,
  uncertain = false,
  readFailed = false,
  now,
}: {
  detail: ExchangeDetail;
  uncertain?: boolean;
  readFailed?: boolean;
  now?: number;
}) {
  const proposed = detail.rawStatus === "Proposed";
  const awaiting = detail.rawStatus === "AcceptedAwaitingFunding";
  const fundingExpired = Boolean(
    detail.fundingDeadline &&
    now !== undefined &&
    Date.parse(detail.fundingDeadline) <= now,
  );
  const amountLabel =
    uncertain || readFailed || fundingExpired
      ? "Khoản theo thỏa thuận của bạn"
      : proposed
        ? "Dự kiến nộp khi chấp nhận"
        : awaiting && !detail.viewerFundedAt
          ? "Khoản cần nộp từ ví mô phỏng"
          : "Khoản theo thỏa thuận của bạn";
  return (
    <>
      {!detail.hasAgreementSnapshot && (
        <p className={local.note}>
          Hồ sơ cũ thiếu bản chụp sách. Các khoản cọc và bù bên dưới lấy từ
          phiếu đã lưu.
        </p>
      )}
      <dl className={styles.paymentDl}>
        <Row label={`Sách bạn giao (${detail.giveBooks.length} cuốn)`}>
          {detail.hasAgreementSnapshot
            ? money(total(detail.giveBooks))
            : "Thiếu bản chụp"}
        </Row>
        <Row label={`Sách bạn nhận (${detail.receiveBooks.length} cuốn)`}>
          {detail.hasAgreementSnapshot
            ? money(total(detail.receiveBooks))
            : "Thiếu bản chụp"}
        </Row>
        <Row label="Tiền bù">
          {detail.moneyCompensationType === "none" ? (
            "Ngang giá — không bù"
          ) : (
            <>
              {detail.moneyCompensationType === "user_pays"
                ? "Bạn bù "
                : "Đối tác bù "}
              {money(detail.moneyAmount)}
            </>
          )}
        </Row>
        <Row label="Cọc bảo chứng của bạn">{money(detail.viewerDeposit)}</Row>
        <Row label="Cọc bảo chứng của đối tác">
          {money(detail.partnerDeposit)}
        </Row>
        <Row label={amountLabel} emphasis>
          {money(detail.viewerFundingAmount)}
        </Row>
      </dl>
      <p className={local.note}>
        Khoản của bạn gồm cọc và tiền bù bạn trả, nếu có. Phí giao nhận mỗi bên
        tự chịu theo từng chiều, chưa gộp vào khoản này.
      </p>
      <p className={local.note}>
        {readFailed
          ? "Dữ liệu chưa cập nhật. Tải lại phiếu trước khi thực hiện thao tác mới."
          : uncertain
            ? "Kết quả thao tác trước chưa rõ. Dùng phần khôi phục trên phiếu, không gửi lệnh nộp mới."
            : proposed
              ? "Đề nghị chưa giữ sách hoặc tiền. Hai bên kiểm tra và chấp nhận trước khi nộp."
              : awaiting && fundingExpired
                ? "Đã hết hạn nộp. Tải lại phiếu để xem kết quả xử lý; không nộp thêm."
                : awaiting
                  ? detail.viewerFundedAt
                    ? "Đã ghi nhận khoản nộp của bạn; đang chờ đối tác hoàn tất."
                    : "Kiểm tra phiếu và thời hạn trước khi nộp. Chỉ gửi sách sau khi cả hai bên nộp đủ."
                  : "Xem trạng thái và bước tiếp theo trên phiếu. Số tiền theo thỏa thuận không tự chứng minh đã hoàn cọc hoặc chuyển bù."}
      </p>
    </>
  );
}

function SavedSummary({
  id,
  userId,
  now,
}: {
  id: string;
  userId: string;
  now?: number;
}) {
  useExchangeRecovery();
  // Same cache and mapper as the embedded sheet: no second financial projection.
  const query = useQuery({
    queryKey: ["exchangeDetail", userId, id],
    queryFn: () => getExchangeDetail(id),
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const accessDenied =
    query.isError &&
    query.error instanceof ApiError &&
    [401, 403, 404].includes(query.error.status);
  const detail =
    !accessDenied && query.data?.viewer.id === userId ? query.data : undefined;
  return (
    <>
      <p className={local.note}>
        Phiếu #{id.slice(0, 8).toUpperCase()} · Giá trị trên phiếu đã lưu
      </p>
      {!detail && query.isPending && (
        <p role="status">Đang tải giá trị và khoản cọc…</p>
      )}
      {query.isError && (
        <div role="alert">
          <p>
            {accessDenied
              ? "Không thể xem khoản trao đổi với quyền truy cập hiện tại."
              : "Chưa cập nhật được khoản trao đổi."}
            {detail
              ? " Các giá trị dưới đây thuộc lần tải trước."
              : " Chưa thể xác định số tiền."}
          </p>
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={() => void query.refetch()}
          >
            Tải lại khoản trao đổi
          </button>
        </div>
      )}
      {detail && (
        <ExchangeFinanceFacts
          detail={detail}
          uncertain={Boolean(pendingExchange(id))}
          readFailed={query.isError}
          now={now}
        />
      )}
    </>
  );
}

export function ExchangeFinanceSummary({
  id,
  userId,
  referenceValue,
  sheetId,
  historical = false,
  now,
}: {
  id?: string | null;
  userId: string;
  referenceValue?: number | null;
  sheetId: string;
  historical?: boolean;
  now?: number;
}) {
  return (
    <section
      aria-label="Tóm tắt tài chính đổi sách"
      className={`${styles.paymentCard} ${local.summary}`}
    >
      <div className={`${styles.paymentCardHeader} ${local.header}`}>
        <span className={styles.paymentHeading}>
          {historical ? "Thỏa thuận trước đó" : "Giá trị và cọc trao đổi"}
        </span>
        <span className={styles.paymentModeBadge}>Đổi sách</span>
      </div>
      {id ? (
        <SavedSummary
          key={id + ":" + userId}
          id={id}
          userId={userId}
          now={now}
        />
      ) : (
        <>
          <dl className={styles.paymentDl}>
            <Row label="Giá trị quy đổi đang đăng">{money(referenceValue)}</Row>
            <Row label="Cọc và tiền bù">Chưa có thỏa thuận</Row>
          </dl>
          <p className={local.note}>
            Người mở đề nghị chọn sách đem đổi. Phiếu sẽ ghi giá trị hai phía,
            bên bù và hai khoản cọc; mỗi bên cọc bằng giá trị sách mình nhận.
            Chưa giữ sách hoặc tiền ở bước này.
          </p>
        </>
      )}
      <a className={local.link} href={"#" + sheetId}>
        {id ? "Xem phiếu và bước tiếp theo" : "Đến phần chọn sách / đề nghị"}
      </a>
    </section>
  );
}
