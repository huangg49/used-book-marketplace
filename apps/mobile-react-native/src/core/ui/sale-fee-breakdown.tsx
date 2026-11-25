import { formatSaleFeeRate, type SaleSettlementReceipt } from "@used-books/session-client";
import { StyleSheet, View } from "react-native";
import { AppText } from "./text";
import { formatVnd } from "./format";
import { radius, space, stitchTokens } from "./theme";

export function SaleFeeBreakdown({ amounts, settled }: { amounts: SaleSettlementReceipt; settled: boolean }) {
  const rows = [
    { label: "Tiền sách", value: formatVnd(amounts.bookPrice) },
    { label: `Phí dịch vụ (${formatSaleFeeRate(amounts.commissionBps)})`, value: `${amounts.commission > 0 ? "−" : ""}${formatVnd(amounts.commission)}` },
  ];
  if (amounts.shippingReimbursement > 0) {
    rows.push({ label: "Hoàn ứng phí giao nhận", value: `+${formatVnd(amounts.shippingReimbursement)}` });
  }
  return (
    <View style={styles.breakdown}>
      {rows.map(row => (
        <View key={row.label} style={styles.row}>
          <AppText kind="small" style={styles.label}>{row.label}</AppText>
          <AppText kind="small" style={styles.value}>{row.value}</AppText>
        </View>
      ))}
      <View style={[styles.row, styles.total]}>
        <AppText kind="bold" color={stitchTokens.wine} style={styles.label}>
          {settled ? "Thực nhận vào ví" : "Dự kiến nhận vào ví"}
        </AppText>
        <AppText kind="bold" color={stitchTokens.wine} style={styles.value}>{formatVnd(amounts.creditedAmount)}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  breakdown: { padding: space.sm, gap: space.xs, borderWidth: 1, borderColor: stitchTokens.cardBorder, borderRadius: radius.small, backgroundColor: stitchTokens.warmIvory },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: space.sm, alignItems: "baseline" },
  label: { flexShrink: 1 },
  value: { fontVariant: ["tabular-nums"] },
  total: { borderTopWidth: 1, borderTopColor: stitchTokens.cardBorder, paddingTop: space.xs },
});
