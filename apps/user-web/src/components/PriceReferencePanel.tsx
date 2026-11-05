import { useState } from "react";
import {
  currentReference,
  excludedLabel,
  sourceKindLabel,
  pricePoints,
  evidenceLabel,
  type PriceReferenceState,
} from "@used-books/session-client";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatVnd } from "../lib/routes";
import { useExpiryRefresh } from "../hooks/useExpiryRefresh";
import styles from "./PriceAssistPanel.module.css";
export function PriceReferencePanel({
  state,
  currentKey,
  disabled,
  onApply,
  aiReady,
}: {
  state: PriceReferenceState;
  currentKey: string;
  disabled: boolean;
  onApply: (amount: number) => void;
  aiReady: boolean;
}) {
  const [selected, setSelected] = useState<{
    amount: number;
    reference: NonNullable<PriceReferenceState>;
  } | null>(null);
  const refreshExpiry = useExpiryRefresh(state?.value.expiresAt);
  const value = currentReference(state, currentKey);
  if (!value) return state?.key === currentKey && !aiReady ? (
    <p role="status">
      Khoảng tham chiếu không còn hiệu lực. Bạn có thể yêu cầu gợi ý lại hoặc tự nhập giá.
    </p>
  ) : null;
  // A later response cannot reuse consent for the previous reference/amount.
  const selectedAmount = selected?.reference === state ? selected.amount : null;
  const canApply = () =>
    !disabled && currentReference(state, currentKey)?.status === "Ready";
  return (
    <details
      className={styles.answer}
      open={!aiReady}
      aria-label="Giá tham chiếu theo quy tắc"
    >
      <summary>Khoảng tham chiếu theo quy tắc</summary>
      <p>
        Tính từ nguồn giá và tình trạng bạn khai; không phải kết quả AI hoặc giá
        thị trường đã xác minh.
      </p>
      {value.range && value.status === "Ready" ? (
        <>
          <p className={styles.range}>
            {formatVnd(value.range.low)} – {formatVnd(value.range.high)}
          </p>
          <p>{evidenceLabel[value.evidenceLevel]}</p>
          <div className={styles.actions}>
            {pricePoints(value.range).map((amount) => (
              <button
                type="button"
                key={amount}
                disabled={disabled}
                onClick={() => {
                  if (canApply()) setSelected({ amount, reference: state! });
                  else refreshExpiry();
                }}
              >
                Chọn mức tham chiếu {formatVnd(amount)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p>
          {value.status === "Refused"
            ? "Chưa thể tính khoảng tham chiếu cho tình trạng này."
            : "Chưa đủ dữ liệu để tính khoảng tham chiếu."}{" "}
          Bạn vẫn có thể nhập giá.
        </p>
      )}
      {value.missing.map((text) => (
        <p key={text}>{text}</p>
      ))}
      <ul className={styles.sources}>
        {value.sources.map((source) => (
          <li key={source.ref}>
            {source.label} · {sourceKindLabel[source.kind]} ·{" "}
            {formatVnd(source.amount)} ·{" "}
            {new Date(source.observedAt).toLocaleDateString("vi-VN")}
            {source.excluded ? ` · ${excludedLabel[source.excluded]}` : ""}
            {!source.originGroup ? " · nguồn gốc chưa xác minh độc lập" : ""}
            {source.url ? (
              <>
                {" "}
                ·{" "}
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  Mở nguồn
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        isOpen={selectedAmount !== null}
        title="Dùng mức giá tham chiếu?"
        description={
          selectedAmount === null
            ? ""
            : `Dùng ${formatVnd(selectedAmount)} làm giá bán. Đây là mức tính theo quy tắc, không ghi nhận là bạn đã áp dụng gợi ý AI.`
        }
        confirmText="Dùng giá tham chiếu"
        onClose={() => setSelected(null)}
        onConfirm={() => {
          if (selectedAmount !== null && canApply()) onApply(selectedAmount);
          setSelected(null);
        }}
      />
    </details>
  );
}
