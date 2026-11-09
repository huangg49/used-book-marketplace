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

type Decision = "Resume" | "Cancel";

// ADR 0080: a held auction is resumed once or cancelled, with a reason. Resume
// keeps every stored time, so the paused time is not given back; the server
// refuses it while the seller or the leader is still ineligible, after the
// 48-hour hold ceiling, or for an auction already resumed once.
export function AuctionHoldDecision({ item, ...context }: Props) {
  const resumable = !item.resumedAt;
  const [decision, setDecision] = useState<Decision | null>(resumable ? null : "Cancel");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<"decision" | "reason" | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const trimmed = reason.trim();
  const ended = Date.parse(item.endAt) <= Date.now();
  const resume = decision === "Resume";
  return (
    <ActionPanel
      {...context}
      label="Xử lý phiên tạm giữ"
      title="Tiếp tục hoặc hủy phiên tạm giữ."
      intro={
        <>
          Phiên tạm giữ vì người bán hoặc người dẫn giá không còn đủ điều kiện.
          {item.holdExpiresAt ? ` Nếu chưa xử lý trước ${new Date(item.holdExpiresAt).toLocaleString("vi-VN")}, phiên tự hủy và hoàn mọi khoản giữ.` : ""}
          {resumable
            ? " Chỉ tiếp tục được một lần, khi người bán và người dẫn giá đã đủ điều kiện lại."
            : " Phiên đã được tiếp tục một lần, nên lần này chỉ có thể hủy."}
        </>
      }
      dirty={reason !== "" || (resumable && decision !== null)}
      fields={(locked) => (
        <>
          <fieldset disabled={locked}>
            <legend>Quyết định</legend>
            <label className="check">
              <input
                ref={first}
                type="radio"
                name={`hold-${item.id}`}
                checked={resume}
                disabled={!resumable}
                onChange={() => {
                  setDecision("Resume");
                  setProblem(null);
                }}
              />
              Tiếp tục phiên: giữ nguyên lượt trả giá, tiền cọc và giờ kết thúc
            </label>
            <label className="check">
              <input
                type="radio"
                name={`hold-${item.id}`}
                checked={decision === "Cancel"}
                onChange={() => {
                  setDecision("Cancel");
                  setProblem(null);
                }}
              />
              Hủy phiên: không ai thắng, hoàn mọi khoản giữ và tiền cọc
            </label>
          </fieldset>
          {problem === "decision" && <p className="field-error">Chọn tiếp tục hoặc hủy phiên.</p>}
          {resume && (
            <p className="muted">
              {ended
                ? "Giờ kết thúc đã qua: phiên không nhận thêm giá và được chốt ngay cho người dẫn giá."
                : `Thời gian tạm giữ không được cộng lại; phiên vẫn kết thúc ${new Date(item.endAt).toLocaleString("vi-VN")}.`}
            </p>
          )}
          <div className="field">
            <label htmlFor={`hold-reason-${item.id}`}>Lý do</label>
            <textarea
              id={`hold-reason-${item.id}`}
              ref={input}
              rows={4}
              maxLength={1000}
              value={reason}
              disabled={locked}
              aria-invalid={problem === "reason"}
              aria-describedby={`hold-hint-${item.id}`}
              onChange={(event) => {
                setReason(event.target.value);
                if (problem === "reason") setProblem(null);
              }}
            />
          </div>
          <p id={`hold-hint-${item.id}`} className={problem === "reason" ? "field-error" : "muted"}>
            {problem === "reason"
              ? "Nhập lý do từ 10 đến 1.000 ký tự."
              : resume
                ? "Bắt buộc, 10–1.000 ký tự. Được ghi vào nhật ký quản trị và gửi kèm thông báo cho người bán, người trả giá và người đăng ký; không ghi thông tin cá nhân."
                : "Bắt buộc, 10–1.000 ký tự. Được ghi vào nhật ký quản trị."}
          </p>
        </>
      )}
      validate={() => {
        if (!decision) {
          setProblem("decision");
          first.current?.focus();
          return false;
        }
        const n = [...trimmed].length;
        if (n >= 10 && n <= 1000) return true;
        setProblem("reason");
        input.current?.focus();
        return false;
      }}
      submitLabel={resume ? "Tiếp tục phiên" : "Hủy phiên"}
      confirmTitle={resume ? "Tiếp tục phiên đấu giá?" : "Hủy phiên đấu giá?"}
      confirmBody={
        <>
          <p>
            {resume
              ? `Phiên “${item.title}” trở lại như trước khi tạm giữ. Người bán, người trả giá và người đăng ký được báo kèm lý do dưới đây. Phiên không được tiếp tục lần thứ hai.`
              : `Phiên “${item.title}” sẽ kết thúc ngay, không có người thắng. Không hoàn tác được.`}
          </p>
          <blockquote className="prose">{trimmed}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/auctions/${item.id}/${resume ? "resume" : "cancel"}`,
        body: { expectedVersion: item.version, reason: trimmed },
      })}
      interpret={(receipt) =>
        receipt.state === "Active"
          ? { tone: "success", text: `Đã tiếp tục phiên “${item.title}”.`, close: true }
          : { tone: "success", text: `Đã hủy phiên “${item.title}”. Người bán được báo đến nhận lại sách.`, close: true }
      }
    />
  );
}
