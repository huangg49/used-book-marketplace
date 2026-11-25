import { useContext, useEffect, useState } from "react";
import { listingSellerFeeText } from "@used-books/session-client";
import { Animated, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import {
  AppText,
  Icon,
  Notice,
  TextScale,
  TextField,
  colors,
  formatVnd,
  layout,
  metrics,
  space,
  stitchTokens,
} from "../../core/ui";
import type { Errors, Form } from "./listing-form";

export type Anchor = (field: keyof Errors) => (node: View | null) => void;
const noAnchor: Anchor = () => () => {};

export function createAnchors() {
  const nodes = new Map<keyof Errors, View>();
  const anchor: Anchor = (field) => (node) => {
    if (node) nodes.set(field, node);
    else nodes.delete(field);
  };
  return { anchor, get: (field: keyof Errors) => nodes.get(field) };
}

// Stitch Condition Spec (Bậc A, B, C, D)
const conditionCards = [
  {
    value: "LikeNew",
    tier: "BẬC A",
    title: "Như Mới (Like New)",
    desc: "Gần như nguyên bản, không quăn góc, giấy trắng sáng.",
  },
  {
    value: "Good",
    tier: "BẬC B",
    title: "Tốt (Good)",
    desc: "Gáy chắc, ruột sạch, giấy ố ngà tự nhiên theo thời gian.",
  },
  {
    value: "Fair",
    tier: "BẬC C",
    title: "Khá (Fair)",
    desc: "Có nếp gấp đọc, sờn mép bìa, giấy ngả màu rơm.",
  },
  {
    value: "Worn",
    tier: "BẬC D",
    title: "Cũ nhiều (Worn)",
    desc: "Ấn bản sưu tầm thô mộc, có vết tích thời gian rõ.",
  },
] as const;

export function ConditionFields({
  form,
  onChange,
  disabled,
  errors,
  anchor = noAnchor,
}: {
  form: Form;
  onChange: (next: Form) => void;
  disabled: boolean;
  errors: Errors;
  anchor?: Anchor;
}) {
  return (
    <View style={{ gap: space.xl }}>
      {/* 2x2 Condition Grid */}
      <View ref={anchor("condition")} style={{ gap: space.sm }}>
        {form.bundle ? <Notice>Tình trạng chung theo cuốn thấp nhất. Sửa tình trạng từng cuốn ở bước Thông tin sách.</Notice> : null}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <AppText
            kind="label"
            color={stitchTokens.wine}
            style={{ fontWeight: "700", letterSpacing: 0.5 }}
          >
            ĐÁNH GIÁ TÌNH TRẠNG SÁCH
          </AppText>
          <AppText
            kind="small"
            color={stitchTokens.wine}
            style={{ fontWeight: "600", textDecorationLine: "underline" }}
          >
            Bảng chuẩn giám định ↗
          </AppText>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: space.sm,
          }}
        >
          {conditionCards.map((c) => {
            const isSelected = form.condition === c.value;

            return (
              <Pressable
                key={c.value}
                disabled={disabled || !!form.bundle}
                onPress={() => onChange({ ...form, condition: c.value })}
                accessibilityRole="button"
                accessibilityLabel={`${c.title}, ${c.tier}`}
                style={({ pressed }) => [
                  {
                    width: "48.5%",
                    minHeight: 110,
                    padding: space.sm,
                    borderRadius: 12,
                    backgroundColor: isSelected ? stitchTokens.roseWarmSurface : stitchTokens.warmIvory,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? stitchTokens.wine : stitchTokens.borderWarm,
                    justifyContent: "space-between",
                    shadowColor: isSelected ? stitchTokens.wine : stitchTokens.black,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isSelected ? 0.15 : 0.04,
                    shadowRadius: 2,
                    elevation: isSelected ? 2 : 1,
                  },
                  (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
                ]}
              >
                <View style={{ gap: 2 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: isSelected
                          ? stitchTokens.wine
                          : stitchTokens.sageGold,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <AppText
                        kind="small"
                        color={isSelected ? stitchTokens.gold : stitchTokens.wine}
                        style={{ fontSize: 9, fontWeight: "700" }}
                      >
                        {c.tier}
                      </AppText>
                    </View>
                    {isSelected ? (
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          backgroundColor: stitchTokens.wine,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name="check" size={12} color={stitchTokens.gold} />
                      </View>
                    ) : null}
                  </View>

                  <AppText
                    kind="bold"
                    color={stitchTokens.wineDark}
                    style={{ fontSize: 13, marginTop: 4 }}
                  >
                    {c.title}
                  </AppText>
                </View>

                <AppText
                  kind="small"
                  color={stitchTokens.subtleGray}
                  style={{ fontSize: 10, lineHeight: 14 }}
                  numberOfLines={3}
                >
                  {c.desc}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {errors.condition ? (
          <Notice tone="error">{errors.condition}</Notice>
        ) : null}
      </View>

      {/* Verification Questions (Segmented switches) */}
      <View style={{ gap: space.md }}>
        <AppText
          kind="label"
          color={stitchTokens.wine}
          style={{ fontWeight: "700", letterSpacing: 0.5 }}
        >
          KHẢO CHỨNG BẢN SÁCH
        </AppText>

        {/* Readable */}
        <View
          ref={anchor("readable")}
          style={{
            backgroundColor: stitchTokens.warmIvory,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: errors.readable ? colors.rustText : stitchTokens.borderWarm,
            padding: space.md,
            gap: space.sm,
          }}
        >
          <AppText kind="bold" color={stitchTokens.wineDark}>
            Nội dung có còn đọc rõ?
          </AppText>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {[
              { value: true, label: "Có, còn đọc rõ" },
              { value: false, label: "Không còn đọc rõ" },
            ].map((opt) => {
              const active = form.readable === opt.value;
              return (
                <Pressable
                  key={String(opt.value)}
                  disabled={disabled}
                  onPress={() => onChange({ ...form, readable: opt.value })}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: active ? stitchTokens.wine : stitchTokens.parchment,
                    borderWidth: 1,
                    borderColor: active ? stitchTokens.wine : stitchTokens.peachBorder,
                    alignItems: "center",
                  }}
                >
                  <AppText
                    kind="bold"
                    color={active ? stitchTokens.white : stitchTokens.subtleGray}
                    style={{ fontSize: 12 }}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {errors.readable ? (
            <Notice tone="error">{errors.readable}</Notice>
          ) : null}
        </View>

        {/* Missing Pages */}
        <View
          ref={anchor("hasMissingPages")}
          style={{
            backgroundColor: stitchTokens.warmIvory,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: errors.hasMissingPages ? colors.rustText : stitchTokens.borderWarm,
            padding: space.md,
            gap: space.sm,
          }}
        >
          <AppText kind="bold" color={stitchTokens.wineDark}>
            Sách có thiếu trang?
          </AppText>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {[
              { value: false, label: "Không thiếu trang" },
              { value: true, label: "Có thiếu trang" },
            ].map((opt) => {
              const active = form.hasMissingPages === opt.value;
              return (
                <Pressable
                  key={String(opt.value)}
                  disabled={disabled}
                  onPress={() => onChange({ ...form, hasMissingPages: opt.value })}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: active ? stitchTokens.wine : stitchTokens.parchment,
                    borderWidth: 1,
                    borderColor: active ? stitchTokens.wine : stitchTokens.peachBorder,
                    alignItems: "center",
                  }}
                >
                  <AppText
                    kind="bold"
                    color={active ? stitchTokens.white : stitchTokens.subtleGray}
                    style={{ fontSize: 12 }}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {errors.hasMissingPages ? (
            <Notice tone="error">{errors.hasMissingPages}</Notice>
          ) : null}
        </View>

        {/* Missing Essential Content */}
        <View
          ref={anchor("missingEssentialContent")}
          style={{
            backgroundColor: stitchTokens.warmIvory,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: errors.missingEssentialContent
              ? colors.rustText
              : stitchTokens.borderWarm,
            padding: space.md,
            gap: space.sm,
          }}
        >
          <AppText kind="bold" color={stitchTokens.wineDark}>
            Có thiếu phần nội dung trọng yếu?
          </AppText>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {[
              { value: false, label: "Không thiếu nội dung chính" },
              { value: true, label: "Có thiếu nội dung trọng yếu" },
            ].map((opt) => {
              const active = form.missingEssentialContent === opt.value;
              return (
                <Pressable
                  key={String(opt.value)}
                  disabled={disabled}
                  onPress={() =>
                    onChange({ ...form, missingEssentialContent: opt.value })
                  }
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: active ? stitchTokens.wine : stitchTokens.parchment,
                    borderWidth: 1,
                    borderColor: active ? stitchTokens.wine : stitchTokens.peachBorder,
                    alignItems: "center",
                  }}
                >
                  <AppText
                    kind="bold"
                    color={active ? stitchTokens.white : stitchTokens.subtleGray}
                    style={{ fontSize: 12 }}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {errors.missingEssentialContent ? (
            <Notice tone="error">{errors.missingEssentialContent}</Notice>
          ) : null}
        </View>
      </View>

      {/* Detailed Description Fields */}
      <View style={{ gap: space.md }}>
        <AppText
          kind="label"
          color={stitchTokens.wine}
          style={{ fontWeight: "700", letterSpacing: 0.5 }}
        >
          CHI TIẾT ẤN BẢN & MÔ TẢ
        </AppText>

        {[
          {
            key: "pages" as const,
            label: "Ruột sách và trang thiếu",
            hint: "Đủ trang hay thiếu trang nào? Có ố, rách hoặc bong trang không?",
            max: 1000,
          },
          {
            key: "coverNote" as const,
            label: "Bìa và gáy sách",
            hint: "Mô tả góc sờn, nếp gấp hoặc phần bong gáy.",
            max: 1000,
          },
          {
            key: "notes" as const,
            label: "Ghi chú và đánh dấu",
            hint: "Có viết, tô hoặc gạch chân không? Nếu không, ghi ‘Không có’.",
            max: 1000,
          },
          {
            key: "accessories" as const,
            label: "Phụ kiện đi kèm",
            hint: "Ví dụ: áo bìa, bookmark, thẻ... Nếu không, ghi ‘Không có’.",
            max: 1000,
          },
          {
            key: "description" as const,
            label: "Vài dòng gửi người đọc sau (Mô tả chung)",
            hint: "Từ 30 đến 5.000 ký tự: những điều người đọc sau nên biết về cuốn sách này.",
            max: 5000,
          },
        ].map(({ key, label, hint, max }) => {
          const val = form[key];
          const charCount = [...val].length;

          return (
            <View
              key={key}
              ref={anchor(key)}
              style={{
                backgroundColor: stitchTokens.warmIvory,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: errors[key] ? colors.rustText : stitchTokens.borderWarm,
                padding: space.md,
                gap: space.xs,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <AppText
                  kind="bold"
                  color={stitchTokens.wineDark}
                  style={{ flex: 1, fontSize: 14, lineHeight: 18 }}
                >
                  {label}
                </AppText>
                <AppText
                  kind="small"
                  color={stitchTokens.subtleGray}
                  style={{ flexShrink: 0, fontSize: 11, paddingTop: 1 }}
                >
                  {`${charCount}/${max}`}
                </AppText>
              </View>

              <TextField
                accessibilityLabel={label}
                hint={hint}
                multiline
                value={val}
                editable={!disabled}
                error={errors[key]}
                onChangeText={(v) => onChange({ ...form, [key]: v })}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const transactionModes = [
  { value: "Sale", title: "Bán sách", icon: "wallet" },
  { value: "Exchange", title: "Đổi sách", icon: "sync" },
  { value: "Both", title: "Bán & đổi", icon: "tag" },
] as const;

const selectedModeLift = -3;

function TransactionModeOption({
  mode,
  selected,
  stacked,
  disabled,
  onSelect,
}: {
  mode: (typeof transactionModes)[number];
  selected: boolean;
  stacked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [lift] = useState(() => new Animated.Value(selected ? selectedModeLift : 0));

  useEffect(() => {
    const animation = Animated.spring(lift, {
      toValue: selected ? selectedModeLift : 0,
      stiffness: 380,
      damping: 29,
      mass: 0.7,
      overshootClamping: true,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [lift, selected]);

  return (
    <Pressable
      disabled={disabled}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={mode.title}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      aria-disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        pricingStyles.modeTarget,
        stacked && pricingStyles.modeTargetStacked,
        pressed && pricingStyles.pressed,
        disabled && pricingStyles.disabled,
      ]}
    >
      <Animated.View
        style={[
          pricingStyles.modeOption,
          stacked && pricingStyles.modeOptionStacked,
          selected && pricingStyles.modeOptionSelected,
          focused && layout.focus,
          focused && selected && pricingStyles.modeOptionSelectedFocus,
          { transform: [{ translateY: lift }] },
        ]}
      >
        <View style={[pricingStyles.modeIcon, selected && pricingStyles.modeIconSelected]}>
          <Icon name={mode.icon} size={17} color={selected ? stitchTokens.gold : stitchTokens.wine} />
        </View>
        <AppText
          kind="bold"
          color={selected ? stitchTokens.goldLight : stitchTokens.wineDark}
          style={[pricingStyles.modeTitle, stacked && pricingStyles.modeTitleStacked]}
        >
          {mode.title}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

type ExchangePreferences = NonNullable<Form["exchangePreferences"]>;

function ExchangePreferencesPanel({
  preferences,
  disabled,
  onChange,
}: {
  preferences: Form["exchangePreferences"];
  disabled: boolean;
  onChange: (preferences: ExchangePreferences) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const summary = [preferences?.targetCategory, preferences?.targetAuthor, preferences?.targetDescription]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ");
  const title = expanded || summary ? "Tiêu chí đổi sách" : "Thêm tiêu chí đổi sách";
  const update = (key: keyof ExchangePreferences, value: string) => {
    onChange({ ...preferences, [key]: value });
  };

  return (
    <View style={pricingStyles.preferencesPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded((open) => !open)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          pricingStyles.preferencesToggle,
          focused && layout.focus,
          pressed && pricingStyles.pressed,
        ]}
      >
        <View style={pricingStyles.preferencesIcon}>
          <Icon name="sync" size={16} color={stitchTokens.wine} />
        </View>
        <View style={pricingStyles.preferencesHeading}>
          <AppText kind="bold" color={stitchTokens.wine}>{title}</AppText>
          <AppText kind="small" color={stitchTokens.deepCocoa} numberOfLines={2}>
            {!expanded && summary ? summary : "Tùy chọn"}
          </AppText>
        </View>
        <Icon name={expanded ? "chevronUp" : "chevronDown"} size={16} color={stitchTokens.wine} />
      </Pressable>

      {expanded ? (
        <View style={pricingStyles.preferencesFields}>
          <TextField
            label="Thể loại"
            placeholder="Ví dụ: Văn học, Tâm lý"
            value={preferences?.targetCategory ?? ""}
            editable={!disabled}
            onChangeText={(value) => update("targetCategory", value)}
            maxLength={100}
          />
          <TextField
            label="Tác giả"
            placeholder="Ví dụ: Haruki Murakami"
            value={preferences?.targetAuthor ?? ""}
            editable={!disabled}
            onChangeText={(value) => update("targetAuthor", value)}
            maxLength={150}
          />
          <TextField
            label="Ghi chú"
            placeholder="Ví dụ: Ưu tiên bản dịch mới"
            multiline
            style={pricingStyles.preferencesNote}
            value={preferences?.targetDescription ?? ""}
            editable={!disabled}
            onChangeText={(value) => update("targetDescription", value)}
            maxLength={500}
          />
        </View>
      ) : null}
    </View>
  );
}

const AUCTION_DECLARED_PRESETS = [100_000, 200_000, 500_000] as const;

export function PricingFields({
  form,
  onChange,
  disabled,
  errors,
  anchor = noAnchor,
  auction = false,
}: {
  form: Form;
  onChange: (next: Form) => void;
  disabled: boolean;
  errors: Errors;
  anchor?: Anchor;
  // ADR 0042: fixed Sale; the price is the declared value, not a shop price.
  auction?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const textScale = useContext(TextScale);
  const [groupWidth, setGroupWidth] = useState<number>();
  const stacked =
    (groupWidth ?? width - 2 * (space.xl + space.md)) < 300 ||
    fontScale * textScale >= 1.25;
  const hasSalePrice = form.mode === "Sale" || form.mode === "Both";
  const hasExchangeValue = form.mode === "Exchange" || form.mode === "Both";
  const saleLabel = auction ? "Giá trị khai báo" : form.bundle ? "Giá cả bộ" : "Giá bán";
  const parsedDeclared = /^\d+$/.test(form.salePrice.trim())
    ? Number(form.salePrice.trim())
    : null;
  const validDeclared =
    parsedDeclared !== null && parsedDeclared >= 10_000 && parsedDeclared <= 1_000_000;

  if (auction) {
    return (
      <View style={pricingStyles.auctionWrap}>
        <View style={pricingStyles.auctionHeader}>
          <View style={pricingStyles.auctionHeaderLeft}>
            <View style={pricingStyles.auctionIconBadge}>
              <Icon name="shield" size={16} color={stitchTokens.wine} />
            </View>
            <View style={pricingStyles.auctionHeaderText}>
              <AppText kind="bold" style={pricingStyles.auctionTitle}>
                Mức giá trị khai báo
              </AppText>
              <AppText kind="small" color={stitchTokens.brownMuted}>
                Từ 10.000 đến 1.000.000 ₫
              </AppText>
            </View>
          </View>
          {validDeclared ? (
            <View style={pricingStyles.auctionPreviewPill}>
              <AppText kind="bold" style={pricingStyles.auctionPreviewText}>
                {formatVnd(parsedDeclared)}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={pricingStyles.presetRow}>
          {AUCTION_DECLARED_PRESETS.map((amount) => {
            const active = parsedDeclared === amount;
            return (
              <Pressable
                key={amount}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => onChange({ ...form, salePrice: String(amount) })}
                style={({ pressed }) => [
                  pricingStyles.presetChip,
                  active && pricingStyles.presetChipActive,
                  disabled && pricingStyles.disabled,
                  pressed && !disabled && pricingStyles.pressed,
                ]}
              >
                <AppText
                  kind="bold"
                  numberOfLines={1}
                  style={[
                    pricingStyles.presetChipText,
                    active && pricingStyles.presetChipTextActive,
                  ]}
                >
                  {formatVnd(amount)}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View ref={anchor("salePrice")}>
          <TextField
            label="Nhập số tiền (VNĐ)"
            accessibilityLabel={saleLabel + " (đồng)"}
            hint={
              validDeclared
                ? `Tương đương ${formatVnd(parsedDeclared)}`
                : "Nhập số nguyên không dấu (ví dụ: 200000)"
            }
            suffix="₫"
            placeholder="Ví dụ: 200000"
            keyboardType="number-pad"
            value={form.salePrice}
            editable={!disabled}
            onChangeText={(salePrice) => onChange({ ...form, salePrice })}
            error={errors.salePrice}
            maxLength={12}
          />
        </View>

        <View style={pricingStyles.auctionGuideBox}>
          <View style={pricingStyles.auctionGuideRow}>
            <View style={pricingStyles.auctionGuideIcon}>
              <Icon name="shield" size={14} color={stitchTokens.wine} />
            </View>
            <View style={pricingStyles.auctionHeaderText}>
              <AppText kind="bold" style={pricingStyles.auctionGuideTitle}>
                Mức bồi thường tại điểm
              </AppText>
              <AppText kind="small" style={pricingStyles.auctionGuideText}>
                Là mức bồi thường tối đa nếu sách hư hỏng hoặc thất lạc trong thời gian điểm kiểm định lưu giữ.
              </AppText>
            </View>
          </View>
          <View style={pricingStyles.auctionGuideDivider} />
          <View style={pricingStyles.auctionGuideRow}>
            <View style={pricingStyles.auctionGuideIcon}>
              <Icon name="gavel" size={14} color={stitchTokens.wine} />
            </View>
            <View style={pricingStyles.auctionHeaderText}>
              <AppText kind="bold" style={pricingStyles.auctionGuideTitle}>
                Không phải giá khởi điểm đấu giá
              </AppText>
              <AppText kind="small" style={pricingStyles.auctionGuideText}>
                Sau khi sách được duyệt, bạn sẽ chọn điểm gửi, giá khởi điểm, bước giá và mua ngay ở màn Gửi sách đấu giá.
              </AppText>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.xl }}>
      <View
        ref={anchor("mode")}
        style={[pricingStyles.modeField, (auction || form.bundle) && { display: "none" }]}
      >
        <AppText
          kind="label"
          color={stitchTokens.wine}
          style={{ fontWeight: "700", letterSpacing: 0.5 }}
        >
          PHƯƠNG THỨC GIAO DỊCH
        </AppText>

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Phương thức giao dịch"
          onLayout={({ nativeEvent }) => setGroupWidth(nativeEvent.layout.width)}
          style={[pricingStyles.modeGroup, stacked && pricingStyles.modeGroupStacked]}
        >
          {transactionModes.map((mode) => (
            <TransactionModeOption
              key={mode.value}
              mode={mode}
              selected={form.mode === mode.value}
              stacked={stacked}
              disabled={disabled}
              onSelect={() => onChange({ ...form, mode: mode.value })}
            />
          ))}
        </View>

        {errors.mode ? <Notice tone="error">{errors.mode}</Notice> : null}
      </View>

      {hasSalePrice || hasExchangeValue ? (
        <View style={pricingStyles.amountPanel}>
          {hasSalePrice && hasExchangeValue ? (
            <AppText kind="shelfTitle" color={stitchTokens.wineDark}>
              Giá & giá trị đổi
            </AppText>
          ) : null}
          {hasSalePrice ? (
            <View ref={anchor("salePrice")}>
              <TextField
                label={saleLabel}
                accessibilityLabel={saleLabel + " (đồng)"}
                hint={auction ? "Mức bồi thường tối đa nếu sách gặp sự cố tại điểm." : listingSellerFeeText}
                suffix="₫"
                placeholder="125000"
                keyboardType="number-pad"
                value={form.salePrice}
                editable={!disabled}
                onChangeText={(salePrice) => onChange({ ...form, salePrice })}
                error={errors.salePrice}
                maxLength={12}
              />
            </View>
          ) : null}
          {hasExchangeValue ? (
            <View ref={anchor("exchangeValue")}>
              <TextField
                label="Giá trị đổi"
                accessibilityLabel="Giá trị đổi (đồng)"
                hint="Mức tham chiếu khi đổi sách."
                suffix="₫"
                placeholder="120000"
                keyboardType="number-pad"
                value={form.exchangeValue}
                editable={!disabled}
                onChangeText={(exchangeValue) => onChange({ ...form, exchangeValue })}
                error={errors.exchangeValue}
                maxLength={12}
              />
            </View>
          ) : null}
          <AppText kind="small" color={stitchTokens.deepCocoa} style={pricingStyles.amountRange}>
            {hasSalePrice && hasExchangeValue ? "Mỗi mức từ" : "Từ"} 10.000 đến 1.000.000 ₫
          </AppText>
        </View>
      ) : null}

      {!auction && hasExchangeValue ? (
        <ExchangePreferencesPanel
          preferences={form.exchangePreferences}
          disabled={disabled}
          onChange={(exchangePreferences) => onChange({ ...form, exchangePreferences })}
        />
      ) : null}
    </View>
  );
}

const pricingStyles = StyleSheet.create({
  modeField: {
    gap: space.sm,
  },
  modeGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.sm,
  },
  modeGroupStacked: {
    flexDirection: "column",
  },
  modeTarget: {
    flex: 1,
    minWidth: 0,
    minHeight: 82,
  },
  modeTargetStacked: {
    flex: 0,
    minHeight: 56,
  },
  modeOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
    paddingVertical: space.sm,
    gap: space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    backgroundColor: stitchTokens.warmIvory,
  },
  modeOptionStacked: {
    flexDirection: "row",
    paddingHorizontal: space.md,
    gap: space.md,
  },
  modeOptionSelected: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
    shadowColor: stitchTokens.wineDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 4,
  },
  modeOptionSelectedFocus: {
    borderColor: stitchTokens.gold,
  },
  modeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  modeIconSelected: {
    backgroundColor: stitchTokens.whiteAlpha14,
  },
  modeTitle: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  modeTitleStacked: { flex: 1, minWidth: 0, textAlign: "left" },
  amountPanel: {
    backgroundColor: stitchTokens.parchment,
    borderColor: stitchTokens.borderWarm,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
    gap: space.md,
  },
  amountRange: {
    borderTopWidth: 1,
    borderColor: stitchTokens.borderWarm,
    paddingTop: space.sm,
  },
  auctionWrap: {
    gap: space.md,
  },
  auctionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  auctionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  auctionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: stitchTokens.roseWarmSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  auctionHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  auctionTitle: {
    fontSize: 15,
    color: stitchTokens.wineDark,
  },
  auctionPreviewPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: stitchTokens.roseWarmSurface,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
  auctionPreviewText: {
    fontSize: 12,
    color: stitchTokens.wine,
    fontVariant: ["tabular-nums"],
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetChip: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    backgroundColor: stitchTokens.parchment,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActive: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.wine,
  },
  presetChipText: {
    fontSize: 12,
    color: stitchTokens.wineDark,
    fontVariant: ["tabular-nums"],
  },
  presetChipTextActive: {
    color: stitchTokens.gold,
  },
  auctionGuideBox: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    padding: 12,
    gap: 10,
  },
  auctionGuideRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  auctionGuideIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  auctionGuideTitle: {
    fontSize: 13,
    color: stitchTokens.wineDark,
  },
  auctionGuideText: {
    fontSize: 12,
    lineHeight: 18,
    color: stitchTokens.brownMuted,
  },
  auctionGuideDivider: {
    height: 1,
    backgroundColor: stitchTokens.borderWarm,
  },
  preferencesPanel: {
    backgroundColor: stitchTokens.warmIvory,
    borderColor: stitchTokens.borderWarm,
    borderWidth: 1,
    borderRadius: 12,
  },
  preferencesToggle: {
    minHeight: metrics.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: 12,
  },
  preferencesIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTokens.roseParchment,
    alignItems: "center",
    justifyContent: "center",
  },
  preferencesHeading: { flex: 1, minWidth: 0 },
  preferencesFields: {
    borderTopWidth: 1,
    borderColor: stitchTokens.borderWarm,
    padding: space.md,
    gap: space.md,
  },
  preferencesNote: { minHeight: 76 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
});
