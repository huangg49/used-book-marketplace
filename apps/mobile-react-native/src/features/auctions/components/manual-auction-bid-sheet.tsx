import { Pressable, StyleSheet, View } from "react-native";
import {
  AppText, Button, Notice, Sheet, TextField, formatVnd, radius, space, stitchTokens,
} from "../../../core/ui";
import { TransactionAmount, TransactionNotes } from "../../../core/ui/transaction-review";
import { amountError, bidOptions, fundsHint, fundsShortfall, minimumBidOf } from "../auctions-model";
import type { PublicAuctionSummary } from "../contracts";

export function ManualAuctionBidSheet({
  auction, visible, onClose, onChange, onSubmit, manual, available, heldHere, busy, blocked, pendingAmount, error,
}: {
  auction: PublicAuctionSummary;
  visible: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: (amount: number) => void;
  manual: string | null;
  available: number | null;
  heldHere: number;
  busy: boolean;
  blocked: string | null;
  pendingAmount: number | null;
  error: string | null;
}) {
  const minimum = minimumBidOf(auction);
  const amount = manual === null ? minimum : Number(manual) || null;
  const validation = amountError(amount, minimum, auction.startPrice, auction.step) ??
    (fundsShortfall(amount, available) ? fundsHint(amount, available) : null);
  const validAmount = !validation && amount != null ? amount : null;
  const submitAmount = pendingAmount ?? (blocked ? null : validAmount);

  return (
    <Sheet
      title="Trả giá"
      visible={visible}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <Button
          wine
          title={busy ? "Đang gửi…" : pendingAmount != null ? "Thử lại lượt trả giá" :
            submitAmount == null ? "Xác nhận trả giá" : `Xác nhận trả ${formatVnd(submitAmount)}`}
          busy={busy}
          disabled={busy || submitAmount == null}
          onPress={() => { if (submitAmount != null) onSubmit(submitAmount); }}
        />
      }
    >
      <View style={styles.summary}>
        <View style={styles.line}>
          <AppText style={styles.label}>{auction.bidderCount > 0 ? "Giá hiện tại" : "Giá khởi điểm"}</AppText>
          <AppText style={styles.value}>{formatVnd(auction.currentPrice ?? auction.startPrice)}</AppText>
        </View>
        <View style={styles.divider} />
        <View style={styles.line}>
          <AppText style={styles.label}>Giá tối thiểu</AppText>
          <AppText style={styles.valueHighlight}>{formatVnd(minimum)}</AppText>
        </View>
        {available !== null ? (
          <>
            <View style={styles.divider} />
            <View style={styles.line}>
              <AppText style={styles.label}>Ví khả dụng{heldHere > 0 ? " (gồm khoản đang giữ)" : ""}</AppText>
              <AppText style={styles.walletValue}>{formatVnd(available)}</AppText>
            </View>
          </>
        ) : null}
      </View>

      {pendingAmount != null ? (
        <Notice tone="warning">
          Chưa xác nhận được kết quả của lượt {formatVnd(pendingAmount)}. Thử lại sẽ gửi đúng lượt này.
        </Notice>
      ) : blocked ? (
        <Notice tone="warning">{blocked}</Notice>
      ) : (
        <View style={styles.form}>
          <View style={styles.quickSection}>
            <AppText kind="small" style={styles.quickTitle}>Chọn nhanh mức trả</AppText>
            <View style={styles.options} accessibilityLabel="Chọn nhanh mức trả">
              {bidOptions(minimum, auction.step).map(value => {
                const selected = amount === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: busy }}
                    disabled={busy}
                    onPress={() => onChange(String(value))}
                    style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                  >
                    <AppText style={[styles.optionText, selected && styles.selectedText]}>{formatVnd(value)}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField
            label="Số tiền trả lượt này"
            keyboardType="number-pad"
            value={manual ?? String(minimum)}
            editable={!busy}
            onChangeText={text => onChange(text.replace(/[^0-9]/g, ""))}
            hint={
              amount != null && amount > 0
                ? `${formatVnd(amount)} · Bước giá ${formatVnd(auction.step)}`
                : `Bước giá ${formatVnd(auction.step)}`
            }
            error={validation ?? undefined}
          />

          {validAmount != null && (
            <TransactionAmount label="Ví sẽ giữ nếu bạn dẫn giá" value={formatVnd(validAmount)} />
          )}
          <TransactionNotes notes={[
            ...(validAmount != null && heldHere > 0 ? [{
              label: "Phần giữ thêm nếu dẫn giá", detail: formatVnd(Math.max(0, validAmount - heldHere)),
            }] : []),
            { label: "Cam kết", detail: "Lượt trả giá không thể rút lại." },
            { label: "Nếu thắng", detail: "Thanh toán từ Ví trong 24 giờ và chọn cách nhận sách trong đơn." },
          ]} />
        </View>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.md,
    gap: 10,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.md,
    rowGap: space.xs,
  },
  divider: { height: 1, backgroundColor: stitchTokens.borderWarm },
  label: { flexShrink: 1, color: stitchTokens.brownMuted, fontSize: 13 },
  value: { color: stitchTokens.deepCocoa, fontWeight: "700", fontSize: 14, fontVariant: ["tabular-nums"] },
  valueHighlight: { color: stitchTokens.wine, fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] },
  walletValue: { color: stitchTokens.deepCocoa, fontWeight: "700", fontSize: 13, fontVariant: ["tabular-nums"] },
  form: { gap: space.md },
  quickSection: { gap: space.xs },
  quickTitle: { color: stitchTokens.brownMuted, fontWeight: "600", fontSize: 13 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    minHeight: 48,
    flexBasis: "30%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
  },
  selected: { borderColor: stitchTokens.wine, backgroundColor: stitchTokens.wine },
  pressed: { opacity: 0.75 },
  optionText: {
    color: stitchTokens.wineDark,
    fontSize: 13,
    textAlign: "center",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  selectedText: { color: stitchTokens.warmIvory },
});
