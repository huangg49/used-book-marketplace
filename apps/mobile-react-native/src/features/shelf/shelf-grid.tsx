import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  AppText,
  BookCondition,
  BookPrice,
  Icon,
  colors,
  formatVnd,
  layout,
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
  const [focused, setFocused] = useState<string>();
  return (
    <View
      style={{
        gap: space.xxl,
      }}
    >
      {items.map((item) => (
        <View
          key={item.id}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: space.lg,
            paddingTop: space.lg,
            borderTopWidth: 1,
            borderColor: colors.rule,
          }}
        >
          <View style={{ width: "34%" }}>{renderPhoto(item)}</View>
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
                flex: 1,
                minWidth: 0,
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
            <BookCondition
              stamp
              condition={conditions[item.condition]}
              mode={modes[item.mode]}
            />
            <View
              style={{
                paddingTop: space.sm,
              }}
            >
              <BookPrice
                reading
                stacked
                sale={item.salePrice ?? undefined}
                exchange={item.exchangeValue ?? undefined}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
              }}
            >
              <AppText
                kind="annotation"
                color={colors.muted}
                style={{ flex: 1 }}
              >
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
