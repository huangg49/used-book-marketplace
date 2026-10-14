import { useRef, useState } from "react";
import { ActionPanel } from "./action-panel";
import type { OperationsAuction } from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-05: an independent Admin cancels an open or held auction on an incident
// or suspected fraud. The system never picks a winner from the bids.

type Props = { item: OperationsAuction } & ActionContext;

export function AuctionCancel({ item, ...context }: Props) {
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const trimmed = reason.trim();
  return (
    <ActionPanel
      {...context}
      label="Hủy phiên đấu giá"
      title="Hủy phiên vì sự cố."
      intro={`Chỉ hủy khi có sự cố hoặc nghi ngờ gian lận. ${item.bidderCount > 0 ? `${item.bidderCount} người đã trả giá sẽ được báo phiên bị hủy; ` : ""}không ai được chọn làm người thắng và người bán được báo đến nhận lại sách.`}
      dirty={reason !== ""}
      fields={(locked) => (
        <>
          <div className="field">
            <label htmlFor={`cancel-${item.id}`}>Lý do hủy</label>
            <textarea
              id={`cancel-${item.id}`}
              ref={input}
              rows={4}
              maxLength={1000}
              value={reason}
              disabled={locked}
              aria-invalid={invalid}
              aria-describedby={`cancel-hint-${item.id}`}
              onChange={(event) => {
                setReason(event.target.value);
                setInvalid(false);
              }}
            />
          </div>
          <p
            id={`cancel-hint-${item.id}`}
            className={invalid ? "field-error" : "muted"}
          >
            {invalid
              ? "Nhập lý do từ 10 đến 1.000 ký tự."
              : "Bắt buộc, 10–1.000 ký tự. Người bán và người trả giá đọc được lý do này."}
          </p>
        </>
      )}
      validate={() => {
        const n = [...trimmed].length;
        if (n >= 10 && n <= 1000) return true;
        setInvalid(true);
        input.current?.focus();
        return false;
      }}
      submitLabel="Hủy phiên"
      confirmTitle="Hủy phiên đấu giá?"
      confirmBody={
        <>
          <p>
            Phiên “{item.title}” sẽ kết thúc ngay, không có người thắng. Không
            hoàn tác được.
          </p>
          <blockquote className="prose">{trimmed}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/auctions/${item.id}/cancel`,
        body: { expectedVersion: item.version, reason: trimmed },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã hủy phiên “${item.title}”. Người bán được báo đến nhận lại sách.`,
        close: true,
      })}
    />
  );
}
