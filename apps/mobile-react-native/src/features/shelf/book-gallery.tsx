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
}: {
  photo: ReactNode;
  count: number;
  selected: number;
  onSelect: (index: number) => void;
  onEnlarge: () => void;
  disabled?: boolean;
  caption: string;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {photo}
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <AppText kind="label" color={colors.muted} style={{ flex: 1 }}>
          ẢNH {selected + 1} / {count}
        </AppText>
        <IconButton
          name="search"
          label="Xem ảnh lớn"
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
              onPress={() => onSelect(index)}
            />
          ))}
        </View>
      )}
      <AppText kind="small" color={colors.muted}>
        {caption}
      </AppText>
    </View>
  );
}
