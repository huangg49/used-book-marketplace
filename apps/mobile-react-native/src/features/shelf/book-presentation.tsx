import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  AppText,
  BookCondition,
  Icon,
  Notice,
  colors,
  colorRoles,
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
  gallery: (summary: ReactNode) => ReactNode;
  children?: ReactNode;
}) {
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <>
      {gallery(
        <View style={{ gap: space.md }}>
          <AppText
            kind="bookTitle"
            accessibilityRole="header"
            color={colors.forest}
          >
            {item.book.title}
          </AppText>
          <AppText kind="annotation" color={colors.muted}>
            {item.book.authors.join(" · ")}
          </AppText>
          <BookCondition
            stamp
            condition={conditions[item.condition]}
            mode={modes[item.mode]}
          />
        </View>,
      )}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.record,
          borderTopWidth: 2,
          borderTopColor: colorRoles.bookStamp,
          padding: space.lg,
          gap: space.lg,
        }}
      >
        <View style={{ gap: space.xs }}>
          <AppText
            kind="bookHeading"
            accessibilityRole="header"
            color={colors.forest}
          >
            Phiếu tình trạng
          </AppText>
          <AppText kind="annotation" color={colors.muted}>
            Người đăng mô tả
          </AppText>
          <AppText kind="stamp" color={colors.ink}>
            {item.seller.displayName}
          </AppText>
        </View>
        <View
          style={{
            borderLeftWidth: 1,
            borderColor: colorRoles.bookStamp,
            paddingLeft: space.lg,
            gap: space.lg,
          }}
        >
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
                gap: space.xs,
              }}
            >
              <AppText kind="annotation" color={colors.muted}>
                {label}
              </AppText>
              <AppText kind="reading">{value}</AppText>
            </View>
          ))}
        </View>
      </View>
      <Notice tone="info">
        Người đăng khai báo sách còn đọc được và không thiếu nội dung trọng yếu.
        Hãy đối chiếu ảnh và mô tả tình trạng.
      </Notice>
      <AppText kind="reading">{item.description}</AppText>
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
            <AppText kind="bookHeading" color={colors.forest}>
              Về đầu sách
            </AppText>
            <AppText kind="annotation" color={colors.muted}>
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
                <AppText kind="annotation" color={colors.muted}>
                  {label}
                </AppText>
                <AppText kind="reading">{value || "Chưa cung cấp"}</AppText>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={{ gap: space.sm }}>
        <AppText
          kind="bookHeading"
          accessibilityRole="header"
          color={colors.forest}
        >
          Cách sách đến tay bạn
        </AppText>
        <AppText kind="reading">
          {item.fulfillment
            ? "Người đăng chọn giao trực tiếp trong TP.HCM. Vùng phục vụ đang dùng dữ liệu mô phỏng."
            : "Người đăng chưa hoàn thiện thông tin giao nhận."}
        </AppText>
        <AppText kind="annotation" color={colors.muted}>
          Lật lại phục vụ TP.HCM. Đặt mua, đề nghị đổi và giao nhận chưa mở
          trong phiên bản này.
        </AppText>
      </View>
      {children}
    </>
  );
}
