import { PriceReferencePanel } from "./price-reference-panel";
import type { PriceReference, PriceReferenceState } from "@used-books/session-client";
import { useState } from "react";
import { Linking, View, StyleSheet, Pressable } from "react-native";
import {
  AppText,
  Button,
  Chip,
  ConfirmDialog,
  Notice,
  colors,
  formatVnd,
  space,
  stitchTokens,
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

export function PriceSuggestionPanel({
  form,
  state,
  currentKey,
  disabled,
  hasPhoto,
  reference,
  lookupResult,
  lookupWatching = false,
  lookupInterrupted = false,
  onApplyReference,
  onAsk,
  onApply,
}: {
  form: Form;
  state: AssistState;
  currentKey: string;
  disabled: boolean;
  hasPhoto: boolean;
  reference?: PriceReferenceState;
  lookupResult?: PriceReference | null;
  lookupWatching?: boolean;
  lookupInterrupted?: boolean;
  onApplyReference?: (amount: number) => void;
  onAsk: () => void;
  onApply: (amount: number) => void;
}) {
  const [confirm, setConfirm] = useState<number | null>(null);
  const [showFactors, setShowFactors] = useState(false);
  const stale = isStale(state, currentKey);
  const loading = state.status === "loading" && !stale;
  const current = price(form.salePrice);

  const pick = (amount: number) =>
    current !== null && Number.isFinite(current) && current !== amount
      ? setConfirm(amount)
      : onApply(amount);

  const ready = state.status === "ready" && !stale ? state.suggestion : null;
  const labels = new Map(ready?.sources.map((s) => [s.ref, s.label]));

  const referenceReady = reference?.key === currentKey && reference.value.status === "Ready";

  const hasLookupPendingRule = Boolean(ready?.rules.includes("R-LOOKUP-PENDING"));
  const lookupPending =
    !lookupResult &&
    !loading &&
    !stale &&
    !referenceReady &&
    hasLookupPendingRule;

  const lookupReady = Boolean(hasLookupPendingRule && lookupResult?.status === "Ready");
  const isRunning = lookupResult ? lookupResult.lookupStatus === "Running" : true;
  const lookupWaiting = Boolean(lookupPending && lookupWatching && isRunning);

  const buttonLabel = loading
    ? "Đang lấy gợi ý…"
    : lookupWaiting
      ? "Đang tra giá…"
      : lookupReady
        ? "Xem kết quả tra giá"
        : lookupPending
          ? "Kiểm tra lại nguồn giá"
          : state.status === "error" && referenceReady
            ? "Thử lại gợi ý AI"
            : lookupResult?.status === "Ready" && referenceReady
              ? "Xem gợi ý AI"
              : ready || stale || state.status === "error"
                ? "Xem lại gợi ý giá"
                : "Xem gợi ý giá bán";

  const statusTitle =
    lookupPending && lookupInterrupted
      ? "Chưa cập nhật được kết quả tra giá"
      : lookupPending
        ? "Đang tìm nguồn giá từ các sàn…"
        : ready?.status === "Refused"
          ? "Chưa thể gợi ý giá cho tình trạng này"
          : ready?.rules.some((r) => r === "R-LOOKUP-UNAVAILABLE" || r === "R-LOOKUP-DISABLED")
            ? "Tạm thời chưa tra được giá"
            : ready?.rules.includes("R-NEED-BOOK-IDENTITY")
              ? "Cần thêm thông tin để tìm đúng sách"
              : ready?.rules.includes("R-NEED-SOURCES")
                ? "Chưa tìm được nguồn giá phù hợp"
                : null;

  return (
    <View style={styles.container}>
      <View style={{ gap: 2 }}>
        <AppText kind="label" color={stitchTokens.wineDark} style={{ fontSize: 13 }}>
          GỢI Ý GIÁ BÁN
        </AppText>
        <AppText kind="small" color={stitchTokens.deepCocoa}>
          Tham khảo từ các nguồn giá thị trường. Bạn quyết định giá bán cuối cùng.
        </AppText>
      </View>

      {!form.bookId ? (
        <AppText kind="small" color={stitchTokens.subtleGray}>
          Chọn đầu sách ở bước đầu tiên để xem gợi ý.
        </AppText>
      ) : !hasPhoto ? (
        <AppText kind="small" color={stitchTokens.subtleGray}>
          Thêm ít nhất 1 ảnh bản sách ở bước trước để xem gợi ý giá.
        </AppText>
      ) : null}

      {stale ? (
        <Notice tone="warning">
          Đầu sách hoặc tình trạng vừa thay đổi nên gợi ý trước không còn áp dụng.
        </Notice>
      ) : null}

      {(state.status === "error" || state.status === "ready") && state.message && !stale ? (
        <Notice tone="warning">{state.message}</Notice>
      ) : null}

      {statusTitle ? (
        <View style={styles.statusBox}>
          <AppText kind="bold" color={stitchTokens.wineDark}>
            {statusTitle}
          </AppText>
          {lookupWaiting ? (
            <AppText kind="small" color={stitchTokens.deepCocoa}>
              Hệ thống đang tự động tìm nguồn giá cho đầu sách này trong nền…
            </AppText>
          ) : null}
        </View>
      ) : null}

      <Button
        wine
        title={buttonLabel}
        busy={loading || lookupWaiting}
        disabled={disabled || !form.bookId || !hasPhoto || loading || lookupWaiting}
        onPress={onAsk}
      />

      {/* Price Reference Panel */}
      <PriceReferencePanel
        state={reference ?? null}
        currentKey={currentKey}
        disabled={disabled || !hasPhoto || !form.bookId}
        onApply={(amount) => onApplyReference?.(amount)}
        aiReady={Boolean(ready)}
      />

      {ready && ready.status !== "Suggested" ? (
        <Notice tone="info">
          {ready.status === "Refused"
            ? "Trợ lý không ước lượng giá cho bản sách này."
            : "Chưa đủ thông tin để gợi ý giá."}{" "}
          {ready.missing.join(" ")} Bạn vẫn có thể tự nhập giá bán.
        </Notice>
      ) : null}

      {/* Suggested Range Card */}
      {ready?.range ? (
        <View style={styles.rangeCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ gap: 2 }}>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                Khoảng giá gợi ý AI
              </AppText>
              <AppText kind="price" color={stitchTokens.wine} style={{ fontSize: 24 }}>
                {formatVnd(ready.range.low)} – {formatVnd(ready.range.high)}
              </AppText>
            </View>
            <View style={styles.badge}>
              <AppText kind="small" color={stitchTokens.wineDark} style={{ fontWeight: "700" }}>
                {evidenceLabel[ready.evidenceLevel]}
              </AppText>
            </View>
          </View>

          <View style={styles.chipsRow}>
            {pricePoints(ready.range).map((amount) => (
              <Chip
                key={amount}
                title={`Dùng ${formatVnd(amount)}`}
                selected={current === amount}
                onPress={() => (disabled ? undefined : pick(amount))}
              />
            ))}
          </View>

          {/* Factors collapsible */}
          <Button
            secondary
            title={showFactors ? "Thu gọn giải thích khoảng giá" : "Vì sao có khoảng giá này?"}
            onPress={() => setShowFactors((v) => !v)}
          />

          {showFactors ? (
            <View style={styles.factorsBox}>
              {ready.factors.map((f, i) => (
                <AppText key={i} kind="small" color={stitchTokens.deepCocoa}>
                  • {f.text}
                  {f.sourceRefs.length
                    ? ` (${f.sourceRefs
                        .map((r) => (r === "condition" ? "tình trạng" : (labels.get(r) ?? r)))
                        .join(", ")})`
                    : ""}
                </AppText>
              ))}
              {ready.missing.length ? (
                <AppText kind="small" color={colors.warning}>
                  Còn thiếu: {ready.missing.join(" ")}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Sources List */}
      {ready && ready.sources.length ? (
        <View style={styles.sourcesContainer}>
          <AppText kind="label" color={stitchTokens.wineDark}>
            NGUỒN THAM KHẢO ({ready.sources.length})
          </AppText>
          {ready.sources.map((s) => (
            <View key={s.ref} style={{ gap: 2 }}>
              <AppText
                kind="small"
                color={s.excluded ? stitchTokens.subtleGray : stitchTokens.deepCocoa}
              >
                {s.label} · {sourceKindLabel[s.kind]} · {formatVnd(s.amount)} · {day(s.observedAt)}
                {s.excluded ? ` · ${excludedLabel[s.excluded]}` : ""}
              </AppText>
              {s.url ? (
                <Pressable
                  hitSlop={6}
                  onPress={() => void Linking.openURL(s.url!)}
                  style={{ alignSelf: "flex-start" }}
                >
                  <AppText kind="small" color={stitchTokens.wine} style={{ textDecorationLine: "underline" }}>
                    Mở nguồn ↗
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
          {ready.dataAsOf ? (
            <AppText kind="small" color={stitchTokens.subtleGray}>
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

const styles = StyleSheet.create({
  container: {
    gap: space.md,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderColor: colors.rule,
  },
  statusBox: {
    backgroundColor: stitchTokens.goldLight,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    gap: 2,
  },
  rangeCard: {
    backgroundColor: stitchTokens.warmIvory,
    padding: space.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  badge: {
    backgroundColor: stitchTokens.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  factorsBox: {
    backgroundColor: stitchTokens.white,
    padding: space.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.xs,
  },
  sourcesContainer: {
    backgroundColor: stitchTokens.parchment,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.xs,
  },
});
