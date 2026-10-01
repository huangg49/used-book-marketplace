import { Fragment, useContext, useState, type ReactNode } from "react";
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
  typography,
  radius,
} from "../../core/ui";
import { conditions, modes, type Listing } from "./contracts";

// Approved shelf summary; the detail and accessible label retain the full title.
const shelfTitleLines = 3;

export function ShelfGrid({
  items,
  renderPhoto,
  onOpen,
  afterFirstPair,
}: {
  items: Listing[];
  renderPhoto: (item: Listing) => ReactNode;
  onOpen: (item: Listing) => void;
  afterFirstPair?: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = useContext(TextScale);
  const singleColumn = width < 360 || fontScale * scale >= 1.29;
  const textScale = fontScale * scale;
  const [focused, setFocused] = useState<string>();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        columnGap: space.lg,
        rowGap: space.xxl,
      }}
    >
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <View
            style={{
              width: singleColumn ? "100%" : "47%",
              gap: space.sm,
              padding: space.sm,
              backgroundColor: colors.surface,
              borderRadius: radius.card,
            }}
          >
            <View
              style={{
                flexDirection: singleColumn ? "row" : "column",
                alignItems: "flex-start",
                gap: space.sm,
                ...(!singleColumn && { flex: 1 }),
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
                      : { width: "100%", flex: 1 }),
                    paddingBottom: space.xs,
                    opacity: pressed ? 0.75 : 1,
                  },
                  focused === item.id && layout.focus,
                ]}
              >
                <AppText
                  kind="shelfTitle"
                  color={colors.ink}
                  accessibilityRole="header"
                  numberOfLines={shelfTitleLines}
                  ellipsizeMode="tail"
                  style={{
                    paddingRight: space.xs,
                    ...(!singleColumn && {
                      minHeight:
                        typography.shelfTitle[1] * textScale * shelfTitleLines,
                    }),
                  }}
                >
                  {item.book.title}
                </AppText>
                <AppText
                  kind="annotation"
                  color={colors.muted}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ minHeight: typography.annotation[1] * textScale }}
                >
                  {item.book.authors.join(" · ")}
                </AppText>
                <View
                  style={{
                    borderLeftWidth: 2,
                    borderColor: colorRoles.bookStamp,
                    paddingLeft: space.sm,
                    minHeight: typography.stamp[1] * textScale,
                  }}
                >
                  <AppText
                    kind="annotation"
                    color={colorRoles.bookStamp}
                    accessibilityLabel={`Tình trạng: ${conditions[item.condition]}`}
                  >
                    {conditions[item.condition]}
                  </AppText>
                </View>
                {!singleColumn && (
                  <View
                    style={{
                      flexGrow: 1,
                      minHeight:
                        typography.shelfPrice[1] * textScale * 2 + space.xs,
                    }}
                  >
                    <BookOffer
                      sale={item.salePrice ?? undefined}
                      exchange={item.exchangeValue ?? undefined}
                    />
                  </View>
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
          {index === 1 && afterFirstPair ? (
            <View style={{ width: "100%" }}>{afterFirstPair}</View>
          ) : null}
        </Fragment>
      ))}
    </View>
  );
}
