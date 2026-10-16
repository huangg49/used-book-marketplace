import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  AppText,
  BookPrice,
  Icon,
  Notice,
  colors,
  layout,
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
      <View style={{ gap: space.sm }}>
        <AppText
          kind="bookTitle"
          accessibilityRole="header"
          color={colors.forest}
        >
          {item.book.title}
        </AppText>
        <AppText kind="reading" color={colors.muted}>
          {item.book.authors.join(" · ")}
        </AppText>
        <AppText kind="label" color={colors.rustText}>
          Tình trạng: {conditions[item.condition]} · {modes[item.mode]}
        </AppText>
      </View>
      {gallery(
        <View style={{ gap: space.md }}>
          <BookPrice
            reading
            stacked
            sale={item.salePrice ?? undefined}
            exchange={item.exchangeValue ?? undefined}
          />
          {item.exchangeValue != null && (
            <AppText kind="annotation" color={colors.muted}>
              Giá trị đổi để so sánh sách khi trao đổi.
            </AppText>
          )}
          <View style={{ gap: space.xs }}>
            <AppText kind="annotation" color={colors.muted}>
              Người đăng
            </AppText>
            <AppText kind="bold">{item.seller.displayName}</AppText>
          </View>
        </View>,
      )}
      {item.purchaseAvailability.status !== "Available" && (
        <Notice tone="info">
          {item.purchaseAvailability.status === "AwaitingPayment"
            ? "Sách đang được giữ chờ thanh toán."
            : item.purchaseAvailability.status === "InTransaction"
              ? "Sách đang giao dịch."
              : "Sách đang được giữ trong một cuộc trao đổi mua."}
        </Notice>
      )}
      {children}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.rule,
          paddingTop: space.xl,
          gap: space.lg,
        }}
      >
        <View style={{ gap: space.xs }}>
          <AppText
            kind="bookHeading"
            accessibilityRole="header"
            color={colors.forest}
          >
            Tình trạng sách
          </AppText>
          <AppText kind="annotation" color={colors.muted}>
            Theo mô tả của người đăng. Hãy đối chiếu với ảnh.
          </AppText>
        </View>
        <View
          style={{
            gap: space.lg,
          }}
        >
          {(
            [
              ["Trang sách", item.pages],
              ["Bìa và gáy", item.coverNote],
              ["Ghi chú và đánh dấu", item.notes],
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
              <AppText kind="bold">{label}</AppText>
              <AppText kind="reading">{value || "Chưa cung cấp"}</AppText>
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <AppText
          kind="bookHeading"
          accessibilityRole="header"
          color={colors.forest}
        >
          Mô tả thêm
        </AppText>
        <AppText kind="reading">{item.description || "Chưa cung cấp"}</AppText>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.rule,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông tin xuất bản"
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
              Thông tin xuất bản
            </AppText>
            <AppText kind="annotation" color={colors.muted}>
              Nhà xuất bản, ấn bản, ngôn ngữ và ISBN
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
          Giao nhận
        </AppText>
        <AppText kind="reading">
          {item.fulfillment
            ? "Giao tận nơi trong TP.HCM — mô phỏng đồ án."
            : "Người đăng chưa cung cấp thông tin giao nhận."}
        </AppText>
        <AppText kind="annotation" color={colors.muted}>
          Ứng dụng Android hiện cho xem và lưu sách. Chưa hỗ trợ đặt mua hoặc đề
          nghị đổi.
        </AppText>
      </View>
    </>
  );
}
