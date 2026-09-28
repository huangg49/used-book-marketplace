import { useContext, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  AppText,
  BookCondition,
  Icon,
  TextScale,
  colors,
  layout,
  space,
} from "../../core/ui";
import { conditions, type Listing } from "./contracts";

export function ShelfGrid({
  items,
  renderPhoto,
  onOpen,
}: {
  items: Listing[];
  renderPhoto: (item: Listing) => ReactNode;
  onOpen: (item: Listing) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = useContext(TextScale);
  // Android reports font scale as a float; allow for 1.3 becoming 1.29999995.
  const singleColumn = width < 360 || fontScale * scale >= 1.29;
  const [focused, setFocused] = useState<string>();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        columnGap: space.lg,
        rowGap: space.section,
      }}
    >
      {items.map((item) => (
        <View
          key={item.id}
          style={{ width: singleColumn ? "100%" : "47%", gap: space.md }}
        >
          {renderPhoto(item)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Xem cuốn sách: ${item.book.title}`}
            onPress={() => onOpen(item)}
            onFocus={() => setFocused(item.id)}
            onBlur={() => setFocused(undefined)}
            style={({ pressed }) => [
              {
                gap: space.sm,
                paddingBottom: space.md,
                opacity: pressed ? 0.75 : 1,
              },
              focused === item.id && layout.focus,
            ]}
          >
            <BookCondition condition={conditions[item.condition]} />
            <AppText
              kind="card"
              color={colors.forest}
              accessibilityRole="header"
            >
              {item.book.title}
            </AppText>
            <AppText kind="small" color={colors.muted}>
              {item.book.authors.join(" · ")}
            </AppText>
            <View
              style={{
                gap: space.sm,
                borderTopWidth: 1,
                borderColor: colors.rule,
                paddingTop: space.sm,
              }}
            >
              {(
                [
                  ["Giá bán", item.salePrice],
                  ["Giá trị đổi", item.exchangeValue],
                ] as const
              ).map(([label, amount]) =>
                amount != null ? (
                  <View key={label}>
                    <AppText kind="small" color={colors.muted}>
                      {label}
                    </AppText>
                    <AppText kind="bold" color={colors.forest}>
                      {amount.toLocaleString("vi-VN")} ₫
                    </AppText>
                  </View>
                ) : null,
              )}
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
              }}
            >
              <AppText kind="small" color={colors.muted} style={{ flex: 1 }}>
                Từ kệ của {item.seller.displayName}
              </AppText>
              <Icon name="arrow" size={18} />
            </View>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
