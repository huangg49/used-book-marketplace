import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../../core/ui";
import type { Listing } from "../contracts";

interface BookBottomBarProps {
  item: Listing;
  onChatPress: () => void;
  onExchangePress: () => void;
  onBuyPress: () => void;
  isOwner: boolean;
}

function formatVnd(amount: number | null | undefined): string {
  if (amount == null) return "Thương lượng";
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

export function BookBottomBar({
  item,
  onChatPress,
  onExchangePress,
  onBuyPress,
  isOwner,
}: BookBottomBarProps) {
  const isAvailable = item.purchaseAvailability?.status === "Available";
  const canBuy = item.salePrice != null && isAvailable && !isOwner;
  const canExchange =
    (item.mode === "Exchange" || item.mode === "Both") && isAvailable && !isOwner;

  const displayPrice = item.salePrice ?? item.exchangeValue;

  return (
    <View style={styles.container}>
      <View style={styles.priceColumn}>
        <AppText style={styles.priceLabel}>GIÁ CHUYỂN NHƯỢNG</AppText>
        <AppText style={styles.priceValue}>
          {formatVnd(displayPrice)}
        </AppText>
      </View>

      <View style={styles.actionRow}>
        {!isOwner && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trò chuyện cùng chủ sách"
            style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}
            onPress={onChatPress}
          >
            <Icon name="message" size={19} color={stitchTokens.wineDark} />
          </Pressable>
        )}

        {canExchange && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi đề nghị đổi sách"
            style={({ pressed }) => [styles.exchangeBtn, pressed && styles.pressed]}
            onPress={onExchangePress}
          >
            <AppText style={styles.exchangeBtnText}>Đổi sách</AppText>
          </Pressable>
        )}

        {isOwner ? (
          <View style={styles.ownerBadge}>
            <AppText style={styles.ownerText}>Sách của bạn</AppText>
          </View>
        ) : canBuy ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mua ngay cuốn sách này"
            style={({ pressed }) => [styles.buyBtn, pressed && styles.pressed]}
            onPress={onBuyPress}
          >
            <AppText style={styles.buyBtnText}>Mua ngay</AppText>
          </Pressable>
        ) : (
          <View style={styles.disabledBtn}>
            <AppText style={styles.disabledText}>
              {item.purchaseAvailability?.status === "InTransaction"
                ? "Đang giao dịch"
                : "Đang giữ sách"}
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderTopWidth: 1.5,
    borderTopColor: stitchTokens.peachBorder,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  priceColumn: {
    justifyContent: "center",
    gap: 2,
    flexShrink: 1,
    paddingRight: 8,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineMid,
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 11,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  exchangeBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  exchangeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  buyBtn: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  buyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.white,
  },
  ownerBadge: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerText: {
    fontSize: 13,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  disabledBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  disabledText: {
    fontSize: 12,
    fontWeight: "600",
    color: stitchTokens.subtleGray,
  },
  pressed: {
    opacity: 0.8,
  },
});
