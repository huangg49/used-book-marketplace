import { View, useWindowDimensions } from "react-native";
import {
  AppText,
  Button,
  Chip,
  Notice,
  Sheet,
  TextField,
  colors,
  space,
} from "../../core/ui";
import { conditions, modes } from "./contracts";
import { initialFilters, sorts, type Filters } from "./filters";

export function ShelfFilterSheet({
  visible,
  value,
  onChange,
  onClose,
  onApply,
  error,
}: {
  visible: boolean;
  value: Filters;
  onChange: (value: Filters) => void;
  onClose: () => void;
  onApply: () => void;
  error?: string;
}) {
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || width < 360;
  const field = (name: keyof Filters, next: string) =>
    onChange({ ...value, [name]: next });
  return (
    <Sheet
      visible={visible}
      title="Lọc và sắp xếp"
      onClose={onClose}
      footer={
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <View
            style={{ flexDirection: stacked ? "column" : "row", gap: space.sm }}
          >
            <View style={{ flex: stacked ? undefined : 1 }}>
              <Button
                title="Đặt lại"
                secondary
                onPress={() => onChange({ ...initialFilters, q: value.q })}
              />
            </View>
            <View style={{ flex: stacked ? undefined : 2 }}>
              <Button title="Áp dụng bộ lọc" onPress={onApply} />
            </View>
          </View>
        </>
      }
    >
      <AppText kind="small" color={colors.muted}>
        Chọn điều bạn cần. Chỉ cập nhật kệ khi bấm Áp dụng.
      </AppText>
      <AppText kind="bold">Hình thức</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {Object.entries({ "": "Tất cả", ...modes }).map(([key, title]) => (
          <Chip
            key={key}
            title={title}
            selected={value.mode === key}
            onPress={() => field("mode", key)}
          />
        ))}
      </View>
      <AppText kind="bold">Tình trạng</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {Object.entries({ "": "Tất cả tình trạng", ...conditions }).map(
          ([key, title]) => (
            <Chip
              key={key}
              title={title}
              selected={value.condition === key}
              onPress={() => field("condition", key)}
            />
          ),
        )}
      </View>
      <View style={{ height: 1, backgroundColor: colors.rule }} />
      <AppText kind="bold">Sắp xếp</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {Object.entries(sorts).map(([key, title]) => (
          <Chip
            key={key}
            title={title}
            selected={value.sort === key}
            onPress={() => field("sort", key)}
          />
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: colors.rule }} />
      <AppText kind="small" color={colors.muted}>
        Khoảng giá từ 10.000 đến 1.000.000 đồng. Bỏ trống để không giới hạn. Hai
        khoảng giá áp dụng đồng thời.
      </AppText>
      {(
        [
          ["Giá bán", "minSalePrice", "maxSalePrice"],
          ["Giá trị đổi", "minExchangeValue", "maxExchangeValue"],
        ] as const
      ).map(([label, min, max]) => (
        <View key={min} style={{ gap: space.sm }}>
          <AppText kind="bold">{label} (đồng)</AppText>
          <View
            style={{ flexDirection: stacked ? "column" : "row", gap: space.sm }}
          >
            <View style={{ flex: stacked ? undefined : 1 }}>
              <TextField
                label="Từ"
                accessibilityLabel={`${label} tối thiểu (đồng)`}
                placeholder="Từ"
                value={value[min]}
                onChangeText={(v) => field(min, v)}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
            <View style={{ flex: stacked ? undefined : 1 }}>
              <TextField
                label="Đến"
                accessibilityLabel={`${label} tối đa (đồng)`}
                placeholder="Đến"
                value={value[max]}
                onChangeText={(v) => field(max, v)}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
          </View>
        </View>
      ))}
    </Sheet>
  );
}
