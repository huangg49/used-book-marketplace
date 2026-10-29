import { useState } from "react";
import {
  evidenceLabel,
  excludedLabel,
  isStale,
  pricePoints,
  sourceKindLabel,
  type AssistState,
} from "@used-books/session-client";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatVnd } from "../lib/routes";
import type { PricePhase } from "../services/listing-price-assist";
import styles from "./PriceAssistPanel.module.css";
const phases: Record<PricePhase, string> = {
  catalog: "Đang xác nhận đầu sách…",
  upload: "Đang tải và xử lý ảnh bản sách…",
  model: "Đang kiểm tra nguồn và tạo gợi ý giá…",
};
export function PriceAssistPanel({
  state,
  currentKey,
  currentPrice,
  phase,
  disabled,
  hasPhoto,
  needsCatalog,
  onAsk,
  onApply,
}: {
  state: AssistState;
  currentKey: string;
  currentPrice: string;
  phase: PricePhase;
  disabled: boolean;
  hasPhoto: boolean;
  needsCatalog: boolean;
  onAsk: () => void;
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
  const locked = disabled || loading || stale;
  const sourceLabels = new Map(value?.sources.map((s) => [s.ref, s.label]));
  return (
    <section className={styles.panel} aria-labelledby="price-assist-title">
      <h3 id="price-assist-title">Gợi ý giá bán</h3>
      <p>
        Tham khảo giá có nguồn và thời điểm rõ ràng. Bạn quyết định giá cuối;
        gợi ý không tự gửi bài đăng.
      </p>
      {needsCatalog ? (
        <p className={styles.note}>
          Đầu sách mới: bấm yêu cầu sẽ lưu thông tin bạn đã xác nhận thành yêu
          cầu danh mục chờ duyệt. Chưa có nguồn giá phù hợp thì trợ lý sẽ báo
          thiếu dữ liệu.
        </p>
      ) : null}
      {!hasPhoto ? (
        <p>
          Thêm ít nhất một ảnh bản sách ở bước Ảnh bản sách trước khi yêu cầu.
        </p>
      ) : null}
      <button
        className={styles.primary}
        type="button"
        disabled={disabled || loading || !hasPhoto}
        onClick={onAsk}
        aria-busy={loading}
      >
        {loading
          ? "Đang lấy gợi ý…"
          : needsCatalog
            ? "Xác nhận đầu sách và xem gợi ý giá"
            : state.status === "idle"
              ? "Xem gợi ý giá bán"
              : "Xem lại gợi ý giá"}
      </button>
      <p role="status" aria-live="polite">
        {loading ? phases[phase] : ""}
      </p>
      {stale ? (
        <p role="status">
          Thông tin sách, ảnh, tình trạng hoặc hạn dùng gợi ý đã thay đổi. Gợi ý
          cũ không được áp dụng; hãy yêu cầu lại.
        </p>
      ) : null}
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      {ready?.message ? (
        <p role="alert">{ready.message} Gợi ý trước vẫn được giữ.</p>
      ) : null}
      {value ? (
        <div className={styles.answer}>
          <p className={styles.evidence}>
            {evidenceLabel[value.evidenceLevel]}
            {value.cached ? " · Kết quả đã lưu" : ""}
          </p>
          {value.status === "Suggested" && value.range ? (
            <>
              <p className={styles.range}>
                {formatVnd(value.range.low)} – {formatVnd(value.range.high)}
              </p>
              <div className={styles.actions}>
                {pricePoints(value.range).map((amount) => (
                  <button
                    type="button"
                    key={amount}
                    disabled={locked}
                    onClick={() => {
                      if (
                        currentPrice.trim() &&
                        Number(currentPrice) !== amount
                      )
                        setReplace(amount);
                      else onApply(amount);
                    }}
                  >
                    Dùng {formatVnd(amount)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>
              {value.status === "Refused"
                ? "Chưa thể gợi ý giá cho tình trạng này."
                : "Chưa đủ dữ liệu để gợi ý giá."}{" "}
              Bạn vẫn có thể tự nhập giá.
            </p>
          )}
          <ul>
            {value.factors.map((f, i) => (
              <li key={i}>
                {f.text}
                {f.sourceRefs.length
                  ? ` (${f.sourceRefs.map((ref) => (ref === "condition" ? "Tình trạng bạn khai" : (sourceLabels.get(ref) ?? ref))).join("; ")})`
                  : ""}
              </li>
            ))}
          </ul>
          {value.missing.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {value.sources.length ? (
            <details>
              <summary>
                Nguồn giá và nguồn bị loại ({value.sources.length})
              </summary>
              <ul className={styles.sources}>
                {value.sources.map((source) => (
                  <li key={source.ref}>
                    <strong>{source.label}</strong> ·{" "}
                    {sourceKindLabel[source.kind]} · {formatVnd(source.amount)}
                    <br />
                    Ghi nhận{" "}
                    {new Date(source.observedAt).toLocaleDateString("vi-VN")}
                    {source.excluded
                      ? ` · ${excludedLabel[source.excluded]}`
                      : ""}
                    {source.url ? (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Mở nguồn
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className={styles.note}>
            Gợi ý tạo {new Date(value.generatedAt).toLocaleString("vi-VN")}; hết
            hiệu lực {new Date(value.expiresAt).toLocaleString("vi-VN")}.
          </p>
        </div>
      ) : null}
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
          if (replace !== null && !locked) onApply(replace);
          setReplace(null);
        }}
      />
    </section>
  );
}
