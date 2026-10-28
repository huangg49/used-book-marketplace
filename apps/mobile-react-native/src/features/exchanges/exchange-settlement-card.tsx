import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { AppText, Button, Icon, radius, space, stitchTokens } from "../../core/ui";
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

  let compensationText = "0 đ (Ngang giá)";
  let isPositive = false;

  if (diff > 0) {
    if (isPayer) {
      compensationText = `-${formatVnd(diff)} (Bạn bù)`;
      isPositive = false;
    } else {
      compensationText = `+${formatVnd(diff)} (Đối tác bù)`;
      isPositive = true;
    }
  }

  return (
    <View style={styles.card}>
      {/* 1. Celebration Banner */}
      <View style={styles.banner}>
        <View style={styles.iconCircle}>
          <Icon
            name="celebration"
            size={24}
            color={stitchTokens.whiteSurface}
          />
        </View>
        <View style={styles.bannerText}>
          <AppText style={styles.title}>
            Giao dịch Trao đổi Hoàn tất Thành công!
          </AppText>
          <AppText style={styles.subtitle}>
            Cả hai bên đã nhận và nghiệm thu sách. Hệ thống đã tự động tất toán ký quỹ và kết chuyển dòng tiền.
          </AppText>
        </View>
      </View>

      {/* 2. Three-Item Settlement Breakdown Receipt */}
      <View style={styles.summaryContainer}>
        {/* Item 1: Ký quỹ hoàn lại */}
        <View style={styles.summaryItem}>
          <View style={styles.itemHeader}>
            <Icon name="wallet" size={15} color={stitchTokens.likeNewGreen} />
            <AppText style={styles.itemLabel}>Ký quỹ bảo chứng</AppText>
          </View>
          <AppText style={styles.itemValuePositive}>
            +{formatVnd(myDeposit)}
          </AppText>
          <AppText style={styles.itemSubtext}>
            Đã hoàn lại 100% vào Ví
          </AppText>
        </View>

        {/* Item 2: Bù chênh lệch */}
        <View style={styles.summaryItem}>
          <View style={styles.itemHeader}>
            <Icon name="tag" size={15} color={stitchTokens.wineDark} />
            <AppText style={styles.itemLabel}>Khoản bù chênh lệch</AppText>
          </View>
          <AppText
            style={[
              styles.itemValue,
              isPositive && styles.itemValuePositive,
            ]}
          >
            {compensationText}
          </AppText>
          <AppText style={styles.itemSubtext}>
            Đã kết chuyển hoàn tất
          </AppText>
        </View>

        {/* Item 3: Trạng thái sách */}
        <View style={styles.summaryItem}>
          <View style={styles.itemHeader}>
            <Icon name="book" size={15} color={stitchTokens.wineDark} />
            <AppText style={styles.itemLabel}>Trạng thái sách</AppText>
          </View>
          <AppText style={styles.itemValue}>Đã trao đổi</AppText>
          <AppText style={styles.itemSubtext}>
            Chuyển sang Exchanged
          </AppText>
        </View>
      </View>

      {/* 3. Action Buttons */}
      <View style={styles.actionsRow}>
        <View style={{ flex: 1 }}>
          <Button
            title="Kiểm tra số dư Ví"
            wine
            onPress={() => router.push("/wallet")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Khám phá sách khác"
            secondary
            onPress={() => router.push("/")}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.likeNewGreen,
    padding: space.md,
    gap: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  bannerText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
    lineHeight: 21,
  },
  subtitle: {
    fontSize: 12,
    color: stitchTokens.roseBrown,
    lineHeight: 16,
  },
  summaryContainer: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  summaryItem: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 10,
    padding: 10,
    gap: 2,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  itemValue: {
    fontSize: 14,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  itemValuePositive: {
    color: stitchTokens.likeNewGreen,
    fontSize: 14,
    fontWeight: "800",
  },
  itemSubtext: {
    fontSize: 10,
    color: stitchTokens.roseBrown,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
});
