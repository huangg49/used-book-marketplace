import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Switch, UIManager, View } from "react-native";
import { AppText } from "../../../core/ui/text";
import { AppTextInput as TextInput, Icon, formatVnd, stitchTokens } from "../../../core/ui";
import { AUCTION_FORMATS, auctionDepositFor, auctionDepositMaxFor, depositChoices, MIN_BIDDER_OPTIONS, AUCTION_MIN_BIDDERS_CAP, AUCTION_MIN_BIDDERS_FLOOR, AUCTION_STEP_MAX, AUCTION_STEPS, BUY_NOW_MODES, type AuctionFormat, type AuctionStep, type BuyNowMode } from "../auctions-model";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface SendToAuctionPricingProps {
  readonly step: AuctionStep;
  readonly onSelectStep: (step: AuctionStep) => void;
  readonly customStepOn: boolean;
  readonly onSelectCustomStep: () => void;
  readonly customStepText: string;
  readonly onChangeCustomStepText: (text: string) => void;
  readonly customStepError?: string;
  readonly startPriceText: string;
  readonly onChangeStartPriceText: (text: string) => void;
  readonly startPriceError?: string;
  readonly buyNowOn: boolean;
  readonly onToggleBuyNow: (val: boolean) => void;
  readonly buyNowPriceText: string;
  readonly onChangeBuyNowPriceText: (text: string) => void;
  readonly buyNowPriceError?: string;
  readonly buyNowMode: BuyNowMode;
  readonly onChangeBuyNowMode: (mode: BuyNowMode) => void;
  readonly auctionType: AuctionFormat;
  readonly onChangeAuctionType: (t: AuctionFormat) => void;
  readonly dutchTopText: string;
  readonly onChangeDutchTopText: (text: string) => void;
  readonly dutchEveryText: string;
  readonly onChangeDutchEveryText: (text: string) => void;
  readonly dutchError?: string;
  readonly minBidders: number;
  readonly onChangeMinBidders: (n: number) => void;
  // ADR 0087: null = the 10% default.
  readonly deposit?: number | null;
  readonly onChangeDeposit?: (n: number | null) => void;
  readonly depositError?: string;
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
}

export function SendToAuctionPricing({
  step,
  onSelectStep,
  customStepOn,
  onSelectCustomStep,
  customStepText,
  onChangeCustomStepText,
  customStepError,
  startPriceText,
  onChangeStartPriceText,
  startPriceError,
  buyNowOn,
  onToggleBuyNow,
  buyNowPriceText,
  onChangeBuyNowPriceText,
  buyNowPriceError,
  buyNowMode,
  onChangeBuyNowMode,
  auctionType,
  onChangeAuctionType,
  dutchTopText,
  onChangeDutchTopText,
  dutchEveryText,
  onChangeDutchEveryText,
  dutchError,
  minBidders,
  onChangeMinBidders,
  deposit = null,
  onChangeDeposit,
  depositError,
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
              1–168 giờ
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
            {AUCTION_FORMATS.find((m) => m.value === auctionType)?.label ?? "Trả giá lên"} • Khởi điểm: {formatVnd(parsedStart)} • Bước {formatVnd(step)} • ĐK ≥ {minBidders} người
            {auctionType === "English" && buyNowOn && parsedBuyNow > 0 ? ` • Mua ngay: ${formatVnd(parsedBuyNow)}` : ""}
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
          {AUCTION_STEPS.map((val) => {
            const isSelected = !customStepOn && step === val;
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tự nhập bước giá"
            accessibilityState={{ selected: customStepOn }}
            disabled={disabled}
            onPress={onSelectCustomStep}
            style={[
              styles.stepButton,
              styles.stepButtonWide,
              customStepOn && styles.stepButtonActive,
              disabled && { opacity: 0.6 },
            ]}
          >
            <Icon
              name={customStepOn ? "check" : "radio_button_unchecked" as any}
              size={14}
              color={customStepOn ? stitchTokens.gold : stitchTokens.subtleGray}
            />
            <AppText
              kind="bold"
              style={[styles.stepButtonText, customStepOn && styles.stepButtonTextActive]}
            >
              Tự nhập bước giá
            </AppText>
          </Pressable>
        </View>
        {customStepOn && (
          <>
            <View style={[styles.inputWrapper, Boolean(customStepError) && styles.inputWrapperError]}>
              <TextInput
                value={customStepText}
                onChangeText={(text) =>
                  onChangeCustomStepText(text.replace(/\D/g, "").slice(0, String(AUCTION_STEP_MAX).length))
                }
                keyboardType="number-pad"
                editable={!disabled}
                placeholder="0"
                placeholderTextColor={stitchTokens.subtleGray}
                accessibilityLabel="Bước giá tự nhập"
                style={styles.textInput}
              />
              <AppText kind="bold" style={styles.currencySuffix}>
                VNĐ
              </AppText>
            </View>
            <AppText kind="small" style={customStepError ? styles.errorText : styles.helpText}>
              {customStepError ?? "Bội số của 1.000đ, từ 1.000đ đến 10.000.000đ."}
            </AppText>
          </>
        )}
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
            Phạm vi hợp lệ: Từ {formatVnd(10000)} trở lên
          </AppText>
        )}
      </View>

      {/* ADR 0076: auction format */}
      <View style={[styles.fieldGroup, { marginTop: 10 }]}>
        <AppText kind="bold" style={styles.fieldLabel}>Kiểu đấu giá</AppText>
        <View style={styles.stepGrid} accessibilityRole="radiogroup">
          {AUCTION_FORMATS.filter((m) => !m.retired || m.value === auctionType).map((m) => {
            const isSelected = auctionType === m.value;
            return (
              <Pressable
                key={m.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled }}
                accessibilityLabel={`${m.label}. ${m.hint}`}
                disabled={disabled}
                onPress={() => onChangeAuctionType(m.value)}
                style={[styles.stepButton, isSelected && styles.stepButtonActive, disabled && { opacity: 0.6 }]}
              >
                <Icon name={isSelected ? "check" : "radio_button_unchecked" as any} size={14} color={isSelected ? stitchTokens.gold : stitchTokens.subtleGray} />
                <AppText kind="bold" style={[styles.stepButtonText, isSelected && styles.stepButtonTextActive]}>{m.label}</AppText>
              </Pressable>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            backgroundColor: stitchTokens.whiteAlpha88,
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: stitchTokens.goldBorder,
          }}
        >
          <Icon
            name={auctionType === "Dutch" ? "flame" : auctionType === "English" ? "gavel" : "lock"}
            size={15}
            color={stitchTokens.wineDark}
          />
          <AppText kind="small" style={[styles.infoText, { color: stitchTokens.deepCocoa }]}>
            {AUCTION_FORMATS.find((m) => m.value === auctionType)!.hint}
          </AppText>
        </View>
        {auctionType === "Dutch" && (
          <View
            style={{
              gap: 8,
              marginTop: 6,
              backgroundColor: stitchTokens.whiteAlpha70,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: stitchTokens.goldBorder,
            }}
          >
            <AppText kind="bold" style={styles.fieldLabel}>Giá mở đầu (cao nhất)</AppText>
            <View style={[styles.inputWrapper, Boolean(dutchError) && styles.inputWrapperError]}>
              <TextInput value={dutchTopText} onChangeText={(t) => onChangeDutchTopText(t.replace(/\D/g, ""))} keyboardType="number-pad"
                editable={!disabled} placeholder="0" placeholderTextColor={stitchTokens.subtleGray} style={styles.textInput} accessibilityLabel="Giá mở đầu" />
              <AppText kind="bold" style={styles.currencySuffix}>VNĐ</AppText>
            </View>
            <AppText kind="bold" style={styles.fieldLabel}>Giảm một bước sau mỗi</AppText>
            <View style={[styles.inputWrapper, Boolean(dutchError) && styles.inputWrapperError]}>
              <TextInput value={dutchEveryText} onChangeText={(t) => onChangeDutchEveryText(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad"
                editable={!disabled} placeholder="60" placeholderTextColor={stitchTokens.subtleGray} style={styles.textInput} accessibilityLabel="Số giây giữa hai lần giảm giá" />
              <AppText kind="bold" style={styles.currencySuffix}>giây</AppText>
            </View>
            <AppText kind="small" style={dutchError ? styles.errorText : styles.infoText}>
              {dutchError ?? "Giá khởi điểm phía trên là giá sàn. Mỗi lần giảm một bước giá, 10 giây đến 1 giờ."}
            </AppText>
          </View>
        )}
      </View>

      {/* ADR 0077: minimum registered bidders */}
      <View style={[styles.fieldGroup, { marginTop: 10 }]}>
        <View style={styles.labelWithHintRow}>
          <AppText kind="bold" style={styles.fieldLabel}>Số người đăng ký tối thiểu</AppText>
          <View style={styles.durationPill}>
            <AppText kind="small" style={styles.durationPillText}>
              {`Cọc: ${deposit !== null ? `${deposit.toLocaleString("vi-VN")}đ` : startPriceDeposit(startPriceText)}`}
            </AppText>
          </View>
        </View>
        <View style={styles.stepGrid} accessibilityRole="radiogroup">
          {MIN_BIDDER_OPTIONS.map((n) => {
            const isSelected = minBidders === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled }}
                accessibilityLabel={`Tối thiểu ${n} người đăng ký`}
                disabled={disabled}
                onPress={() => onChangeMinBidders(n)}
                style={[styles.stepButton, isSelected && styles.stepButtonActive, disabled && { opacity: 0.6 }]}
              >
                <AppText kind="bold" style={[styles.stepButtonText, isSelected && styles.stepButtonTextActive]}>{`${n} người`}</AppText>
              </Pressable>
            );
          })}
        </View>
        {/* ADR 0079: any number from 4 up beside the quick choices. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Giảm số người tối thiểu"
            disabled={disabled || minBidders <= AUCTION_MIN_BIDDERS_FLOOR}
            onPress={() => onChangeMinBidders(Math.max(AUCTION_MIN_BIDDERS_FLOOR, minBidders - 1))}
            style={[styles.stepButton, { minWidth: 48, flexGrow: 0, flexBasis: 48 }, (disabled || minBidders <= AUCTION_MIN_BIDDERS_FLOOR) && { opacity: 0.5 }]}
          >
            <AppText kind="bold" style={styles.stepButtonText}>−</AppText>
          </Pressable>
          <View
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              backgroundColor: stitchTokens.whiteAlpha90,
              borderWidth: 1,
              borderColor: stitchTokens.goldBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText kind="bold" style={{ color: stitchTokens.wineDark }} accessibilityLiveRegion="polite">
              {`Mở khi đủ ${minBidders} người đăng ký`}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tăng số người tối thiểu"
            disabled={disabled || minBidders >= AUCTION_MIN_BIDDERS_CAP}
            onPress={() => onChangeMinBidders(Math.min(AUCTION_MIN_BIDDERS_CAP, minBidders + 1))}
            style={[styles.stepButton, { minWidth: 48, flexGrow: 0, flexBasis: 48 }, disabled && { opacity: 0.5 }]}
          >
            <AppText kind="bold" style={styles.stepButtonText}>+</AppText>
          </Pressable>
        </View>
        <AppText kind="small" style={styles.infoText}>
          {`Người mua đặt cọc ${deposit !== null ? `${deposit.toLocaleString("vi-VN")}đ` : startPriceDeposit(startPriceText)} trước khi trả giá. Bạn hẹn giờ mở trong vòng 30 ngày; đến giờ mở nếu chưa đủ ${minBidders} người (ít nhất ${AUCTION_MIN_BIDDERS_FLOOR}), phiên chờ thêm tối đa 24 giờ và mở ngay khi đủ, quá hạn thì phiên bị hủy và hoàn cọc. Phiên chỉ bán khi có ít nhất hai người trả giá.`}
        </AppText>
      </View>

      {/* ADR 0087: the seller may raise the registration deposit. */}
      {parsedStart >= 10_000 && onChangeDeposit && (
        <View style={[styles.fieldGroup, { marginTop: 10 }]}>
          <AppText kind="bold" style={styles.fieldLabel}>Tiền cọc đăng ký</AppText>
          <View style={styles.stepGrid} accessibilityRole="radiogroup">
            {depositChoices(parsedStart).map((c) => {
              const current = deposit ?? auctionDepositFor(parsedStart);
              const isSelected = current === c.amount;
              return (
                <Pressable
                  key={c.amount}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, disabled }}
                  accessibilityLabel={`Tiền cọc ${c.amount.toLocaleString("vi-VN")} đồng, ${c.label}`}
                  disabled={disabled}
                  onPress={() => onChangeDeposit(c.amount === auctionDepositFor(parsedStart) ? null : c.amount)}
                  style={[styles.stepButton, isSelected && styles.stepButtonActive, disabled && { opacity: 0.6 }]}
                >
                  <AppText kind="bold" style={[styles.stepButtonText, isSelected && styles.stepButtonTextActive]}>{`${c.amount.toLocaleString("vi-VN")}đ`}</AppText>
                  <AppText kind="small" style={[styles.stepButtonText, isSelected && styles.stepButtonTextActive]}>{c.label}</AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText kind="small" style={depositError ? { color: stitchTokens.flashRed } : styles.infoText}>
            {depositError ??
              `Mặc định ${auctionDepositFor(parsedStart).toLocaleString("vi-VN")}đ (10% giá khởi điểm), tăng được tới ${auctionDepositMaxFor(parsedStart).toLocaleString("vi-VN")}đ (một nửa giá khởi điểm). Cọc cao có thể làm ít người đăng ký hơn. Người không thắng được hoàn cọc; người thắng không thanh toán thì mất cọc, và nếu sách không bán được bạn nhận một nửa số đó.`}
          </AppText>
        </View>
      )}

      {/* 3. Buy Now Option (Mua ngay) */}
      {auctionType === "English" && (
      <View style={styles.buyNowSection}>
        <View style={styles.buyNowToggleRow}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <AppText kind="bold" style={styles.buyNowTitle}>
              Cho phép mua ngay
            </AppText>
            <AppText kind="small" style={styles.buyNowSubtitle}>
              Còn dùng được sau lượt trả giá khi giá hiện tại thấp hơn giá mua ngay. Lượt trả giá chạm giá mua ngay cũng tính như mua ngay.
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
              Khi có người mua ngay
            </AppText>
            <View style={styles.stepGrid} accessibilityRole="radiogroup">
              {BUY_NOW_MODES.map((m) => {
                const isSelected = buyNowMode === m.value;
                return (
                  <Pressable
                    key={m.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled }}
                    accessibilityLabel={`${m.label}. ${m.hint}`}
                    disabled={disabled}
                    onPress={() => onChangeBuyNowMode(m.value)}
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
                      {m.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <AppText kind="small" style={[styles.infoText, { marginBottom: 10 }]}>
              {BUY_NOW_MODES.find((m) => m.value === buyNowMode)!.hint}
            </AppText>
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
      )}
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
    flexWrap: "wrap",
    gap: 10,
  },
  stepButton: {
    flexGrow: 1,
    flexBasis: "45%",
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
  stepButtonWide: {
    flexBasis: "100%",
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

// ADR 0077: the deposit the server will ask for (10% of the start price, ≥ 10.000đ).
function startPriceDeposit(text: string) {
  const n = Number(text.replace(/\D/g, ""));
  return n > 0 ? `${auctionDepositFor(n).toLocaleString("vi-VN")}đ` : "10% giá khởi điểm";
}
