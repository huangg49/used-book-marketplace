import { useState } from "react";
import { Linking, View, StyleSheet, Pressable } from "react-native";
import {
  currentReference,
  excludedLabel,
  sourceKindLabel,
  pricePoints,
  evidenceLabel,
  type PriceReferenceState,
} from "@used-books/session-client";
import {
  AppText,
  Button,
  ConfirmDialog,
  formatVnd,
  space,
  stitchTokens,
  colors,
} from "../../core/ui";

export function PriceReferencePanel({
  state,
  currentKey,
  disabled,
  onApply,
  aiReady,
}: {
  state: PriceReferenceState;
  currentKey: string;
  disabled: boolean;
  onApply: (amount: number) => void;
  aiReady: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(!aiReady);
  const value = currentReference(state, currentKey);

  if (!value) return null;

  const canApply = () =>
    !disabled && currentReference(state, currentKey)?.status === "Ready";

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 15 }}>
            Khoảng tham chiếu theo quy tắc
          </AppText>
          <AppText kind="small" color={stitchTokens.subtleGray}>
            Tính từ dữ liệu nguồn giá và tình trạng sách; không qua mô hình AI.
          </AppText>
        </View>
        {aiReady ? (
          <Button
            secondary
            title={expanded ? "Thu gọn" : "Xem"}
            onPress={() => setExpanded(!expanded)}
          />
        ) : null}
      </View>

      {expanded ? (
        <View style={{ gap: space.sm }}>
          {value.range && value.status === "Ready" ? (
            <View style={styles.rangeBox}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <AppText kind="price" color={stitchTokens.wine} style={{ fontSize: 20 }}>
                  {formatVnd(value.range.low)} – {formatVnd(value.range.high)}
                </AppText>
                <View style={styles.badge}>
                  <AppText kind="small" color={stitchTokens.wineDark} style={{ fontWeight: "600", fontSize: 11 }}>
                    {evidenceLabel[value.evidenceLevel]}
                  </AppText>
                </View>
              </View>

              <View style={styles.chipsRow}>
                {pricePoints(value.range).map((amount) => (
                  <Button
                    secondary
                    key={amount}
                    title={`Chọn ${formatVnd(amount)}`}
                    disabled={disabled}
                    onPress={() => {
                      if (canApply()) setSelected(amount);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : (
            <AppText kind="small" color={stitchTokens.deepCocoa}>
              {value.status === "Refused"
                ? "Chưa thể tính khoảng tham chiếu cho tình trạng này."
                : "Chưa đủ dữ liệu để tính khoảng tham chiếu."}{" "}
              Bạn vẫn có thể tự nhập giá.
            </AppText>
          )}

          {value.missing.map((text) => (
            <AppText key={text} kind="small" color={colors.warning}>
              • {text}
            </AppText>
          ))}

          {value.sources.length > 0 ? (
            <View style={styles.sourcesBox}>
              <AppText kind="label" color={stitchTokens.wineDark}>
                Nguồn giá ({value.sources.length})
              </AppText>
              {value.sources.map((source) => (
                <View key={source.ref} style={{ gap: 2 }}>
                  <AppText kind="small" color={stitchTokens.deepCocoa}>
                    {source.label} · {sourceKindLabel[source.kind]} · {formatVnd(source.amount)} ·{" "}
                    {new Date(source.observedAt).toLocaleDateString("vi-VN")}
                    {source.excluded ? ` · ${excludedLabel[source.excluded]}` : ""}
                    {!source.originGroup ? " · nguồn gốc chưa xác minh độc lập" : ""}
                  </AppText>
                  {source.url ? (
                    <Pressable
                      hitSlop={6}
                      onPress={() => void Linking.openURL(source.url!)}
                      style={{ alignSelf: "flex-start" }}
                    >
                      <AppText kind="small" color={stitchTokens.wine} style={{ textDecorationLine: "underline" }}>
                        Mở nguồn ↗
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <ConfirmDialog
        visible={selected !== null}
        title="Áp dụng mức giá tham chiếu?"
        message={`Giá bán sẽ được cập nhật thành ${formatVnd(selected ?? 0)}.`}
        confirmLabel="Áp dụng"
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          if (selected !== null) onApply(selected);
          setSelected(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.parchment,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  rangeBox: {
    backgroundColor: stitchTokens.white,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  badge: {
    backgroundColor: stitchTokens.goldLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  sourcesBox: {
    backgroundColor: stitchTokens.white,
    padding: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.xs,
  },
});
