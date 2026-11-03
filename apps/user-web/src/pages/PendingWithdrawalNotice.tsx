import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Clock3, ChevronRight } from "lucide-react";
import {
  withdrawalPageSchema,
  type Withdrawal,
} from "@used-books/session-client";
import { session } from "../lib/session";
import styles from "./WalletWithdrawals.module.css";

export function PendingWithdrawalNotice({ ownerId }: { ownerId: string }) {
  const [params, setParams] = useSearchParams();
  const pending = useQuery({
    queryKey: ["withdrawals", ownerId, "pending"],
    enabled: !!ownerId,
    queryFn: async () => {
      // Use the state filter, independently of the paginated history below.
      const ids = new Set<string>();
      let cursor: string | null = null;
      do {
        const page: { items: Withdrawal[]; nextCursor: string | null } =
          await session.request(
            `/me/withdrawals?state=Requested&limit=100${cursor ? `&cursor=${cursor}` : ""}`,
            withdrawalPageSchema,
          );
        for (const row of page.items) {
          if (row.state === "Requested") ids.add(row.id);
        }
        cursor = page.nextCursor;
      } while (cursor);
      return [...ids];
    },
    refetchInterval: () =>
      document.visibilityState === "visible" ? 15000 : false,
  });

  if (pending.isError)
    return (
      <div className={styles.pendingError} role="alert">
        <p>Chưa kiểm tra được yêu cầu rút tiền đang chờ.</p>
        <button
          type="button"
          className={styles.secondary}
          disabled={pending.isFetching}
          onClick={() => void pending.refetch()}
        >
          Thử lại
        </button>
      </div>
    );
  const ids = pending.data;
  if (!ids?.length) return null;
  return (
    <section
      className={styles.pendingNotice}
      aria-labelledby="pending-withdrawal-title"
    >
      <Clock3 size={24} aria-hidden="true" />
      <div className={styles.pendingText} role="status">
        <h2 id="pending-withdrawal-title">
          Bạn đang có {ids.length} đơn rút tiền chờ duyệt
        </h2>
        <p>
          Yêu cầu sẽ được xử lý trong vòng <strong>dưới 24 giờ</strong> kể từ
          khi gửi.
        </p>
      </div>
      <button
        type="button"
        className={styles.pendingLink}
        onClick={() => {
          const next = new URLSearchParams(params);
          next.set("withdrawal", ids[0]);
          setParams(next, { replace: true });
        }}
      >
        {ids.length === 1 ? "Xem chi tiết" : "Xem đơn mới nhất"}
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
