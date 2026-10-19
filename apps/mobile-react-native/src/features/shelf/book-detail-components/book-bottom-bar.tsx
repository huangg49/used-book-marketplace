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
  hasActiveOrder?: boolean;
  activeOrderState?: string;
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
  hasActiveOrder,
  activeOrderState,
}: BookBottomBarProps) {
  const isAvailable = item.purchaseAvailability?.status === "Available";
  const canBuy = item.salePrice != null && isAvailable && !isOwner;
  const canExchange =
    (item.mode === "Exchange" || item.mode === "Both") && isAvailable && !isOwner;

  const displayPrice = item.salePrice ?? item.exchangeValue;
  const priceLabel =
    item.salePrice != null
      ? "GIÁ BÁN"
      : item.mode === "Exchange"
        ? "GIÁ ĐỔI"
        : "GIÁ SÁCH";

  return (
    <View style={styles.container}>
      <View style={styles.priceColumn}>
        <AppText numberOfLines={1} style={styles.priceLabel}>
          {priceLabel}
        </AppText>
        <AppText numberOfLines={1} style={styles.priceValue}>
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
            <Icon name="message" size={18} color={stitchTokens.wineDark} />
          </Pressable>
        )}

        {canExchange && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi đề nghị đổi sách"
            style={({ pressed }) => [styles.exchangeBtn, pressed && styles.pressed]}
            onPress={onExchangePress}
          >
            <AppText numberOfLines={1} style={styles.exchangeBtnText}>
              Đổi sách
            </AppText>
          </Pressable>
        )}

        {isOwner ? (
          <View style={styles.ownerBadge}>
            <AppText numberOfLines={1} style={styles.ownerText}>
              Sách của bạn
            </AppText>
          </View>
        ) : hasActiveOrder && activeOrderState === "AwaitingPayment" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thanh toán ngay đơn hàng đang giữ sách"
            style={({ pressed }) => [styles.payNowBtn, pressed && styles.pressed]}
            onPress={onBuyPress}
          >
            <Icon name="tag" size={15} color={stitchTokens.white} />
            <AppText numberOfLines={1} style={styles.buyBtnText}>
              Thanh toán ngay
            </AppText>
          </Pressable>
        ) : canBuy ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mua ngay cuốn sách này"
            style={({ pressed }) => [styles.buyBtn, pressed && styles.pressed]}
            onPress={onBuyPress}
          >
            <AppText numberOfLines={1} style={styles.buyBtnText}>
              Mua ngay
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.disabledBtn}>
            <AppText numberOfLines={1} style={styles.disabledText}>
              {item.purchaseAvailability?.status === "InTransaction"
                ? "Đang giữ sách"
                : "Không sẵn sàng"}
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
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
    gap: 1,
    flexShrink: 0,
    marginRight: 6,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineMid,
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    gap: 6,
  },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  exchangeBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  exchangeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  buyBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  payNowBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: stitchTokens.wineMid,
    flexDirection: "row",
    alignItems: "center",

    justifyContent: "center",
    gap: 6,
    flexShrink: 0,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  buyBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.white,
  },

  ownerBadge: {
    height: 40,
    paddingHorizontal: 14,
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
    height: 40,
    paddingHorizontal: 12,
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
