import { Pressable, View } from "react-native";
import {
  AppText,
  Icon,
  Notice,
  TextField,
  colors,
  space,
  stitchTokens,
} from "../../core/ui";
import type { Form, Errors } from "./listing-form";

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
                disabled={disabled}
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

// Stitch Transaction & Pricing Component
export function PricingFields({
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
  const modes = [
    {
      value: "Sale" as const,
      title: "Bán trực tiếp",
      subtitle: "Nhận tiền VND",
      desc: "Chuyền sách lấy tiền mặt",
    },
    {
      value: "Exchange" as const,
      title: "Đổi Lật-Xu",
      subtitle: "Đổi đọc tác phẩm",
      desc: "Tích lũy xu để đổi sách khác",
    },
    {
      value: "Both" as const,
      title: "Cả bán & đổi",
      subtitle: "Linh hoạt nhất",
      desc: "Người mua chọn hình thức",
    },
  ];

  return (
    <View style={{ gap: space.xl }}>
      {/* Mode selection 3 cards */}
      <View ref={anchor("mode")} style={{ gap: space.sm }}>
        <AppText
          kind="label"
          color={stitchTokens.wine}
          style={{ fontWeight: "700", letterSpacing: 0.5 }}
        >
          PHƯƠNG THỨC GIAO DỊCH
        </AppText>

        <View style={{ flexDirection: "row", gap: space.sm }}>
          {modes.map((m) => {
            const isSelected = form.mode === m.value;

            return (
              <Pressable
                key={m.value}
                disabled={disabled}
                onPress={() => onChange({ ...form, mode: m.value })}
                accessibilityRole="button"
                accessibilityLabel={`${m.title}, ${m.subtitle}`}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    padding: space.sm,
                    borderRadius: 12,
                    backgroundColor: isSelected ? stitchTokens.roseWarmSurface : stitchTokens.warmIvory,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? stitchTokens.wine : stitchTokens.borderWarm,
                    gap: 4,
                    shadowColor: isSelected ? stitchTokens.wine : stitchTokens.black,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: isSelected ? 0.12 : 0.04,
                    shadowRadius: 2,
                    elevation: isSelected ? 2 : 1,
                  },
                  (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <AppText
                    kind="bold"
                    color={stitchTokens.wineDark}
                    style={{ fontSize: 13 }}
                  >
                    {m.title}
                  </AppText>
                  {isSelected ? (
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: stitchTokens.wine,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="check" size={10} color={stitchTokens.gold} />
                    </View>
                  ) : null}
                </View>

                <AppText
                  kind="label"
                  color={isSelected ? stitchTokens.wine : stitchTokens.subtleGray}
                  style={{ fontSize: 11, fontWeight: "600" }}
                >
                  {m.subtitle}
                </AppText>

                <AppText
                  kind="small"
                  color={stitchTokens.subtleGray}
                  style={{ fontSize: 10, lineHeight: 13 }}
                  numberOfLines={2}
                >
                  {m.desc}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {errors.mode ? <Notice tone="error">{errors.mode}</Notice> : null}
      </View>

      {/* Large Sale Price Card */}
      {form.mode === "Sale" || form.mode === "Both" ? (
        <View
          ref={anchor("salePrice")}
          style={{
            backgroundColor: stitchTokens.warmIvory,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: errors.salePrice ? colors.rustText : stitchTokens.borderWarm,
            padding: space.md,
            gap: space.sm,
            shadowColor: stitchTokens.black,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
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
              GIÁ BÁN ĐỀ XUẤT (VND)
            </AppText>
            <AppText kind="small" color={stitchTokens.subtleGray}>
              10.000₫ – 1.000.000₫
            </AppText>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
            }}
          >
            <AppText
              kind="title"
              color={stitchTokens.wine}
              style={{ fontSize: 28, fontWeight: "800" }}
            >
              ₫
            </AppText>
            <View style={{ flex: 1 }}>
              <TextField
                label="Giá bán (đồng)"
                hint="Ví dụ: 125000"
                keyboardType="number-pad"
                value={form.salePrice}
                editable={!disabled}
                onChangeText={(salePrice) => onChange({ ...form, salePrice })}
                error={errors.salePrice}
                maxLength={12}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* Large Exchange Value Card */}
      {form.mode === "Exchange" || form.mode === "Both" ? (
        <View
          ref={anchor("exchangeValue")}
          style={{
            backgroundColor: stitchTokens.warmIvory,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: errors.exchangeValue ? colors.rustText : stitchTokens.borderWarm,
            padding: space.md,
            gap: space.sm,
            shadowColor: stitchTokens.black,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
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
              GIÁ TRỊ QUY ĐỔI / ĐỐI CHIẾU (VND)
            </AppText>
            <AppText kind="small" color={stitchTokens.subtleGray}>
              10.000₫ – 1.000.000₫
            </AppText>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
            }}
          >
            <AppText
              kind="title"
              color={stitchTokens.wine}
              style={{ fontSize: 28, fontWeight: "800" }}
            >
              ₫
            </AppText>
            <View style={{ flex: 1 }}>
              <TextField
                label="Giá trị đổi (đồng)"
                hint="Mức đối chiếu, ví dụ: 120000"
                keyboardType="number-pad"
                value={form.exchangeValue}
                editable={!disabled}
                onChangeText={(exchangeValue) =>
                  onChange({ ...form, exchangeValue })
                }
                error={errors.exchangeValue}
                maxLength={12}
              />
            </View>
          </View>

          {/* Lật-Xu equivalent badge */}
          {Number(form.exchangeValue) > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: stitchTokens.goldLight,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: stitchTokens.goldDark,
                gap: 6,
              }}
            >
              <Icon name="bookmark" size={14} color={stitchTokens.goldDark} />
              <AppText
                kind="small"
                color={stitchTokens.wineDark}
                style={{ fontWeight: "600" }}
              >
                {`Tương đương quy đổi: ~${Math.round(Number(form.exchangeValue) / 1000).toLocaleString("vi-VN")} Lật-Xu vàng`}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
