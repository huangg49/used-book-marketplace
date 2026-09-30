import { useContext, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  AppText,
  BookOffer,
  TextScale,
  colors,
  colorRoles,
  formatVnd,
  layout,
  metrics,
  space,
} from "../../core/ui";
import { conditions, modes, type Listing } from "./contracts";

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
          <View
            style={{
              flexDirection: singleColumn ? "row" : "column",
              alignItems: "flex-start",
              gap: space.md,
            }}
          >
            <View
              style={{
                width: singleColumn ? "38%" : "100%",
              }}
            >
              {renderPhoto(item)}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={[
                `Xem cuốn sách: ${item.book.title}`,
                item.book.authors.join(" · "),
                `Tình trạng: ${conditions[item.condition]}`,
                modes[item.mode],
                item.salePrice != null
                  ? `Giá bán: ${formatVnd(item.salePrice)}`
                  : null,
                item.exchangeValue != null
                  ? `Giá trị đổi: ${formatVnd(item.exchangeValue)}`
                  : null,
                `Từ kệ của ${item.seller.displayName}`,
              ]
                .filter(Boolean)
                .join(". ")}
              onPress={() => onOpen(item)}
              onFocus={() => setFocused(item.id)}
              onBlur={() => setFocused(undefined)}
              style={({ pressed }) => [
                {
                  gap: space.sm,
                  ...(singleColumn
                    ? { flex: 1, minWidth: 0 }
                    : { width: "100%" }),
                  paddingBottom: space.md,
                  opacity: pressed ? 0.75 : 1,
                },
                focused === item.id && layout.focus,
              ]}
            >
              <AppText
                kind="shelfTitle"
                color={colors.forest}
                accessibilityRole="header"
              >
                {item.book.title}
              </AppText>
              <AppText kind="annotation" color={colors.muted}>
                {item.book.authors.join(" · ")}
              </AppText>
              <View
                style={{
                  borderLeftWidth: 2,
                  borderColor: colorRoles.bookStamp,
                  paddingLeft: space.sm,
                }}
              >
                <AppText
                  kind="stamp"
                  color={colorRoles.bookStamp}
                  accessibilityLabel={`Tình trạng: ${conditions[item.condition]}`}
                >
                  {conditions[item.condition]}
                </AppText>
              </View>
              {!singleColumn && (
                <BookOffer
                  sale={item.salePrice ?? undefined}
                  exchange={item.exchangeValue ?? undefined}
                />
              )}
            </Pressable>
          </View>
          {singleColumn && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem cuốn sách: ${item.book.title}. ${item.salePrice != null ? `Giá bán: ${formatVnd(item.salePrice)}. ` : ""}${item.exchangeValue != null ? `Giá trị đổi: ${formatVnd(item.exchangeValue)}` : ""}`}
              onPress={() => onOpen(item)}
              onFocus={() => setFocused(`${item.id}:offer`)}
              onBlur={() => setFocused(undefined)}
              style={({ pressed }) => [
                {
                  paddingVertical: space.sm,
                  minHeight: metrics.touch,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.rule,
                  opacity: pressed ? 0.75 : 1,
                },
                focused === `${item.id}:offer` && layout.focus,
              ]}
            >
              <BookOffer
                horizontal
                sale={item.salePrice ?? undefined}
                exchange={item.exchangeValue ?? undefined}
              />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
