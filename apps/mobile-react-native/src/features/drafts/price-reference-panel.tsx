import { useState } from "react";
import { Linking, View } from "react-native";
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
  const [selected, setSelected] = useState<number | null>(null),
    [expanded, setExpanded] = useState(false);
  const value = currentReference(state, currentKey);
  if (!value) return null;
  const canApply = () =>
    !disabled && currentReference(state, currentKey)?.status === "Ready";
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">Khoảng tham chiếu theo quy tắc</AppText>
      {aiReady ? (
        <Button
          secondary
          title={
            expanded
              ? "Thu gọn khoảng tham chiếu"
              : "Xem khoảng tham chiếu theo quy tắc"
          }
          onPress={() => setExpanded(!expanded)}
        />
      ) : null}
      {!aiReady || expanded ? (
        <>
          <AppText kind="small">
            Tính từ nguồn giá và tình trạng bạn khai; không phải kết quả AI hoặc
            giá thị trường đã xác minh.
          </AppText>
          {value.range && value.status === "Ready" ? (
            <>
              <AppText kind="price">
                {formatVnd(value.range.low)} – {formatVnd(value.range.high)}
              </AppText>
              <AppText kind="small">
                {evidenceLabel[value.evidenceLevel]}
              </AppText>
              {pricePoints(value.range).map((amount) => (
                <Button
                  secondary
                  key={amount}
                  title={`Chọn mức tham chiếu ${formatVnd(amount)}`}
                  disabled={disabled}
                  onPress={() => {
                    if (canApply()) setSelected(amount);
                  }}
                />
              ))}
            </>
          ) : (
            <AppText>
              {value.status === "Refused"
                ? "Chưa thể tính khoảng tham chiếu cho tình trạng này."
                : "Chưa đủ dữ liệu để tính khoảng tham chiếu."}{" "}
              Bạn vẫn có thể nhập giá.
            </AppText>
          )}
          {value.missing.map((text) => (
            <AppText key={text} kind="small">
              {text}
            </AppText>
          ))}
          {value.sources.map((source) => (
            <AppText key={source.ref} kind="small">
              {source.label} · {sourceKindLabel[source.kind]} ·{" "}
              {formatVnd(source.amount)} ·{" "}
              {new Date(source.observedAt).toLocaleDateString("vi-VN")}
              {source.excluded ? ` · ${excludedLabel[source.excluded]}` : ""}
              {!source.originGroup ? " · nguồn gốc chưa xác minh độc lập" : ""}
              {source.url ? (
                <AppText
                  kind="small"
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(source.url!)}
                >
                  {" "}
                  · Mở nguồn
                </AppText>
              ) : null}
            </AppText>
          ))}
        </>
      ) : null}
      <ConfirmDialog
        visible={selected !== null}
        title="Dùng mức giá tham chiếu?"
        message={`Dùng ${formatVnd(selected ?? 0)} làm giá bán. Đây là mức tính theo quy tắc, không ghi nhận là bạn đã áp dụng gợi ý AI.`}
        confirmLabel="Dùng giá tham chiếu"
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          if (selected !== null && canApply()) onApply(selected);
          setSelected(null);
        }}
      />
    </View>
  );
}
