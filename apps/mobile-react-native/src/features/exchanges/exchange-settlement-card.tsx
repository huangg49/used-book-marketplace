import React from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Icon, stitchTokens } from "../../core/ui";
import { formatVnd } from "../../core/ui/format";
import type { Exchange } from "./contracts";

interface ExchangeSettlementCardProps {
  exchange: Exchange;
  isInitiator: boolean;
}

export function ExchangeSettlementCard({
  exchange,
  isInitiator,
}: ExchangeSettlementCardProps) {
  if (exchange.status !== "Completed") {
    return null;
  }

  const myDeposit = isInitiator
    ? exchange.initiatorDeposit
    : exchange.recipientDeposit;

  const diff = exchange.diffAmount;
  const isPayer =
    exchange.diffPayerId ===
    (isInitiator ? exchange.initiatorId : exchange.recipientId);

  const partialDamage = exchange.resolutionCompensationAmount ?? 0;
  const isPartialDeduction =
    partialDamage > 0 &&
    (exchange.resolutionDecision === "CompensateInitiator" ||
      exchange.resolutionDecision === "CompensateRecipient");
  const viewerWonDeduction =
    isPartialDeduction &&
    ((exchange.resolutionDecision === "CompensateInitiator" && isInitiator) ||
      (exchange.resolutionDecision === "CompensateRecipient" && !isInitiator));

  let compensationText = "0 đ (Ngang giá)";
  let isPositive = false;

  if (isPartialDeduction) {
    compensationText = viewerWonDeduction
      ? `+${formatVnd(partialDamage)}`
      : `-${formatVnd(partialDamage)}`;
    isPositive = viewerWonDeduction;
  } else if (diff > 0) {
    if (isPayer) {
      compensationText = `-${formatVnd(diff)}`;
      isPositive = false;
    } else {
      compensationText = `+${formatVnd(diff)}`;
      isPositive = true;
    }
  }

  return (
    <View style={styles.card}>
      {/* Celebratory Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Icon name="celebration" size={22} color={stitchTokens.whiteSurface} />
        </View>
        <View style={styles.headerText}>
          <AppText style={styles.title}>Biên lai tất toán hoàn tất</AppText>
          <AppText style={styles.subtitle}>
            {isPartialDeduction
              ? `Hoàn tất theo phán quyết kèm khấu trừ thiệt hại ${formatVnd(partialDamage)}.`
              : "Tiền ký quỹ và tiền bù đã được kết chuyển vào ví của cả hai bên."}
          </AppText>
        </View>
      </View>

      {/* Clean Receipt Rows — No boxes-inside-boxes */}
      <View style={styles.receiptList}>
        <View style={styles.receiptRow}>
          <View style={styles.receiptLeft}>
            <AppText style={styles.rowLabel}>Ký quỹ bảo chứng</AppText>
            <AppText style={styles.rowSub}>
              {isPartialDeduction
                ? "Tất toán theo phán quyết"
                : "Hoàn lại 100% vào Ví"}
            </AppText>
          </View>
          <AppText style={styles.valuePositive}>+{formatVnd(myDeposit)}</AppText>
        </View>

        <View style={[styles.receiptRow, styles.rowDivider]}>
          <View style={styles.receiptLeft}>
            <AppText style={styles.rowLabel}>
              {isPartialDeduction ? "Khấu trừ thiệt hại" : "Khoản bù chênh lệch"}
            </AppText>
            <AppText style={styles.rowSub}>
              {isPartialDeduction && diff > 0
                ? `Tiền bù thỏa thuận: ${formatVnd(diff)}`
                : isPartialDeduction
                  ? viewerWonDeduction
                    ? "Bồi hoàn thiệt hại về ví bạn"
                    : "Khấu trừ từ tiền ký quỹ"
                  : diff > 0
                    ? isPayer
                      ? "Bạn bù cho đối tác"
                      : "Đối tác bù vào ví bạn"
                    : "Trao đổi ngang giá"}
            </AppText>
          </View>
          <AppText
            style={[
              styles.valueNeutral,
              isPositive && styles.valuePositive,
              !isPositive && (isPartialDeduction || (diff > 0 && isPayer)) && styles.valueWine,
            ]}
          >
            {compensationText}
          </AppText>
        </View>

        <View style={[styles.receiptRow, styles.rowDivider]}>
          <View style={styles.receiptLeft}>
            <AppText style={styles.rowLabel}>Trạng thái sách</AppText>
            <AppText style={styles.rowSub}>Đã cập nhật quyền sở hữu</AppText>
          </View>
          <View style={styles.statusChip}>
            <Icon name="check" size={11} color={stitchTokens.likeNewGreen} />
            <AppText style={styles.statusChipText}>Đã trao đổi</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(27, 94, 32, 0.16)",
    padding: 18,
    gap: 14,
    shadowColor: stitchTokens.darkWood,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: stitchTokens.likeNewGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15.5,
    fontWeight: "800",
    color: stitchTokens.darkWood,
  },
  subtitle: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    lineHeight: 17,
  },
  receiptList: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 11,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
  },
  receiptLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontSize: 13.5,
    fontWeight: "700",
    color: stitchTokens.darkWood,
  },
  rowSub: {
    fontSize: 11.5,
    color: stitchTokens.subtleGray,
  },
  valuePositive: {
    fontSize: 15,
    fontWeight: "800",
    color: stitchTokens.likeNewGreen,
    fontVariant: ["tabular-nums"],
  },
  valueNeutral: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.darkWood,
    fontVariant: ["tabular-nums"],
  },
  valueWine: {
    color: stitchTokens.wine,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: stitchTokens.likeNewGreenBg,
  },
  statusChipText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: stitchTokens.likeNewGreen,
  },
});
