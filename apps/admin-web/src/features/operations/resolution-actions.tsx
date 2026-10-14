import { useRef, useState } from "react";
import { money } from "../../core/format";
import { ActionPanel } from "./action-panel";
import {
  decisionsFor,
  type Decision,
  type Fault,
  type ResolutionItem,
} from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-04: one independent Admin decision on a point Order waiting for review.
// Only combinations the API accepts for this case are offered.

const decisionText: Record<Decision, { label: string; effect: string }> = {
  RefundBuyer: {
    label: "Hủy đơn và hoàn tiền cho người mua",
    effect:
      "Đơn bị hủy, người mua được hoàn toàn bộ số tiền đã trả và sách được trả về người bán.",
  },
  ResumeCollection: {
    label: "Mở lại thời hạn đến lấy sách",
    effect: "Người mua có thêm 72 giờ để đến điểm nhận sách.",
  },
  DismissClaim: {
    label: "Bác khiếu nại",
    effect:
      "Giao dịch tiếp tục; người mua giữ sách và thời hạn kiểm tra tiếp tục chạy.",
  },
  RequireReturn: {
    label: "Yêu cầu người mua trả sách về điểm",
    effect:
      "Người mua phải mang sách trả về điểm; nhân viên đối chiếu rồi mới hoàn tiền.",
  },
};
const faultText: Record<NonNullable<Fault>, string> = {
  BookMisdescribed: "Sách khác mô tả: lỗi người bán, bài đăng phải sửa lại",
  BuyerDefault: "Người mua không thực hiện: ghi nhận vi phạm cho người mua",
  NoFault: "Không bên nào có lỗi",
};

type Props = { item: ResolutionItem } & ActionContext;

export function ResolutionDecision({ item, ...context }: Props) {
  const allowed = decisionsFor(item.openReason);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [fault, setFault] = useState<NonNullable<Fault> | null>(null);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<
    "decision" | "fault" | "reason" | null
  >(null);
  const firstDecision = useRef<HTMLInputElement>(null);
  const firstFault = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const faults = decision
    ? (allowed[decision] ?? []).filter((f): f is NonNullable<Fault> => !!f)
    : [];
  const trimmed = reason.trim();
  return (
    <ActionPanel
      {...context}
      label="Quyết định cho đơn tại điểm"
      title="Một quyết định, có lý do."
      intro={`Người mua đã trả ${money(item.buyerTotal)}. Quyết định được lưu lại cùng lý do và không sửa được; người mua và người bán đọc được lý do.`}
      dirty={decision !== null || reason !== ""}
      fields={(locked) => (
        <>
          <fieldset disabled={locked}>
            <legend>Quyết định</legend>
            {(Object.keys(allowed) as Decision[]).map((value, index) => (
              <label className="check" key={value}>
                <input
                  ref={index === 0 ? firstDecision : undefined}
                  type="radio"
                  name={`decision-${item.id}`}
                  checked={decision === value}
                  onChange={() => {
                    setDecision(value);
                    setFault(null);
                    setProblem(null);
                  }}
                />
                <span>
                  {decisionText[value].label}
                  <small className="muted"> — {decisionText[value].effect}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {problem === "decision" && (
            <p className="field-error">Chọn một quyết định.</p>
          )}
          {faults.length > 0 && (
            <fieldset disabled={locked}>
              <legend>Lỗi thuộc về</legend>
              {faults.map((value, index) => (
                <label className="check" key={value}>
                  <input
                    ref={index === 0 ? firstFault : undefined}
                    type="radio"
                    name={`fault-${item.id}`}
                    checked={fault === value}
                    onChange={() => {
                      setFault(value);
                      setProblem(null);
                    }}
                  />
                  {faultText[value]}
                </label>
              ))}
            </fieldset>
          )}
          {problem === "fault" && (
            <p className="field-error">Hoàn tiền phải ghi rõ lỗi thuộc về ai.</p>
          )}
          <div className="field">
            <label htmlFor={`reason-${item.id}`}>Lý do quyết định</label>
            <textarea
              id={`reason-${item.id}`}
              ref={reasonInput}
              rows={4}
              maxLength={1000}
              value={reason}
              disabled={locked}
              aria-invalid={problem === "reason"}
              aria-describedby={`reason-hint-${item.id}`}
              onChange={(event) => {
                setReason(event.target.value);
                setProblem(null);
              }}
            />
          </div>
          <p
            id={`reason-hint-${item.id}`}
            className={problem === "reason" ? "field-error" : "muted"}
          >
            {problem === "reason"
              ? "Nhập lý do từ 10 đến 1.000 ký tự."
              : "Bắt buộc, 10–1.000 ký tự. Ghi căn cứ đã đối chiếu."}
          </p>
        </>
      )}
      validate={() => {
        if (!decision) {
          setProblem("decision");
          firstDecision.current?.focus();
          return false;
        }
        if (faults.length > 0 && !fault) {
          setProblem("fault");
          firstFault.current?.focus();
          return false;
        }
        const n = [...trimmed].length;
        if (n < 10 || n > 1000) {
          setProblem("reason");
          reasonInput.current?.focus();
          return false;
        }
        return true;
      }}
      submitLabel="Ghi quyết định"
      confirmTitle={decision ? `${decisionText[decision].label}?` : "Ghi quyết định?"}
      confirmBody={
        <>
          <p>{decision && decisionText[decision].effect}</p>
          {fault && <p>Lỗi: {faultText[fault]}.</p>}
          <blockquote className="prose">{trimmed}</blockquote>
        </>
      }
      build={() => ({
        path: `/operations/point-orders/${item.id}/resolve`,
        body: {
          expectedVersion: item.version,
          decision,
          fault: faults.length > 0 ? fault : null,
          reason: trimmed,
        },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã ghi quyết định cho “${item.title}”: ${decision ? decisionText[decision].label.toLowerCase() : ""}.`,
        close: true,
      })}
    />
  );
}
