import { formatSaleFeeRate, type SaleSettlementReceipt } from "@used-books/session-client";
import { formatVnd } from "../lib/routes";
import styles from "./SaleFeeBreakdown.module.css";

export function SaleFeeBreakdown({ amounts, settled }: { amounts: SaleSettlementReceipt; settled: boolean }) {
  return (
    <dl className={styles.breakdown} aria-label={settled ? "Chi tiết quyết toán" : "Tiền người bán dự kiến nhận"}>
      <div><dt>Tiền sách</dt><dd>{formatVnd(amounts.bookPrice)}</dd></div>
      <div><dt>Phí dịch vụ ({formatSaleFeeRate(amounts.commissionBps)})</dt><dd>{amounts.commission > 0 ? "−" : ""}{formatVnd(amounts.commission)}</dd></div>
      {amounts.shippingReimbursement > 0 && (
        <div><dt>Hoàn ứng phí giao nhận</dt><dd>+{formatVnd(amounts.shippingReimbursement)}</dd></div>
      )}
      <div className={styles.total}><dt>{settled ? "Thực nhận vào ví" : "Dự kiến nhận vào ví"}</dt><dd>{formatVnd(amounts.creditedAmount)}</dd></div>
    </dl>
  );
}
