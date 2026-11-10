import { PriceReferencePanel } from './PriceReferencePanel';
import type { PriceReferenceState } from '@used-books/session-client';
import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import {
  currentReference,
  evidenceLabel,
  excludedLabel,
  isStale,
  pricePoints,
  sourceKindLabel,
  type AssistState,
} from "@used-books/session-client";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatVnd } from "../lib/routes";
import { useExpiryRefresh } from "../hooks/useExpiryRefresh";
import type { PricePhase } from "../services/listing-price-assist";
import styles from "./PriceAssistPanel.module.css";
const phases: Record<PricePhase, string> = {
  catalog: "Đang đối chiếu hoặc lưu đầu sách…",
  upload: "Đang chuẩn bị ảnh bản sách…",
  model: "Đang kiểm tra nguồn giá…",
};
export function PriceAssistPanel({
  state,
  currentKey,
  currentPrice,
  phase,
  disabled,
  hasPhoto,
  needsCatalog,
  reference, onApplyReference,
  onAsk,
  onEnterPrice,
  onApply,
}: {
  state: AssistState;
  currentKey: string;
  currentPrice: string;
  phase: PricePhase;
  disabled: boolean;
  hasPhoto: boolean;
  needsCatalog: boolean;
  reference?: PriceReferenceState;
  onApplyReference?: (amount: number) => void;
  onAsk: () => void;
  onEnterPrice: () => void;
  onApply: (amount: number) => void;
}) {
  const [replace, setReplace] = useState<number | null>(null);
  const stale = isStale(state, currentKey),
    loading = state.status === "loading";
  const ready =
    state.status === "ready"
      ? state
      : state.status === "loading"
        ? state.previous
        : undefined;
  const value = ready?.suggestion;
  const current = value && !loading && !stale;
  const currentRuleReference = currentReference(reference ?? null, currentKey);
  const duplicateReference = current && value.status !== "Suggested" &&
    currentRuleReference?.status === value.status;
  const refreshExpiry = useExpiryRefresh(value?.expiresAt);
  const locked = disabled || loading || stale;
  const canApply = () => {
    if (disabled || loading) return false;
    // Recheck at the action boundary too: timers can be delayed in background tabs.
    if (isStale(state, currentKey)) {
      refreshExpiry();
      return false;
    }
    return true;
  };
  const sourceLabels = new Map(value?.sources.map((source) => [source.ref, source.label]));
  const suggestedRange = value?.status === "Suggested" ? value.range : null;
  const lookupPending = !stale && value?.rules?.includes("R-LOOKUP-PENDING");
  const emptyTitle = value?.status === "Refused" ? "Chưa thể gợi ý giá cho tình trạng này"
    : lookupPending ? "Đang tìm nguồn giá"
    : value?.rules?.some((rule) => rule === "R-LOOKUP-UNAVAILABLE" || rule === "R-LOOKUP-DISABLED")
      ? "Tạm thời chưa tra được giá"
    : value?.rules?.includes("R-NEED-BOOK-IDENTITY") ? "Cần thêm thông tin để tìm đúng sách"
    : value?.rules?.includes("R-NEED-SOURCES") ? "Chưa có nguồn giá đã xác minh"
    : "Cần bổ sung thông tin";
  const buttonLabel = loading
    ? "Đang lấy gợi ý…"
    : lookupPending
      ? "Xem kết quả tra giá"
      : state.status === "idle"
        ? "Xem gợi ý giá bán"
        : "Kiểm tra lại nguồn giá";
  const announcement = loading
    ? phases[phase]
    : value && !stale
      ? suggestedRange ? "Đã có khoảng giá gợi ý" : emptyTitle
      : "";
  return (
    <section className={styles.panel} aria-labelledby="price-assist-title">
      <header className={styles.panelHead}>
        <div className={styles.panelHeading}>
          <div className={styles.titleRow}>
            <h3 id="price-assist-title"><Sparkles size={18} aria-hidden="true" /> Gợi ý giá bán</h3>
            <span className={styles.note}>Tùy chọn</span>
          </div>
          {!hasPhoto ? (
            <p className={styles.note}>Thêm ít nhất một ảnh bản sách ở bước Ảnh bản sách.</p>
          ) : state.status === "idle" ? (
            <p className={styles.note}>
              {needsCatalog
                ? "Hệ thống sẽ lưu thông tin sách và tra giá ngay, không cần chờ duyệt."
                : "Tham khảo nguồn giá để tự chọn mức bán."}
            </p>
          ) : null}
        </div>
        <button
          className={styles.primary}
          type="button"
          disabled={disabled || loading || !hasPhoto}
          onClick={onAsk}
          aria-busy={loading}
        >
          {loading && <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" />}
          {buttonLabel}
        </button>
      </header>
      <p role="status" className={loading ? styles.status : "sr-only"}>
        {announcement}
      </p>
      {stale && !loading && (
        <p role="status" className={styles.status}>
          Thông tin sách, ảnh, tình trạng hoặc hạn dùng gợi ý đã thay đổi. Hãy yêu cầu lại.
        </p>
      )}
      {state.status === "error" && <p role="alert" className={styles.status}>{state.message}</p>}
      {ready?.message && <p role="alert" className={styles.status}>{ready.message} Gợi ý trước vẫn được giữ.</p>}
      {value && suggestedRange ? (
        <div className={styles.answer}>
          <div className={styles.rangeHeader}>
            <p className={styles.range}>{formatVnd(suggestedRange.low)} – {formatVnd(suggestedRange.high)}</p>
            <p className={styles.evidence}>{evidenceLabel[value.evidenceLevel]}{value.cached ? " · Đã lưu" : ""}</p>
          </div>
          <div className={styles.actions}>
            {pricePoints(suggestedRange).map((amount) => (
              <button
                type="button"
                key={amount}
                disabled={locked}
                onClick={() => {
                  if (!canApply()) return;
                  if (currentPrice.trim() && Number(currentPrice) !== amount) setReplace(amount);
                  else onApply(amount);
                }}
              >
                Dùng {formatVnd(amount)}
              </button>
            ))}
          </div>
          <details className={styles.disclosure}>
            <summary>Vì sao có khoảng giá này?</summary>
            <div className={styles.detailsBody}>
              {value.factors.length > 0 && (
                <ul>
                  {value.factors.map((factor, index) => (
                    <li key={index}>
                      {factor.text}
                      {factor.sourceRefs.length
                        ? ` (${factor.sourceRefs.map((ref) => ref === "condition" ? "Tình trạng bạn khai" : (sourceLabels.get(ref) ?? ref)).join("; ")})`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
              {value.sources.length > 0 && (
                <ul className={styles.sources}>
                  {value.sources.map((source) => (
                    <li key={source.ref}>
                      <strong>{source.label}</strong> · {sourceKindLabel[source.kind]} · {formatVnd(source.amount)}
                      <br />
                      Ghi nhận {new Date(source.observedAt).toLocaleDateString("vi-VN")}
                      {source.excluded ? ` · ${excludedLabel[source.excluded]}` : ""}
                      {source.url && <> · <a href={source.url} target="_blank" rel="noopener noreferrer">Mở nguồn</a></>}
                    </li>
                  ))}
                </ul>
              )}
              <p className={styles.note}>
                Tạo {new Date(value.generatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                {" · "}Hết hạn {new Date(value.expiresAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          </details>
        </div>
      ) : value && !stale && !loading ? (
        <div className={styles.status}>
          <p className={styles.statusTitle}>{emptyTitle}</p>
          {value.missing.map((text) => <p key={text}>{text}</p>)}
          <button type="button" className={styles.quietAction} disabled={disabled} onClick={onEnterPrice}>
            Nhập giá bán
          </button>
        </div>
      ) : null}
      {!duplicateReference && (
        <PriceReferencePanel
          state={reference ?? null}
          currentKey={currentKey}
          disabled={disabled || !hasPhoto}
          onApply={(amount) => onApplyReference?.(amount)}
          aiReady={!!current}
        />
      )}
      <ConfirmDialog
        isOpen={replace !== null}
        onClose={() => setReplace(null)}
        title="Thay giá đang nhập?"
        description={
          replace !== null
            ? `Dùng mức ${formatVnd(replace)} thay cho giá bạn đã nhập?`
            : ""
        }
        confirmText="Dùng giá gợi ý"
        onConfirm={() => {
          if (replace !== null && canApply()) onApply(replace);
          setReplace(null);
        }}
      />
    </section>
  );
}
