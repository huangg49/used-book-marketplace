import { useState } from "react";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { ConfirmDialog } from "../../ConfirmDialog";
import styles from "./ReceiveDialog.module.css";

interface Props {
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isBusy: boolean;
  books: ExchangeDetail["receiveBooks"];
}

export function ReceiveDialog({ onClose, onConfirm, isBusy, books }: Props) {
  const [received, setReceived] = useState(false);
  const [error, setError] = useState("");

  return (
    <ConfirmDialog isOpen onClose={onClose} title="Xác nhận đã nhận sách"
      description="Bạn có 72 giờ để kiểm tra sách và báo sự cố kể từ lúc xác nhận đã nhận."
      confirmText="Xác nhận nhận sách" cancelText="Để sau"
      confirmDisabled={!received} isBusy={isBusy} maxWidth="480px"
      onConfirm={async () => {
        if (isBusy || !received) return;
        setError("");
        try {
          await onConfirm();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Chưa xác nhận được. Vui lòng thử lại.");
        }
      }}>
      {books.length > 0 && (
        <ul className={styles.books} aria-label="Sách trong kiện bạn nhận">
          {books.map(book => <li key={book.id}><span dir="auto" title={book.title}>{book.title}</span></li>)}
        </ul>
      )}
      <label className={styles.checkboxLabel}>
        <input type="checkbox" checked={received}
          onChange={event => setReceived(event.target.checked)} disabled={isBusy} />
        Tôi đã nhận được kiện sách.
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </ConfirmDialog>
  );
}
