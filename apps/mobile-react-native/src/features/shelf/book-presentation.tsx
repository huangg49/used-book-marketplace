import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  AppText,
  BookCondition,
  BookPrice,
  Icon,
  Notice,
  colors,
  layout,
  radius,
  space,
} from "../../core/ui";
import { conditions, modes, type Listing } from "./contracts";

// Display only. Reads, eligibility and signed images stay in the calling screen.
export function BookPresentation({
  item,
  gallery,
  children,
}: {
  item: Listing;
  gallery: ReactNode;
  children?: ReactNode;
}) {
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <>
      {gallery}
      <View style={{ gap: space.sm }}>
        <BookCondition
          condition={conditions[item.condition]}
          mode={modes[item.mode]}
        />
        <AppText
          kind="heading"
          accessibilityRole="header"
          color={colors.forest}
        >
          {item.book.title}
        </AppText>
        <AppText color={colors.muted}>{item.book.authors.join(" · ")}</AppText>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.rule,
          paddingVertical: space.lg,
        }}
      >
        <BookPrice
          sale={item.salePrice ?? undefined}
          exchange={item.exchangeValue ?? undefined}
        />
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <View
          style={{
            padding: space.md,
            backgroundColor: colors.successSurface,
            borderRadius: radius.pill,
          }}
        >
          <Icon name="person" size={22} />
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <AppText kind="label" color={colors.rustText}>
            TỪ KỆ CỦA
          </AppText>
          <AppText kind="bold" color={colors.forest}>
            {item.seller.displayName}
          </AppText>
        </View>
      </View>
      <AppText>{item.description}</AppText>
      <View
        style={{
          backgroundColor: colors.surface,
          padding: space.lg,
          borderRadius: radius.card,
          gap: space.lg,
        }}
      >
        <View style={{ gap: space.xs }}>
          <AppText
            kind="heading"
            accessibilityRole="header"
            color={colors.forest}
          >
            Dấu đọc còn lại
          </AppText>
          <AppText kind="small" color={colors.muted}>
            Những điều cần biết về chính bản sách này.
          </AppText>
        </View>
        {(
          [
            ["Ruột sách", item.pages],
            ["Bìa và gáy", item.coverNote],
            ["Ghi chú / đánh dấu", item.notes],
            ["Phụ kiện", item.accessories],
            [
              "Trang thiếu",
              item.hasMissingPages
                ? "Người đăng khai báo có thiếu trang; xem mô tả ruột sách."
                : "Người đăng khai báo không thiếu trang.",
            ],
          ] as const
        ).map(([label, value]) => (
          <View
            key={label}
            style={{
              borderTopWidth: 1,
              borderColor: colors.rule,
              paddingTop: space.md,
              gap: space.xs,
            }}
          >
            <AppText kind="bold">{label}</AppText>
            <AppText color={colors.muted}>{value}</AppText>
          </View>
        ))}
      </View>
      <Notice tone="info">
        Người đăng khai báo sách còn đọc được và không thiếu nội dung trọng yếu.
        Hãy đối chiếu ảnh và mô tả tình trạng.
      </Notice>
      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.rule,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Về đầu sách"
          accessibilityState={{ expanded: metadataOpen }}
          aria-expanded={metadataOpen}
          onPress={() => setMetadataOpen((v) => !v)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingVertical: space.lg,
              minHeight: 52,
              opacity: pressed ? 0.7 : 1,
            },
            focused && layout.focus,
          ]}
        >
          <View style={{ flex: 1, gap: space.xs }}>
            <AppText kind="card" color={colors.forest}>
              Về đầu sách
            </AppText>
            <AppText kind="small" color={colors.muted}>
              Ấn bản, nhà xuất bản và ngôn ngữ
            </AppText>
          </View>
          <Icon name={metadataOpen ? "close" : "plus"} size={20} />
        </Pressable>
        {metadataOpen && (
          <View style={{ gap: space.md, paddingBottom: space.lg }}>
            {(
              [
                ["Nhà xuất bản", item.book.publisher],
                ["Năm xuất bản", item.book.publicationYear?.toString()],
                ["Ấn bản", item.book.edition],
                ["Thể loại", item.book.category],
                ["Ngôn ngữ", item.book.language],
                ["ISBN", item.book.isbn],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={{ gap: space.xs }}>
                <AppText kind="small" color={colors.muted}>
                  {label}
                </AppText>
                <AppText>{value || "Chưa cung cấp"}</AppText>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={{ gap: space.sm }}>
        <AppText kind="card" accessibilityRole="header" color={colors.forest}>
          Cách sách đến tay bạn
        </AppText>
        <AppText>
          {item.fulfillment
            ? "Người đăng chọn giao trực tiếp trong TP.HCM. Vùng phục vụ đang dùng dữ liệu mô phỏng."
            : "Người đăng chưa hoàn thiện thông tin giao nhận."}
        </AppText>
        <AppText kind="small" color={colors.muted}>
          Lật lại phục vụ TP.HCM. Đặt mua, đề nghị đổi và giao nhận chưa mở
          trong phiên bản này.
        </AppText>
      </View>
      {children}
    </>
  );
}
