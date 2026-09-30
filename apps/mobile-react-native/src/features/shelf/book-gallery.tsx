import type { ReactNode } from "react";
import { View } from "react-native";
import { AppText, Chip, IconButton, colors, space } from "../../core/ui";

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
  return (
    <View style={{ gap: space.sm }}>
      <View
        style={{
          flexDirection: "row",
          gap: space.xl,
          alignItems: "flex-start",
        }}
      >
        <View style={{ width: summary ? "40%" : "100%", gap: space.sm }}>
          {photo}
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
              accessibilityLabel={`Ảnh ${selected + 1} / ${count}`}
              style={{ flex: 1 }}
            >
              {selected + 1} / {count}
            </AppText>
            <IconButton
              name="search"
              label="Xem ảnh lớn"
              disabled={disabled}
              onPress={onEnlarge}
            />
          </View>
        </View>
        {summary && <View style={{ flex: 1, minWidth: 0 }}>{summary}</View>}
      </View>
      {count > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {Array.from({ length: count }, (_, index) => (
            <Chip
              key={index}
              title={`Ảnh ${index + 1}`}
              selected={index === selected}
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
