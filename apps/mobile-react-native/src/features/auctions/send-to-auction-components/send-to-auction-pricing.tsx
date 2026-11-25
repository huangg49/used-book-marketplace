import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import {
  AppText,
  AppTextInput,
  Icon,
  TextField,
  formatVnd,
  radius,
  space,
  stitchTokens,
  type TextFieldRef,
} from "../../../core/ui";
import {
  AUCTION_MIN_BIDDERS_CAP,
  AUCTION_MIN_BIDDERS_FLOOR,
  AUCTION_STEPS,
  AUCTION_STEP_MAX,
  BUY_NOW_MODES,
  auctionDepositFor,
  depositChoices,
  type AuctionFormat,
  type AuctionStep,
  type BuyNowMode,
} from "../auctions-model";

const QUICK_MIN_BIDDERS = [4, 6, 10] as const;

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
  readonly deposit?: number | null;
  readonly onChangeDeposit?: (n: number | null) => void;
  readonly depositError?: string;
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radioDot, selected && styles.radioDotSelected]}>
      {selected ? <View style={styles.radioInner} /> : null}
    </View>
  );
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
}: SendToAuctionPricingProps) {
  const [prevMin, setPrevMin] = useState(minBidders);
  const [biddersText, setBiddersText] = useState(String(minBidders));
  const [biddersFocused, setBiddersFocused] = useState(false);
  const biddersInputRef = useRef<TextFieldRef>(null);
  if (prevMin !== minBidders) {
    setPrevMin(minBidders);
    setBiddersText(String(minBidders));
  }

  const handleBiddersChange = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 4);
    setBiddersText(clean);
    if (!clean) return;
    const n = Number(clean);
    if (n >= AUCTION_MIN_BIDDERS_FLOOR && n <= AUCTION_MIN_BIDDERS_CAP) {
      onChangeMinBidders(n);
    }
  };

  const handleBiddersBlur = () => {
    setBiddersFocused(false);
    const n = Number(biddersText);
    const clamped = !biddersText || Number.isNaN(n)
      ? AUCTION_MIN_BIDDERS_FLOOR
      : Math.min(AUCTION_MIN_BIDDERS_CAP, Math.max(AUCTION_MIN_BIDDERS_FLOOR, n));
    setBiddersText(String(clamped));
    setPrevMin(clamped);
    if (clamped !== minBidders) onChangeMinBidders(clamped);
  };

  const parsedStart = Number(startPriceText) || 0;
  const parsedBuyNow = Number(buyNowPriceText) || 0;
  const parsedDutchTop = Number(dutchTopText) || 0;
  const parsedCustomStep = Number(customStepText) || 0;
  const activeStep = customStepOn && !customStepError && parsedCustomStep > 0 ? parsedCustomStep : step;
  const effectiveDeposit = deposit ?? (parsedStart >= 10_000 ? auctionDepositFor(parsedStart) : null);

  return (
    <View style={styles.card}>
      {/* Card Header */}
      <View style={styles.headerRow}>
        <View style={styles.stepIcon}>
          <Icon name="tag" size={16} color={stitchTokens.wine} />
        </View>
        <View style={styles.flexOne}>
          <AppText kind="bold" style={styles.title}>Thiết lập giá phiên</AppText>
          <AppText kind="small" color={stitchTokens.brownMuted}>
            Đấu giá trả giá lên · Giá không thể đổi sau khi phiên mở
          </AppText>
        </View>
      </View>

      {/* Hình thức đấu giá hidden per owner request (matching CreateAuctionPage.tsx on Web) */}

      {/* 1. Bid Step */}
      <View style={styles.section}>
        <AppText kind="bold" style={styles.sectionLabel}>Bước giá tối thiểu</AppText>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {AUCTION_STEPS.map((value) => {
            const isSelected = !customStepOn && step === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled }}
                disabled={disabled}
                onPress={() => onSelectStep(value)}
                style={({ pressed }) => [
                  styles.gridBtn,
                  isSelected && styles.gridBtnSelected,
                  disabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <AppText kind="bold" style={[styles.gridBtnText, isSelected && styles.gridBtnTextSelected]}>
                  {formatVnd(value)}
                </AppText>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: customStepOn, disabled }}
            disabled={disabled}
            onPress={onSelectCustomStep}
            style={({ pressed }) => [
              styles.gridBtn,
              customStepOn && styles.gridBtnSelected,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <AppText kind="bold" style={[styles.gridBtnText, customStepOn && styles.gridBtnTextSelected]}>
              Tự nhập
            </AppText>
          </Pressable>
        </View>

        {customStepOn ? (
          <TextField
            label="Bước giá tự chọn (VNĐ)"
            keyboardType="number-pad"
            value={customStepText}
            editable={!disabled}
            placeholder="Ví dụ: 15000"
            onChangeText={(t) => onChangeCustomStepText(t.replace(/\D/g, ""))}
            hint={
              parsedCustomStep > 0
                ? `${formatVnd(parsedCustomStep)} · Chia hết cho 1.000 ₫, tối đa ${formatVnd(AUCTION_STEP_MAX)}`
                : `Bội số 1.000 ₫, từ 1.000 ₫ đến ${formatVnd(AUCTION_STEP_MAX)}`
            }
            error={customStepError}
          />
        ) : null}
      </View>

      {/* 3. Start Price (or Floor Price for Dutch) */}
      <View style={styles.section}>
        <TextField
          label={auctionType === "Dutch" ? "Giá sàn tối thiểu (VNĐ)" : "Giá khởi điểm (VNĐ)"}
          keyboardType="number-pad"
          value={startPriceText}
          editable={!disabled}
          placeholder="Ví dụ: 120000"
          onChangeText={(t) => onChangeStartPriceText(t.replace(/\D/g, ""))}
          hint={
            parsedStart > 0
              ? `${formatVnd(parsedStart)} · Bội số của bước ${formatVnd(activeStep)}`
              : `Từ 10.000 ₫, chia hết cho bước ${formatVnd(activeStep)}`
          }
          error={startPriceError}
        />

        {auctionType === "Dutch" ? (
          <View style={styles.dutchFields}>
            <TextField
              label="Giá mở đầu (VNĐ)"
              keyboardType="number-pad"
              value={dutchTopText}
              editable={!disabled}
              placeholder="Cao hơn giá sàn"
              onChangeText={(t) => onChangeDutchTopText(t.replace(/\D/g, ""))}
              hint={
                parsedDutchTop > 0
                  ? `${formatVnd(parsedDutchTop)} · Giá bắt đầu giảm dần xuống giá sàn`
                  : "Cao hơn giá sàn một số bước giá"
              }
            />
            <TextField
              label="Chu kỳ giảm giá (giây)"
              keyboardType="number-pad"
              value={dutchEveryText}
              editable={!disabled}
              placeholder="60"
              onChangeText={(t) => onChangeDutchEveryText(t.replace(/\D/g, ""))}
              hint="Mỗi lần giảm 1 bước giá (từ 10 giây đến 3.600 giây)"
              error={dutchError}
            />
          </View>
        ) : null}
      </View>

      {/* 4. Min Bidders & Deposit */}
      <View style={styles.section}>
        <AppText kind="bold" style={styles.sectionLabel}>Số người đăng ký tối thiểu</AppText>

        {/* 3 quick presets on a single even row */}
        <View style={styles.quickThreeRow} accessibilityRole="radiogroup">
          {QUICK_MIN_BIDDERS.map((n) => {
            const isSelected = minBidders === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled }}
                disabled={disabled}
                onPress={() => onChangeMinBidders(n)}
                style={({ pressed }) => [
                  styles.quickThreeBtn,
                  isSelected && styles.gridBtnSelected,
                  disabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <AppText kind="bold" style={[styles.gridBtnText, isSelected && styles.gridBtnTextSelected]}>
                  {`${n} người`}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Full-width unified stepper + direct numeric input (type 100 instantly) */}
        <View
          {...(Platform.OS === "web" ? { dataSet: { focusSurface: "true" } } : {})}
          style={[styles.stepperBar, biddersFocused && styles.stepperBarFocused]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Giảm số người tối thiểu"
            disabled={disabled || minBidders <= AUCTION_MIN_BIDDERS_FLOOR}
            onPress={() => onChangeMinBidders(Math.max(AUCTION_MIN_BIDDERS_FLOOR, minBidders - 1))}
            style={({ pressed }) => [
              styles.stepIconBtn,
              (disabled || minBidders <= AUCTION_MIN_BIDDERS_FLOOR) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <AppText kind="bold" style={styles.stepIconBtnText}>−</AppText>
          </Pressable>

          <Pressable
            accessible={false}
            disabled={disabled}
            onPress={() => biddersInputRef.current?.focus()}
            style={styles.stepperInputWrap}
          >
            <AppTextInput
              ref={biddersInputRef}
              composite
              accessibilityLabel="Nhập số người đăng ký tối thiểu"
              keyboardType="number-pad"
              value={biddersText}
              editable={!disabled}
              maxLength={4}
              cursorColor={stitchTokens.wine}
              selectionColor={stitchTokens.roseWarmSurface}
              onFocus={() => setBiddersFocused(true)}
              onBlur={handleBiddersBlur}
              onChangeText={handleBiddersChange}
              style={styles.stepperInput}
            />
            <AppText kind="small" color={stitchTokens.brownMuted} style={styles.stepperUnit}>
              người
            </AppText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tăng số người tối thiểu"
            disabled={disabled || minBidders >= AUCTION_MIN_BIDDERS_CAP}
            onPress={() => onChangeMinBidders(Math.min(AUCTION_MIN_BIDDERS_CAP, minBidders + 1))}
            style={({ pressed }) => [
              styles.stepIconBtn,
              (disabled || minBidders >= AUCTION_MIN_BIDDERS_CAP) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <AppText kind="bold" style={styles.stepIconBtnText}>+</AppText>
          </Pressable>
        </View>

        <AppText kind="small" color={stitchTokens.brownMuted} numberOfLines={1} style={styles.helperOneLine}>
          {`Từ ${AUCTION_MIN_BIDDERS_FLOOR}–${AUCTION_MIN_BIDDERS_CAP.toLocaleString("vi-VN")} người · Cọc ${effectiveDeposit !== null ? formatVnd(effectiveDeposit) : "10% giá khởi điểm"}`}
        </AppText>

        {parsedStart >= 10_000 && onChangeDeposit ? (
          <View style={styles.subBlock}>
            <AppText kind="bold" style={styles.subLabel}>Mức tiền cọc đăng ký</AppText>
            <View style={styles.depositGrid} accessibilityRole="radiogroup">
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
                    style={({ pressed }) => [
                      styles.depositBtn,
                      isSelected && styles.gridBtnSelected,
                      disabled && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText kind="bold" style={[styles.gridBtnText, isSelected && styles.gridBtnTextSelected]}>
                      {formatVnd(c.amount)}
                    </AppText>
                    <AppText style={[styles.depositSubText, isSelected && styles.depositSubTextSelected]}>
                      {c.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {depositError ? (
              <AppText kind="small" style={styles.errorText}>{depositError}</AppText>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* 5. Buy Now (English only) */}
      {auctionType === "English" ? (
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <View style={styles.flexOne}>
              <AppText kind="bold" style={styles.sectionLabel}>Cho phép mua ngay</AppText>
              <AppText kind="small" color={stitchTokens.brownMuted}>
                Người mua chốt ngay theo giá bạn đặt
              </AppText>
            </View>
            <Switch
              accessibilityLabel="Cho phép mua ngay"
              value={buyNowOn}
              onValueChange={onToggleBuyNow}
              disabled={disabled}
              trackColor={{ false: stitchTokens.switchTrackFalse, true: stitchTokens.wine }}
              thumbColor={buyNowOn ? stitchTokens.gold : stitchTokens.whiteSurface}
            />
          </View>

          {buyNowOn ? (
            <View style={styles.subBlock}>
              <AppText kind="bold" style={styles.subLabel}>Khi có người mua ngay</AppText>
              <View style={styles.optionList} accessibilityRole="radiogroup">
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
                      style={({ pressed }) => [
                        styles.formatRow,
                        isSelected && styles.formatRowSelected,
                        disabled && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <RadioDot selected={isSelected} />
                      <View style={styles.flexOne}>
                        <AppText kind="bold" style={[styles.formatTitle, isSelected && styles.formatTitleSelected]}>
                          {m.label}
                        </AppText>
                        <AppText kind="small" color={stitchTokens.brownMuted} style={styles.helper}>
                          {m.hint}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <TextField
                label="Giá mua ngay (VNĐ)"
                keyboardType="number-pad"
                value={buyNowPriceText}
                editable={!disabled}
                placeholder="Cao hơn giá khởi điểm"
                onChangeText={(t) => onChangeBuyNowPriceText(t.replace(/\D/g, ""))}
                hint={
                  parsedBuyNow > 0
                    ? `${formatVnd(parsedBuyNow)} · Cao hơn giá khởi điểm ít nhất 1 bước giá`
                    : "Bằng giá khởi điểm cộng thêm ít nhất 1 bước giá"
                }
                error={buyNowPriceError}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: space.lg,
    gap: space.md,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, color: stitchTokens.wineDark },

  section: {
    borderTopWidth: 1,
    borderTopColor: stitchTokens.borderWarm,
    paddingTop: space.md,
    gap: space.sm,
  },
  sectionLabel: { fontSize: 14, color: stitchTokens.wineDark },
  subBlock: { gap: space.sm, paddingTop: 4 },
  subLabel: { fontSize: 13, color: stitchTokens.deepCocoa },
  helper: { lineHeight: 18 },
  errorText: { color: stitchTokens.flashRed, lineHeight: 18 },

  optionList: { gap: 8 },
  formatRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    backgroundColor: stitchTokens.parchment,
  },
  formatRowSelected: {
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  formatTitle: { fontSize: 14, color: stitchTokens.deepCocoa },
  formatTitleSelected: { color: stitchTokens.wineDark },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.whiteSurface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioDotSelected: { borderColor: stitchTokens.wine },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: stitchTokens.wine },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridBtn: {
    minHeight: 46,
    flexBasis: "30%",
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  gridBtnSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  gridBtnText: {
    fontSize: 13,
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  gridBtnTextSelected: { color: stitchTokens.warmIvory },

  depositGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  depositBtn: {
    minHeight: 54,
    flexBasis: "46%",
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  depositSubText: { fontSize: 11, color: stitchTokens.brownMuted, textAlign: "center" },
  depositSubTextSelected: { color: stitchTokens.gold },

  dutchFields: { gap: space.sm, paddingTop: 4 },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  quickThreeRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickThreeBtn: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.parchment,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    padding: 4,
    gap: 6,
  },
  stepperBarFocused: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.whiteSurface,
  },
  stepIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconBtnText: { fontSize: 18, color: stitchTokens.wineDark },
  stepperInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
  },
  stepperInput: {
    minWidth: 44,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  stepperUnit: { fontSize: 13, fontWeight: "600" },
  helperOneLine: { fontSize: 12, lineHeight: 17 },

  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
