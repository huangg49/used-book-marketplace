import { useContext, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  AppText,
  TextScale,
  colors,
  colorRoles,
  formatVnd,
  layout,
  space,
} from "../../core/ui";
import { conditions, modes, type Listing } from "./contracts";

/** The API order is the reading order. Grid is retained only for the design comparison. */
export function ShelfResults({
  items,
  renderPhoto,
  onOpen,
  composition = "list",
}: {
  items: Listing[];
  renderPhoto: (item: Listing) => ReactNode;
  onOpen: (item: Listing) => void;
  composition?: "list" | "grid";
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = fontScale * useContext(TextScale);
  const grid = composition === "grid" && width >= 360 && scale < 1.29;
  const stacked = width < 360 && scale >= 1.29;
  return (
    <View
      style={{
        flexDirection: grid ? "row" : "column",
        flexWrap: "wrap",
        gap: space.lg,
      }}
    >
      {items.map((item) => (
        <ShelfResult
          key={item.id}
          item={item}
          grid={grid}
          stacked={stacked}
          photo={renderPhoto(item)}
          onOpen={() => onOpen(item)}
        />
      ))}
    </View>
  );
}

function ShelfResult({
  item,
  photo,
  onOpen,
  grid,
  stacked,
}: {
  item: Listing;
  photo: ReactNode;
  onOpen: () => void;
  grid: boolean;
  stacked: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const label = [
    `Xem sách: ${item.book.title}`,
    item.book.authors.join(" · "),
    `Tình trạng: ${conditions[item.condition]}`,
    modes[item.mode],
    item.salePrice != null ? `Giá bán: ${formatVnd(item.salePrice)}` : null,
    item.exchangeValue != null
      ? `Giá trị đổi: ${formatVnd(item.exchangeValue)}`
      : null,
    `Người đăng: ${item.seller.displayName}`,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <View
      style={{
        width: grid ? "47%" : "100%",
        flexDirection: grid || stacked ? "column" : "row",
        alignItems: "flex-start",
        gap: space.lg,
        paddingBottom: space.lg,
        borderBottomWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <View
        style={{ width: grid ? "100%" : stacked ? 112 : "32%", minWidth: 0 }}
      >
        {photo}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          {
            flex: grid || stacked ? undefined : 1,
            width: grid || stacked ? "100%" : undefined,
            minWidth: 0,
            gap: space.sm,
            opacity: pressed ? 0.7 : 1,
          },
          focused && layout.focus,
        ]}
      >
        <View style={{ gap: space.xs }}>
          <AppText kind="shelfTitle" numberOfLines={3} ellipsizeMode="tail">
            {item.book.title}
          </AppText>
          <AppText kind="annotation" color={colors.muted} numberOfLines={2}>
            {item.book.authors.join(" · ")}
          </AppText>
        </View>
        <AppText kind="annotation" color={colorRoles.bookStamp}>
          {conditions[item.condition]}
        </AppText>
        <View style={{ gap: space.xs }}>
          {item.salePrice != null && (
            <AppText kind="shelfPrice" color={colors.forest}>
              {formatVnd(item.salePrice)}
            </AppText>
          )}
          {item.exchangeValue != null && (
            <AppText kind="annotation" color={colors.ink}>
              Giá trị đổi {formatVnd(item.exchangeValue)}
            </AppText>
          )}
        </View>
        <AppText kind="small" color={colors.muted} numberOfLines={1}>
          {modes[item.mode]} · {item.seller.displayName}
        </AppText>
      </Pressable>
    </View>
  );
}
