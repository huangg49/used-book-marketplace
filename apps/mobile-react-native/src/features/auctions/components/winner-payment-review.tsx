import { auctionCheckoutBalance, formatSaleFeeRate } from "@used-books/session-client";
import { StyleSheet, View } from "react-native";
import { AppText, Icon, colors, formatVnd, radius, space, stitchTokens } from "../../../core/ui";

export type WinnerPaymentReviewProps = {
  bookPrice: number;
  deliveryFee: number;
  heldAmount?: number;
  commissionBps?: number;
  receiptMethod: string;
};

function AmountRow({ label, amount, total = false }: { label: string; amount: number; total?: boolean }) {
  return (
    <View style={[styles.row, total && styles.total]}>
      <AppText kind={total ? "bold" : "small"} color={total ? colors.ink : colors.muted} style={styles.label}>
        {label}
      </AppText>
      <AppText kind="bold" style={styles.amount}>{formatVnd(amount)}</AppText>
    </View>
  );
}

export function WinnerPaymentReview({ bookPrice, deliveryFee, heldAmount, commissionBps, receiptMethod }: WinnerPaymentReviewProps) {
  const total = bookPrice + deliveryFee;
  const balance = auctionCheckoutBalance(total, heldAmount);
  const amountLabel = heldAmount === undefined
    ? "Tổng thanh toán"
    : heldAmount > total
      ? "Hoàn dư về Ví"
      : "Trừ thêm từ Ví";
  const feeRate = commissionBps === undefined ? "" : ` ${formatSaleFeeRate(commissionBps)}`;

  return (
    <View style={styles.content}>
      <View style={styles.wallet}>
        <Icon name="wallet" size={20} color={stitchTokens.wine} />
        <View style={styles.walletText}>
          <AppText kind="small" color={stitchTokens.wineDark}>{amountLabel}</AppText>
          <AppText kind="price" color={stitchTokens.wine} style={styles.walletAmount}>
            {formatVnd(balance?.amount ?? total)}
          </AppText>
        </View>
      </View>

      <View style={styles.receipt}>
        <AmountRow label="Tiền sách" amount={bookPrice} />
        <AmountRow label="Phí giao nhận" amount={deliveryFee} />
        {heldAmount !== undefined ? (
          <>
            <AmountRow label="Ví đã giữ cho phiên" amount={heldAmount} />
            <AmountRow label="Tổng thanh toán" amount={total} total />
          </>
        ) : (
          <AppText kind="small" color={colors.muted}>Chưa tải được khoản Ví đã giữ cho phiên.</AppText>
        )}
        <AppText kind="small" color={colors.muted}>
          {commissionBps === 0 ? "Đơn này miễn phí dịch vụ." : `Phí dịch vụ${feeRate} do người bán chịu.`}
        </AppText>
      </View>

      <View style={styles.details}>
        <AppText kind="bold" style={styles.label}>{receiptMethod}</AppText>
        <AppText kind="small" color={colors.muted} style={styles.amount}>Chốt khi thanh toán</AppText>
      </View>

      <View style={styles.hold}>
        <Icon name="shield" size={16} color={stitchTokens.wine} />
        <AppText kind="small" color={colors.ink} style={styles.label}>
          Ví giữ tiền đến hết 72 giờ kiểm tra sau khi nhận sách. Nếu có sự cố, tiền được giữ đến khi xử lý xong.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  wallet: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: stitchTokens.warmIvory,
  },
  walletText: { flex: 1, gap: space.xs },
  walletAmount: { fontVariant: ["tabular-nums"] },
  receipt: { gap: space.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm },
  label: { flex: 1 },
  amount: { flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  total: { borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: space.sm, marginTop: space.xs },
  details: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
    paddingTop: space.sm,
  },
  hold: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
});
