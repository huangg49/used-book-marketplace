import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Switch, UIManager, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppTextInput as TextInput, Icon, formatVnd, stitchTokens } from "../../../core/ui";
import { AUCTION_MAX_PRICE } from "../auctions-model";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface SendToAuctionPricingProps {
  readonly step: 10000 | 50000;
  readonly onSelectStep: (step: 10000 | 50000) => void;
  readonly startPriceText: string;
  readonly onChangeStartPriceText: (text: string) => void;
  readonly startPriceError?: string;
  readonly buyNowOn: boolean;
  readonly onToggleBuyNow: (val: boolean) => void;
  readonly buyNowPriceText: string;
  readonly onChangeBuyNowPriceText: (text: string) => void;
  readonly buyNowPriceError?: string;
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
}

export function SendToAuctionPricing({
  step,
  onSelectStep,
  startPriceText,
  onChangeStartPriceText,
  startPriceError,
  buyNowOn,
  onToggleBuyNow,
  buyNowPriceText,
  onChangeBuyNowPriceText,
  buyNowPriceError,
  disabled = false,
  defaultExpanded = true,
}: SendToAuctionPricingProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const parsedStart = Number(startPriceText) || 0;
  const parsedBuyNow = Number(buyNowPriceText) || 0;

  return (
    <View style={styles.cardContainer}>
      {/* Title */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Thu gọn mục giá phiên" : "Mở rộng mục giá phiên"}
        accessibilityState={{ expanded }}
        onPress={handleToggle}
        style={({ pressed }) => [styles.headerRow, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.headerLeft}>
          <Icon name="tag" size={17} color={stitchTokens.wineDark} />
          <AppText kind="bold" style={styles.headerTitle}>
            3. Giá phiên
          </AppText>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.durationPill}>
            <AppText kind="small" style={styles.durationPillText}>
              24 giờ
            </AppText>
          </View>
          <View style={styles.chevronWrapper}>
            <Icon
              name={expanded ? "chevronDown" : "chevronRight"}
              size={18}
              color={stitchTokens.wineDark}
            />
          </View>
        </View>
      </Pressable>

      {!expanded && parsedStart > 0 && (
        <View style={styles.collapsedPreview}>
          <Icon name="check" size={13} color={stitchTokens.wineDark} />
          <AppText kind="small" numberOfLines={1} style={styles.collapsedPreviewText}>
            Khởi điểm: {formatVnd(parsedStart)} • Bước {formatVnd(step)}
            {buyNowOn && parsedBuyNow > 0 ? ` • Mua ngay: ${formatVnd(parsedBuyNow)}` : ""}
          </AppText>
        </View>
      )}

      {expanded && (
        <>

      {/* 1. Bid Increment (Bước giá) */}
      <View style={styles.fieldGroup}>
        <AppText kind="bold" style={styles.fieldLabel}>
          Bước giá tối thiểu (Mỗi lượt ra giá)
        </AppText>
        <View style={styles.stepGrid}>
          {([10000, 50000] as const).map((val) => {
            const isSelected = step === val;
            return (
              <Pressable
                key={val}
                accessibilityRole="button"
                accessibilityLabel={`Bước ${formatVnd(val)}`}
                disabled={disabled}
                onPress={() => onSelectStep(val)}
                style={[
                  styles.stepButton,
                  isSelected && styles.stepButtonActive,
                  disabled && { opacity: 0.6 },
                ]}
              >
                <Icon
                  name={isSelected ? "check" : "radio_button_unchecked" as any}
                  size={14}
                  color={isSelected ? stitchTokens.gold : stitchTokens.subtleGray}
                />
                <AppText
                  kind="bold"
                  style={[styles.stepButtonText, isSelected && styles.stepButtonTextActive]}
                >
                  Bước {formatVnd(val)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2. Starting Price (Giá khởi điểm) */}
      <View style={styles.fieldGroup}>
        <View style={styles.labelWithHintRow}>
          <AppText kind="bold" style={styles.fieldLabel}>
            Giá khởi điểm
          </AppText>
          <AppText kind="small" style={styles.hintSub}>
            Khuyên dùng: 50.000 đ - 500.000 đ
          </AppText>
        </View>

        <View style={[styles.inputWrapper, Boolean(startPriceError) && styles.inputWrapperError]}>
          <TextInput
            value={startPriceText}
            onChangeText={(text) => onChangeStartPriceText(text.replace(/\D/g, ""))}
            keyboardType="number-pad"
            editable={!disabled}
            placeholder="0"
            placeholderTextColor={stitchTokens.subtleGray}
            style={styles.textInput}
          />
          <AppText kind="bold" style={styles.currencySuffix}>
            VNĐ
          </AppText>
        </View>

        {Boolean(startPriceError) ? (
          <AppText kind="small" style={styles.errorText}>
            {startPriceError}
          </AppText>
        ) : (
          <AppText kind="small" style={styles.helpText}>
            Phạm vi hợp lệ: Từ {formatVnd(10000)} đến {formatVnd(AUCTION_MAX_PRICE)}
          </AppText>
        )}
      </View>

      {/* 3. Buy Now Option (Mua ngay) */}
      <View style={styles.buyNowSection}>
        <View style={styles.buyNowToggleRow}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <AppText kind="bold" style={styles.buyNowTitle}>
              Cho phép mua ngay
            </AppText>
            <AppText kind="small" style={styles.buyNowSubtitle}>
              Áp dụng trước khi có lượt trả giá đầu tiên
            </AppText>
          </View>
          <Switch
            value={buyNowOn}
            onValueChange={onToggleBuyNow}
            disabled={disabled}
            trackColor={{ false: stitchTokens.switchTrackFalse, true: stitchTokens.wineDark }}
            thumbColor={buyNowOn ? stitchTokens.gold : stitchTokens.white}
          />
        </View>

        {buyNowOn && (
          <View style={[styles.fieldGroup, { marginTop: 10 }]}>
            <AppText kind="bold" style={styles.fieldLabel}>
              Giá mua ngay
            </AppText>

            <View
              style={[
                styles.inputWrapper,
                Boolean(buyNowPriceError) && styles.inputWrapperError,
              ]}
            >
              <TextInput
                value={buyNowPriceText}
                onChangeText={(text) => onChangeBuyNowPriceText(text.replace(/\D/g, ""))}
                keyboardType="number-pad"
                editable={!disabled}
                placeholder="0"
                placeholderTextColor={stitchTokens.subtleGray}
                style={styles.textInput}
              />
              <AppText kind="bold" style={styles.currencySuffix}>
                VNĐ
              </AppText>
            </View>

            {Boolean(buyNowPriceError) ? (
              <AppText kind="small" style={styles.errorText}>
                {buyNowPriceError}
              </AppText>
            ) : (
              <View style={styles.infoRow}>
                <Icon name="info" size={13} color={stitchTokens.wine} />
                <AppText kind="small" style={styles.infoText}>
                  Giá mua ngay phải bằng giá khởi điểm cộng thêm ít nhất một bước giá.
                </AppText>
              </View>
            )}
          </View>
        )}
      </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: stitchTokens.vintageGold, // Màu vàng ấm chính xác từ banner Đấu giá
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: stitchTokens.goldBorder,
    padding: 16,
    gap: 14,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 1.5, height: 1.5 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chevronWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.whiteAlpha70,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  collapsedPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: stitchTokens.whiteAlpha88,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  collapsedPreviewText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: 16,
    color: stitchTokens.wineDark,
  },
  durationPill: {
    backgroundColor: stitchTokens.whiteAlpha88,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  durationPillText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    color: stitchTokens.wineDark,
    fontWeight: "700",
  },
  labelWithHintRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  hintSub: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    opacity: 0.8,
  },
  stepGrid: {
    flexDirection: "row",
    gap: 10,
  },
  stepButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 10,
    backgroundColor: stitchTokens.whiteAlpha90,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  stepButtonActive: {
    backgroundColor: stitchTokens.wineDark,
    borderColor: stitchTokens.wineDark,
  },
  stepButtonText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  stepButtonTextActive: {
    color: stitchTokens.white,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.whiteAlpha90,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  inputWrapperError: {
    borderColor: stitchTokens.flashRed,
    backgroundColor: stitchTokens.flashRedBg,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    paddingVertical: 0,
  },
  currencySuffix: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    opacity: 0.8,
    letterSpacing: 0.4,
  },
  helpText: {
    fontSize: 11,
    color: stitchTokens.wineDark,
    opacity: 0.8,
  },
  errorText: {
    fontSize: 11,
    color: stitchTokens.flashRed,
  },
  buyNowSection: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.goldBorderAlpha35,
  },
  buyNowToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  buyNowTitle: {
    fontSize: 14,
    color: stitchTokens.deepCocoa,
  },
  buyNowSubtitle: {
    fontSize: 12,
    color: stitchTokens.subtleGray,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    color: stitchTokens.subtleGray,
    lineHeight: 15,
  },
});
