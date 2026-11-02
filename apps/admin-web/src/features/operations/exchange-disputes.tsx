import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { Notice } from "../../core/ui";
import {
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel } from "./queue-panel";
import styles from "./exchange-disputes.module.css";

export function ExchangeDisputesPage() {
  const user = useOutletContext<CurrentUser>();
  if (!canReview(user)) return <Forbidden />;
  return <ExchangeDisputesContent />;
}

function ExchangeDisputesContent() {
  const panel = useQueuePanel();
  const result = useQuery({
    queryKey: ["operations", "exchange-disputes"],
    queryFn: () =>
      session.request("/operations/exchanges/resolutions", exchangeDisputeResolutionsList),
    refetchInterval: refetchWhileClosed(panel),
  });

  return (
    <OperationsQueue
      number="08"
      title="Khiếu nại trao đổi sách."
      intro="Xem giao dịch đang cần xử lý và tình trạng gửi, nhận của hai bên. Danh sách không bao gồm giao dịch của chính bạn."
      order="Khiếu nại mới nhất trước."
      unit="khiếu nại"
      result={result}
      panel={panel}
      rows={(result.data ?? []).map((item) => ({
        id: item.id,
        status: "Chờ xử lý · Giữ tiền và sách",
        meta: [
          item.disputedBy === "System"
            ? "Hệ thống tự động (POL-07)"
            : "Thành viên khiếu nại",
          item.disputedAt ? `Mở ${dateText(item.disputedAt)}` : "Mới mở",
          `Cọc: ${money(item.initiatorDeposit)} / ${money(item.recipientDeposit)}`,
          item.diffAmount > 0
            ? `Bù chênh lệch: ${money(item.diffAmount)}`
            : "Không bù tiền",
        ],
        title: `Giao dịch trao đổi: #${item.id.slice(0, 8)}`,
        detail: <DisputeDetail item={item} />,
      }))}
      empty={{
        title: "Chưa có khiếu nại nào.",
        body: "Chưa có giao dịch chờ xử lý trong danh sách bạn được xem. Điều này không xác nhận mọi giao dịch đều đã hoàn tất.",
      }}
      extra={() => (
        <Notice tone="warning">
          Chưa thể thực thi phán quyết hoàn tiền hoặc hoàn tất trao đổi. Tiền và
          sách tiếp tục được giữ. Nhóm vận hành cần hoàn tất việc xác minh nơi giữ
          sách, phân bổ tiền và quy trình kháng nghị trước khi mở quyền phân xử.
        </Notice>
      )}
    />
  );
}

function DisputeDetail({ item }: { item: ExchangeDisputeItem }) {
  return (
    <div className={styles.details}>
      <div>
        <strong>Lý do cần xử lý:</strong>
        <p className={styles.reason}>
          {item.disputeReason || "Không có lý do chi tiết"}
        </p>
      </div>

      <div className={styles.parties}>
        <div className={styles.party}>
          <strong>Người khởi tạo (Bên A)</strong>
          <div>Gửi hàng: {item.initiatorShippedAt ? dateText(item.initiatorShippedAt) : "Chưa gửi"}</div>
          <div>Xác nhận đã nhận: {item.initiatorReceivedAt ? dateText(item.initiatorReceivedAt) : "Chưa nhận"}</div>
          <div>Cọc bảo chứng: {money(item.initiatorDeposit)}</div>
        </div>

        <div className={styles.party}>
          <strong>Đối tác (Bên B)</strong>
          <div>Gửi hàng: {item.recipientShippedAt ? dateText(item.recipientShippedAt) : "Chưa gửi"}</div>
          <div>Xác nhận đã nhận: {item.recipientReceivedAt ? dateText(item.recipientReceivedAt) : "Chưa nhận"}</div>
          <div>Cọc bảo chứng: {money(item.recipientDeposit)}</div>
        </div>
      </div>
    </div>
  );
}
