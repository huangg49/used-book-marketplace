import { View } from "react-native";
import { AppText, space } from "../../core/ui";
import { conditions } from "../shelf/contracts";
import type { BookBundle } from "./book-bundle";

export function BundleManifest({ bundle }: { bundle?: BookBundle | null }) {
  if (!bundle) return null;
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold" accessibilityRole="header">
        {bundle.title} · {bundle.items.length} cuốn
      </AppText>
      <AppText>
        Giá, giao nhận và trả sách áp dụng cho cả bộ. Không bán hoặc trả từng
        cuốn.
      </AppText>
      {bundle.items.map((item, index) => (
        <View key={index} style={{ gap: space.xs }}>
          <AppText kind="bold">
            {index + 1}. {item.label} · {conditions[item.condition]}
          </AppText>
          {item.notes ? <AppText>{item.notes}</AppText> : null}
        </View>
      ))}
    </View>
  );
}
