import { useState } from "react";
import { View } from "react-native";
import {
  AppText,
  Button,
  Chip,
  ConfirmDialog,
  Notice,
  colors,
  formatVnd,
  space,
} from "../../core/ui";
import { price, type Form } from "./listing-form";
import {
  evidenceLabel,
  excludedLabel,
  isStale,
  pricePoints,
  sourceKindLabel,
  type AssistState,
} from "./price-assist";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Advisory only: the seller's own price field stays the source of truth and is
// changed only by an explicit pick (with confirmation when it holds a value).
export function PriceSuggestionPanel({
  form,
  state,
  currentKey,
  disabled,
  onAsk,
  onApply,
}: {
  form: Form;
  state: AssistState;
  currentKey: string;
  disabled: boolean;
  onAsk: () => void;
  onApply: (amount: number) => void;
}) {
  const [confirm, setConfirm] = useState<number | null>(null);
  const stale = isStale(state, currentKey);
  const loading = state.status === "loading" && !stale;
  const current = price(form.salePrice);
  const pick = (amount: number) =>
    current !== null && Number.isFinite(current) && current !== amount
      ? setConfirm(amount)
      : onApply(amount);
  const ready = state.status === "ready" && !stale ? state.suggestion : null;
  const labels = new Map(ready?.sources.map((s) => [s.ref, s.label]));
  return (
    <View
      style={{
        gap: space.md,
        paddingTop: space.lg,
        borderTopWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <AppText kind="label" color={colors.rustText}>
        GỢI Ý GIÁ BÁN
      </AppText>
      <AppText kind="small">
        Tham khảo từ các nguồn giá có ghi rõ ngày và nơi lấy. Đây không phải giá
        đã xác minh; bạn quyết định giá cuối cùng.
      </AppText>
      {!form.bookId ? (
        <AppText kind="small">
          Chọn đầu sách ở bước đầu tiên để xem gợi ý.
        </AppText>
      ) : null}
      {stale ? (
        <Notice tone="warning">
          Đầu sách hoặc tình trạng vừa thay đổi nên gợi ý trước không còn áp
          dụng.
        </Notice>
      ) : null}
      {(state.status === "error" || state.status === "ready") &&
      state.message &&
      !stale ? (
        <Notice tone="warning">{state.message}</Notice>
      ) : null}
      <Button
        secondary
        title={
          ready || stale || state.status === "error"
            ? "Xem lại gợi ý giá"
            : "Xem gợi ý giá"
        }
        busy={loading}
        disabled={disabled || !form.bookId || loading}
        onPress={onAsk}
      />
      {ready && ready.status !== "Suggested" ? (
        <Notice tone="info">
          {ready.status === "Refused"
            ? "Trợ lý không ước lượng giá cho bản sách này."
            : "Chưa đủ thông tin để gợi ý giá."}{" "}
          {ready.missing.join(" ")} Bạn vẫn có thể tự nhập giá bán.
        </Notice>
      ) : null}
      {ready?.range ? (
        <View style={{ gap: space.md }}>
          <AppText kind="price" color={colors.forest}>
            {formatVnd(ready.range.low)} – {formatVnd(ready.range.high)}
          </AppText>
          <AppText kind="small">{evidenceLabel[ready.evidenceLevel]}</AppText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {pricePoints(ready.range).map((amount) => (
              <Chip
                key={amount}
                title={`Dùng ${formatVnd(amount)}`}
                selected={current === amount}
                onPress={() => (disabled ? undefined : pick(amount))}
              />
            ))}
          </View>
          {ready.factors.map((f, i) => (
            <AppText key={i} kind="small">
              • {f.text}
              {f.sourceRefs.length
                ? ` (${f.sourceRefs
                    .map((r) =>
                      r === "condition" ? "tình trạng" : (labels.get(r) ?? r),
                    )
                    .join(", ")})`
                : ""}
            </AppText>
          ))}
          {ready.missing.length ? (
            <AppText kind="small">Còn thiếu: {ready.missing.join(" ")}</AppText>
          ) : null}
        </View>
      ) : null}
      {ready && ready.sources.length ? (
        <View style={{ gap: space.xs }}>
          <AppText kind="label">NGUỒN GIÁ</AppText>
          {ready.sources.map((s) => (
            <AppText
              key={s.ref}
              kind="small"
              color={s.excluded ? colors.muted : undefined}
            >
              {s.label} · {sourceKindLabel[s.kind]} · {formatVnd(s.amount)} ·{" "}
              {day(s.observedAt)}
              {s.excluded ? ` · ${excludedLabel[s.excluded]}` : ""}
            </AppText>
          ))}
          {ready.dataAsOf ? (
            <AppText kind="small">
              Dữ liệu mới nhất: {day(ready.dataAsOf)}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <ConfirmDialog
        visible={confirm !== null}
        title="Thay giá đang nhập?"
        message={`Giá bán ${formatVnd(current ?? 0)} sẽ được thay bằng ${formatVnd(confirm ?? 0)}. Bạn vẫn có thể sửa lại trước khi lưu.`}
        confirmLabel="Thay giá"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm !== null) onApply(confirm);
          setConfirm(null);
        }}
      />
    </View>
  );
}
