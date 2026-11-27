import { useState } from "react";
import { CheckCircle2, Clock, PackageCheck, Wallet } from "lucide-react";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { ExchangeActionDialog } from "../ExchangeActionDialog";
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
  const bookSummary =
    books.length === 0
      ? "Kiện sách bạn nhận"
      : books.length === 1
        ? books[0].title
        : `${books[0].title} và ${books.length - 1} cuốn khác`;

  return (
    <ExchangeActionDialog
      isOpen
      onClose={onClose}
      icon={<PackageCheck size={20} />}
      title="Xác nhận đã nhận sách"
      bookTitle={bookSummary}
      confirmText="Đã nhận sách"
      cancelText="Để sau"
      confirmDisabled={!received}
      isBusy={isBusy}
      error={error || undefined}
      steps={[
        {
          icon: <PackageCheck size={14} />,
          label: "Ghi nhận đã nhận kiện",
          detail: "Mở đồng hồ kiểm tra riêng của bạn.",
        },
        {
          icon: <Clock size={14} />,
          label: "72 giờ kiểm tra sách",
          detail: (
            <>
              Đối chiếu tình trạng hoặc <strong>báo sự cố</strong> nếu sách khác mô tả.
            </>
          ),
        },
        {
          icon: <Wallet size={14} />,
          label: "Hoàn cọc & tất toán",
          detail: "Tự động xử lý về Ví sau 72 giờ của hai bên nếu không có tranh chấp.",
          result: true,
        },
      ]}
      onConfirm={async () => {
        if (isBusy || !received) return;
        setError("");
        try {
          await onConfirm();
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Chưa xác nhận được. Vui lòng thử lại.",
          );
        }
      }}
    >
      {books.length > 0 && (
        <ul className={styles.books} aria-label="Sách trong kiện bạn nhận">
          {books.map((book) => (
            <li key={book.id}>
              <CheckCircle2 size={14} aria-hidden="true" />
              <span dir="auto" title={book.title}>
                {book.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={received}
          onChange={(event) => setReceived(event.target.checked)}
          disabled={isBusy}
        />
        <span>Tôi đã nhận được kiện sách.</span>
      </label>
    </ExchangeActionDialog>
  );
}
