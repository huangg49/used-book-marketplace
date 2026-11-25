import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, space, stitchTokens } from "../../../core/ui";
import type { Listing } from "../contracts";

interface BookBottomBarProps {
  item: Listing;
  onChatPress: () => void;
  onExchangePress: () => void;
  onBuyPress: () => void;
  onAddToCartPress?: () => void;
  cartBusy?: boolean;
  inCart?: boolean;
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
  onAddToCartPress,
  cartBusy,
  inCart,
  isOwner,
  hasActiveOrder,
  activeOrderState,
}: BookBottomBarProps) {
  const isAvailable = item.purchaseAvailability?.status === "Available";
  const canBuy = item.salePrice != null && isAvailable && !isOwner;
  const canExchange =
    !item.bundle &&
    (item.mode === "Exchange" || item.mode === "Both") &&
    isAvailable &&
    !isOwner;

  const displayPrice = item.salePrice ?? item.exchangeValue;
  const priceLabel =
    item.bundle ? "GIÁ CẢ BỘ" : item.salePrice != null
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
        <AppText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={styles.priceValue}
        >
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

        {canBuy && onAddToCartPress && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={inCart ? "Đã có trong giỏ sách" : "Thêm vào giỏ sách"}
            disabled={cartBusy}
            style={({ pressed }) => [
              styles.chatBtn,
              inCart && { borderColor: stitchTokens.wineDark, backgroundColor: stitchTokens.roseWarmSurface },
              (pressed || cartBusy) && styles.pressed,
            ]}
            onPress={onAddToCartPress}
          >
            <Icon
              name={inCart ? "check" : "bag"}
              size={18}
              color={inCart ? stitchTokens.verifiedGreen : stitchTokens.wineDark}
            />
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
            accessibilityLabel={item.bundle ? "Mua cả bộ sách này" : "Mua ngay cuốn sách này"}
            style={({ pressed }) => [styles.buyBtn, pressed && styles.pressed]}
            onPress={onBuyPress}
          >
            <AppText numberOfLines={1} style={styles.buyBtnText}>
              {item.bundle ? "Mua cả bộ" : "Mua ngay"}
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
    height: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    gap: 8,
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
    flex: 1,
    minWidth: 0,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.wineMid,
    letterSpacing: 0.4,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "800",
    color: stitchTokens.wineDark,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    gap: 5,
  },
  chatBtn: {
    width: 36,
    height: 38,
    borderRadius: 10,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  exchangeBtn: {
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: stitchTokens.terracottaSoft,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  exchangeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: stitchTokens.wineDark,
  },
  buyBtn: {
    height: 38,
    paddingHorizontal: 13,
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
