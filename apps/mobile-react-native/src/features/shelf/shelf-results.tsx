import { useContext, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  AppText,
  TextScale,
  colors,
  formatVnd,
  layout,
  space,
  stitchTokens,
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onOpen}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        {
          width: grid ? "48.5%" : "100%",
          backgroundColor: stitchTokens.white,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: stitchTokens.creamParchment,
          overflow: "hidden",
          elevation: 2,
          shadowColor: stitchTokens.black,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          marginBottom: 10,
          opacity: pressed ? 0.9 : 1,
        },
        focused && layout.focus,
      ]}
    >
      <View
        style={{
          width: "100%",
          aspectRatio: grid ? 3 / 4 : 4 / 3,
          backgroundColor: stitchTokens.offWhiteWarm,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {photo}

        {/* Condition Badge in top-left */}
        <View
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            backgroundColor:
              item.condition === "LikeNew"
                ? stitchTokens.likeNewGreen
                : item.condition === "Good"
                  ? stitchTokens.goldBronze
                  : stitchTokens.darkTaupe,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            elevation: 2,
          }}
        >
          <AppText
            kind="small"
            style={{
              color: stitchTokens.white,
              fontSize: 9,
              fontWeight: "700",
              lineHeight: 11,
            }}
          >
            {conditions[item.condition]}
          </AppText>
        </View>
      </View>

      <View
        style={{
          padding: 10,
          gap: space.xs,
          justifyContent: "space-between",
          flex: 1,
        }}
      >
        <View style={{ gap: 2 }}>
          <AppText
            kind="shelfTitle"
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: stitchTokens.darkWood,
              lineHeight: 17,
            }}
          >
            {item.book.title}
          </AppText>
          <AppText
            kind="annotation"
            color={colors.muted}
            numberOfLines={1}
            style={{ fontSize: 11 }}
          >
            {item.book.authors.join(" · ")}
          </AppText>
        </View>

        <View style={{ marginTop: 4, gap: 2 }}>
          {item.salePrice != null && (
            <AppText
              kind="shelfPrice"
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: stitchTokens.wine,
              }}
            >
              {formatVnd(item.salePrice)}
            </AppText>
          )}
          {item.exchangeValue != null && (
            <AppText
              kind="annotation"
              style={{ fontSize: 11, color: stitchTokens.warmUmber }}
            >
              Giá trị đổi {formatVnd(item.exchangeValue)}
            </AppText>
          )}
          <AppText
            kind="small"
            color={colors.muted}
            numberOfLines={1}
            style={{ fontSize: 10, marginTop: 2 }}
          >
            {modes[item.mode]} · {item.seller.displayName}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
