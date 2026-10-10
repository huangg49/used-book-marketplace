import { View } from "react-native";
import {
  AppText,
  BrandLogo,
  Button,
  Icon,
  colors,
  metrics,
  space,
  SearchField,
} from "../../core/ui";

export function ShelfHeader({ inverse = false }: { inverse?: boolean }) {
  return (
    <View style={{ backgroundColor: inverse ? colors.forest : undefined }}>
      <View
        style={{
          paddingHorizontal: space.xl,
          paddingVertical: space.sm,
          maxWidth: metrics.content + space.xl * 2,
          width: "100%",
          alignSelf: "center",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.sm,
        }}
      >
        <BrandLogo inverse={inverse} />
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
        >
          <Icon
            name="pin"
            size={16}
            color={inverse ? colors.paper : colors.forest}
          />
          <AppText kind="small" color={inverse ? colors.paper : colors.forest}>
            TP. Hồ Chí Minh
          </AppText>
        </View>
      </View>
    </View>
  );
}

// Search stays above the result scroll. The filter action has a visible name.
export function ShelfSearchHeader({
  search,
  onSearchChange,
  onSubmit,
  onFilter,
  filterCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
  onFilter: () => void;
  filterCount: number;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <ShelfHeader />
      <View
        style={{
          paddingHorizontal: space.xl,
          paddingBottom: space.lg,
          gap: space.md,
          width: "100%",
          maxWidth: metrics.content + space.xl * 2,
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.md,
          }}
        >
          <AppText
            kind="searchTitle"
            color={colors.forest}
            accessibilityRole="header"
            style={{ flex: 1 }}
          >
            Tìm sách
          </AppText>
          <Button
            secondary
            title={`Bộ lọc${filterCount ? ` (${filterCount})` : ""}`}
            onPress={onFilter}
          />
        </View>
        <SearchField
          label="Tìm sách theo tên, tác giả hoặc ISBN"
          submitLabel="Tìm sách"
          placeholder="Tên sách, tác giả, ISBN"
          value={search}
          onChangeText={onSearchChange}
          maxLength={400}
          onSubmitEditing={onSubmit}
        />
      </View>
    </View>
  );
}
