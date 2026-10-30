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
  const [selected, setSelected] = useState<number | null>(null);
  const value = currentReference(state, currentKey);
  if (!value) return null;
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
                  if (canApply()) setSelected(amount);
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
        isOpen={selected !== null}
        title="Dùng mức giá tham chiếu?"
        description={
          selected === null
            ? ""
            : `Dùng ${formatVnd(selected)} làm giá bán. Đây là mức tính theo quy tắc, không ghi nhận là bạn đã áp dụng gợi ý AI.`
        }
        confirmText="Dùng giá tham chiếu"
        onClose={() => setSelected(null)}
        onConfirm={() => {
          if (selected !== null && canApply()) onApply(selected);
          setSelected(null);
        }}
      />
    </details>
  );
}
