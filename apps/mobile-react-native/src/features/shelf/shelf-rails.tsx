import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, Pressable, useWindowDimensions } from "react-native";
import {
  AppText,
  BookCondition,
  BookOffer,
  IconButton,
  TextScale,
  colors,
  formatVnd,
  layout,
  metrics,
  radius,
  space,
  useReducedMotion,
} from "../../core/ui";
import { conditions, modes, type Listing } from "./contracts";

type Props = {
  summary?: string;
  items: Listing[];
  onOpen: (item: Listing) => void;
  renderPhoto: (item: Listing, onFocus: () => void) => ReactNode;
};

// Consecutive groups preserve the API's order and cursor semantics.
export function ShelfRails({ items, ...props }: Props) {
  const rows: Listing[][] = [];
  for (let start = 0; start < items.length; start += 3)
    rows.push(items.slice(start, start + 3));
  return (
    <View style={{ gap: space.xxl }}>
      {rows.map((row, index) => (
        <ShelfRail
          key={row[0].id}
          {...props}
          items={row}
          rowNumber={index + 1}
        />
      ))}
    </View>
  );
}

function ShelfRail({
  summary,
  items,
  renderPhoto,
  onOpen,
  rowNumber,
}: Props & { rowNumber: number }) {
  const { width, fontScale } = useWindowDimensions();
  const scale = useContext(TextScale) * fontScale;
  const reducedMotion = useReducedMotion();
  const viewport = Math.min(width - space.xl * 2, metrics.content);
  const cardWidth = Math.min(viewport, scale >= 1.29 ? 224 : 160);
  const step = cardWidth + space.lg;
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [edges, setEdges] = useState({ before: false, after: true });
  const maxOffset = Math.max(0, items.length * step - space.lg - viewport);
  const move = (next: number, animate = false) =>
    scroll.current?.scrollTo({
      x: Math.max(0, Math.min(maxOffset, next)),
      animated: animate && !reducedMotion,
    });
  useEffect(() => {
    if (reducedMotion)
      scroll.current?.scrollTo({ x: offset.current, animated: false });
  }, [reducedMotion]);
  useEffect(() => {
    const x = Math.min(offset.current, maxOffset);
    scroll.current?.scrollTo({ x, animated: false });
    offset.current = x;
    setEdges({ before: x > 1, after: x < maxOffset - 1 });
  }, [maxOffset]);
  return (
    <View style={{ gap: space.md }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.sm,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {rowNumber === 1 && summary && (
            <AppText kind="small" color={colors.muted}>
              {summary}
            </AppText>
          )}
          {rowNumber > 1 && (
            <AppText
              kind="bold"
              color={colors.forest}
              accessibilityRole="header"
            >
              Hàng sách {rowNumber}
            </AppText>
          )}
          <AppText kind="small" color={colors.muted}>
            {items.length} cuốn{maxOffset > 0 ? " · kéo ngang để xem" : ""}
          </AppText>
        </View>
        {maxOffset > 0 && (
          <View style={{ flexDirection: "row", gap: space.xs }}>
            <IconButton
              name="back"
              label={`Cuốn trước, hàng ${rowNumber}`}
              disabled={!edges.before}
              onPress={() => move(offset.current - step, true)}
            />
            <IconButton
              name="arrow"
              label={`Cuốn tiếp theo, hàng ${rowNumber}`}
              disabled={!edges.after}
              onPress={() => move(offset.current + step, true)}
            />
          </View>
        )}
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(event) => {
          const x = event.nativeEvent.contentOffset.x;
          offset.current = x;
          const before = x > 1,
            after = x < maxOffset - 1;
          setEdges((previous) =>
            previous.before === before && previous.after === after
              ? previous
              : { before, after },
          );
        }}
        contentContainerStyle={{
          gap: space.lg,
          alignItems: "stretch",
          paddingBottom: space.xs,
        }}
      >
        {items.map((item, index) => (
          <RailBook
            key={item.id}
            item={item}
            cardWidth={cardWidth}
            renderPhoto={renderPhoto}
            onOpen={onOpen}
            focusBook={() => move(index * step)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function RailBook({
  item,
  cardWidth,
  renderPhoto,
  onOpen,
  focusBook,
}: {
  item: Listing;
  cardWidth: number;
  renderPhoto: Props["renderPhoto"];
  onOpen: Props["onOpen"];
  focusBook: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const label = [
    `Xem cuốn sách: ${item.book.title}`,
    item.book.authors.join(" · "),
    `Tình trạng: ${conditions[item.condition]}`,
    modes[item.mode],
    item.salePrice != null ? `Giá bán: ${formatVnd(item.salePrice)}` : null,
    item.exchangeValue != null
      ? `Giá trị đổi: ${formatVnd(item.exchangeValue)}`
      : null,
    `Từ kệ của ${item.seller.displayName}`,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <View
      style={{
        width: cardWidth,
        gap: space.sm,
        padding: space.sm,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.rule,
        borderRadius: radius.card,
      }}
    >
      {renderPhoto(item, focusBook)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onOpen(item)}
        onFocus={() => {
          setFocused(true);
          focusBook();
        }}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          {
            flex: 1,
            gap: space.sm,
            minHeight: metrics.touch,
            opacity: pressed ? 0.75 : 1,
          },
          focused && layout.focus,
        ]}
      >
        <View style={{ gap: space.xs }}>
          <AppText kind="shelfTitle" numberOfLines={3} ellipsizeMode="tail">
            {item.book.title}
          </AppText>
          <AppText
            kind="annotation"
            color={colors.muted}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.book.authors.join(" · ")}
          </AppText>
        </View>
        <BookCondition stamp condition={conditions[item.condition]} />
        {/* The stretched card leaves surplus space after the complete offer,
            never between the book's metadata, condition and prices. */}
        <BookOffer
          sale={item.salePrice ?? undefined}
          exchange={item.exchangeValue ?? undefined}
        />
      </Pressable>
    </View>
  );
}
