import { useContext, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { AppText, Button, Chip, TextScale, colors, space } from "../../core/ui";

export function BookGallery({
  photo,
  count,
  selected,
  onSelect,
  onEnlarge,
  disabled = false,
  caption,
  summary,
}: {
  photo: ReactNode;
  count: number;
  selected: number;
  onSelect: (index: number) => void;
  onEnlarge: () => void;
  disabled?: boolean;
  caption: string;
  summary?: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const textScale = useContext(TextScale);
  const stacked = width < 360 && fontScale * textScale >= 1.29;
  return (
    <View style={{ gap: space.sm }}>
      <View
        style={{
          flexDirection: stacked ? "column" : "row",
          gap: space.lg,
          alignItems: "flex-start",
        }}
      >
        <View
          style={{
            width: summary ? (stacked ? 132 : "40%") : "100%",
            gap: space.sm,
          }}
        >
          {photo}
        </View>
        {summary && (
          <View
            style={{
              flex: stacked ? undefined : 1,
              width: stacked ? "100%" : undefined,
              minWidth: 0,
            }}
          >
            {summary}
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: space.sm,
        }}
      >
        <AppText kind="annotation" color={colors.muted} style={{ flexGrow: 1 }}>
          Ảnh {selected + 1} / {count}
        </AppText>
        <Button
          secondary
          title="Xem ảnh lớn"
          disabled={disabled}
          onPress={onEnlarge}
        />
      </View>
      {count > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {Array.from({ length: count }, (_, index) => (
            <Chip
              key={index}
              title={`Ảnh ${index + 1}`}
              selected={index === selected}
              disabled={disabled}
              onPress={() => onSelect(index)}
            />
          ))}
        </View>
      )}
      <AppText kind="annotation" color={colors.muted}>
        {caption}
      </AppText>
    </View>
  );
}
