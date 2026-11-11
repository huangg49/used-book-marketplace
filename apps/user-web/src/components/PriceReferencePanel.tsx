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
  onExpired,
  prominent,
}: {
  state: PriceReferenceState;
  currentKey: string;
  disabled: boolean;
  onApply: (amount: number) => void;
  onExpired: () => void;
  prominent: boolean;
}) {
  const [selected, setSelected] = useState<{
    amount: number;
    reference: NonNullable<PriceReferenceState>;
  } | null>(null);
  const value = currentReference(state, currentKey);
  if (value?.status !== "Ready" || !value.range) return null;
  // A later response cannot reuse consent for the previous reference/amount.
  const selectedAmount = selected?.reference === state ? selected.amount : null;
  const canApply = () =>
    !disabled && currentReference(state, currentKey)?.status === "Ready";
  return (
    <details
      className={styles.disclosure}
      open={prominent || selectedAmount !== null}
      aria-label="Giá tham chiếu theo quy tắc"
    >
      <summary>Khoảng tham chiếu theo quy tắc</summary>
      <div className={styles.detailsBody}>
        <div className={styles.rangeHeader}>
          <p className={styles.range}>{formatVnd(value.range.low)} – {formatVnd(value.range.high)}</p>
          <p className={styles.evidence}>{evidenceLabel[value.evidenceLevel]}</p>
        </div>
        <p className={styles.note}>Tính từ nguồn giá và tình trạng bạn khai.</p>
        <div className={styles.actions}>
          {pricePoints(value.range).map((amount) => (
            <button
              type="button"
              key={amount}
              disabled={disabled}
              onClick={() => {
                if (canApply() && state) setSelected({ amount, reference: state });
                else onExpired();
              }}
            >
              Chọn mức tham chiếu {formatVnd(amount)}
            </button>
          ))}
        </div>
        {value.missing.map((text) => (
          <p key={text}>{text}</p>
        ))}
        {value.sources.length > 0 && <details className={styles.disclosure}>
          <summary>Nguồn giá</summary>
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
        </details>}
      </div>
      <ConfirmDialog
        isOpen={selectedAmount !== null}
        title="Dùng mức giá tham chiếu?"
        description={
          selectedAmount === null
            ? ""
            : `Dùng ${formatVnd(selectedAmount)} làm giá bán?`
        }
        confirmText="Dùng giá tham chiếu"
        onClose={() => setSelected(null)}
        onConfirm={() => {
          if (selectedAmount !== null) {
            if (canApply()) onApply(selectedAmount);
            else onExpired();
          }
          setSelected(null);
        }}
      />
    </details>
  );
}
