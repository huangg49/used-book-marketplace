import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "@used-books/session-client";
import { dateText, money } from "../../core/format";
import { canReview, session } from "../../core/session";
import { ActionPanel } from "./action-panel";
import {
  exchangeDisputeResolution,
  exchangeDisputeResolutionsList,
  type ExchangeDisputeItem,
} from "./contracts";
import { Field } from "./field";
import { Forbidden, OperationsQueue } from "./queue-frame";
import { refetchWhileClosed, useQueuePanel, type ActionContext } from "./queue-panel";

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
      intro="Phán quyết các tranh chấp phát sinh trong quá trình trao đổi sách (hàng giao chậm trễ quá 240h theo POL-07, hàng hư hỏng hoặc không đúng cam kết). Quản trị viên và nhân viên vận hành đưa ra quyết định hoàn cọc (RefundBoth) hoặc công nhận hoàn tất (CompleteExchange)."
      order="Khiếu nại mới nhất trước."
      unit="khiếu nại"
      result={result}
      panel={panel}
      rows={(result.data ?? []).map((item) => ({
        id: item.id,
        status: "Chờ phân xử",
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
        action: {
          label: "Phân xử",
          render: (context) => <DisputeDecide item={item} {...context} />,
        },
      }))}
      empty={{
        title: "Chưa có khiếu nại nào.",
        body: "Tất cả các giao dịch trao đổi sách hiện đang diễn ra thuận lợi, không có sự cố tồn đọng.",
      }}
    />
  );
}

function DisputeDetail({ item }: { item: ExchangeDisputeItem }) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", fontSize: "0.875rem" }}>
      <div>
        <strong>Lý do khiếu nại / Báo cáo sự cố:</strong>
        <p style={{ margin: "0.25rem 0 0 0", whiteSpace: "pre-wrap", color: "#b91c1c", fontWeight: 500 }}>
          {item.disputeReason || "Không có lý do chi tiết"}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div style={{ background: "rgba(0,0,0,0.03)", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Người khởi tạo (Bên A)</div>
          <div>Gửi hàng: {item.initiatorShippedAt ? dateText(item.initiatorShippedAt) : "Chưa gửi"}</div>
          <div>Xác nhận đã nhận: {item.initiatorReceivedAt ? dateText(item.initiatorReceivedAt) : "Chưa nhận"}</div>
          <div>Cọc bảo chứng: {money(item.initiatorDeposit)}</div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.03)", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Đối tác (Bên B)</div>
          <div>Gửi hàng: {item.recipientShippedAt ? dateText(item.recipientShippedAt) : "Chưa gửi"}</div>
          <div>Xác nhận đã nhận: {item.recipientReceivedAt ? dateText(item.recipientReceivedAt) : "Chưa nhận"}</div>
          <div>Cọc bảo chứng: {money(item.recipientDeposit)}</div>
        </div>
      </div>
    </div>
  );
}

function DisputeDecide({
  item,
  ...context
}: { item: ExchangeDisputeItem } & ActionContext) {
  const [decision, setDecision] = useState<"RefundBoth" | "CompleteExchange">();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const id = `exchange-dispute-${item.id}`;

  return (
    <ActionPanel
      {...context}
      label="Phán quyết tranh chấp trao đổi sách"
      title="Đưa ra phán quyết giải quyết tranh chấp."
      intro="Phán quyết sẽ tự động hoàn tiền cọc hoặc tất toán số dư trên Ledger kế toán kép, cập nhật trạng thái sách và gửi thông báo trực tiếp đến hai bên."
      dirty={!!decision || reason !== ""}
      fields={(locked) => (
        <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 1rem 0" }}>
            <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Quyết định xử lý</legend>
            <label className="check" style={{ display: "block", marginBottom: "0.5rem", cursor: "pointer" }}>
              <input
                type="radio"
                name={`${id}-decision`}
                checked={decision === "RefundBoth"}
                onChange={() => {
                  setDecision("RefundBoth");
                  setProblem(undefined);
                }}
              />{" "}
              <strong>Hủy giao dịch & Hoàn tiền cọc (RefundBoth)</strong>
              <div style={{ fontSize: "0.8125rem", color: "#666", marginLeft: "1.5rem" }}>
                Hoàn tiền cọc và tiền bù chênh lệch cho cả 2 bên. Trả lại tất cả sách về trạng thái Có sẵn (Available).
              </div>
            </label>

            <label className="check" style={{ display: "block", cursor: "pointer" }}>
              <input
                type="radio"
                name={`${id}-decision`}
                checked={decision === "CompleteExchange"}
                onChange={() => {
                  setDecision("CompleteExchange");
                  setProblem(undefined);
                }}
              />{" "}
              <strong>Công nhận hoàn tất giao dịch (CompleteExchange)</strong>
              <div style={{ fontSize: "0.8125rem", color: "#666", marginLeft: "1.5rem" }}>
                Tất toán tiền cọc, chuyển khoản chênh lệch cho bên nhận và chuyển trạng thái sách sang Đã đổi (Exchanged).
              </div>
            </label>
          </fieldset>
          {problem === "decision" && (
            <p className="field-error" style={{ color: "#dc2626", marginTop: "-0.5rem", marginBottom: "1rem" }}>
              Vui lòng chọn quyết định xử lý.
            </p>
          )}

          <Field
            id={`${id}-reason`}
            label="Lý do phán quyết"
            hint="Bắt buộc, từ 5 đến 500 ký tự. Lưu vào nhật ký kiểm toán và gửi tới hai người dùng."
            error={
              problem === "reason"
                ? "Nhập lý do phán quyết từ 5 đến 500 ký tự."
                : undefined
            }
          >
            <textarea
              id={`${id}-reason`}
              rows={3}
              maxLength={500}
              value={reason}
              aria-invalid={problem === "reason"}
              placeholder="Ghi rõ căn cứ giải quyết tranh chấp (ví dụ: xác minh bưu tá làm mất hàng, hoặc sách đúng mô tả...)"
              onChange={(e) => {
                setReason(e.target.value);
                setProblem(undefined);
              }}
            />
          </Field>
        </fieldset>
      )}
      validate={() => {
        if (!decision) {
          setProblem("decision");
          return false;
        }
        const trimmed = reason.trim();
        if (trimmed.length < 5 || trimmed.length > 500) {
          setProblem("reason");
          document.getElementById(`${id}-reason`)?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Xác nhận phán quyết"
      confirmTitle="Xác nhận phán quyết tranh chấp?"
      confirmBody={
        <>
          <p>
            {decision === "RefundBoth"
              ? "Hủy giao dịch, hoàn lại toàn bộ tiền cọc và tiền bù chênh lệch cho hai bên. Sách sẽ được mở khóa lại."
              : "Công nhận hoàn tất trao đổi sách. Tiền cọc được giải ngân về ví và tiền bù chuyển cho người nhận."}{" "}
            Thao tác này là bất biến và không thể sửa lại sau khi ghi nhận.
          </p>
          <blockquote className="prose">{reason.trim()}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/exchanges/${item.id}/resolve`,
        body: {
          expectedVersion: item.revision,
          decision,
          reason: reason.trim(),
        },
      })}
      schema={exchangeDisputeResolution}
      interpret={(receipt) => ({
        tone: "success",
        text:
          receipt.status === "Cancelled"
            ? "Đã phán quyết hủy trao đổi và hoàn tiền bảo chứng cho cả hai bên."
            : "Đã phán quyết công nhận trao đổi thành công và tất toán.",
        close: true,
      })}
    />
  );
}
