import { useState } from "react";
import { View } from "react-native";
import { AppText, Button, Chip, Notice, TextField, space } from "../../core/ui";
import { conditions } from "../shelf/contracts";
import { appendBundleRange, type BookBundle } from "./book-bundle";

export function BundleEditor({
  value,
  onChange,
  disabled,
  error,
}: {
  value: BookBundle;
  onChange: (bundle: BookBundle) => void;
  disabled: boolean;
  error?: string;
}) {
  const [from, setFrom] = useState("1"),
    [to, setTo] = useState("20");
  const [rangeError, setRangeError] = useState("");
  function change(index: number, patch: Partial<BookBundle["items"][number]>) {
    onChange({
      ...value,
      items: value.items.map((item, position) =>
        index === position ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <View style={{ gap: space.md }}>
      <AppText kind="heading" accessibilityRole="header">
        Bộ sách bán nguyên bộ
      </AppText>
      <AppText>
        Một tin, một giá cho 2–50 cuốn. Chỉ ghi các cuốn thực sự giao; thiếu tập
        nào thì bỏ tập đó.
      </AppText>
      <TextField
        label="Tên bộ sách"
        required
        value={value.title}
        maxLength={300}
        editable={!disabled}
        onChangeText={(title) => onChange({ ...value, title })}
      />
      <AppText>
        Thêm nhanh dãy tập giữ nguyên các cuốn và ghi chú đã nhập.
      </AppText>
      <TextField
        label="Từ tập"
        value={from}
        editable={!disabled}
        keyboardType="number-pad"
        onChangeText={setFrom}
        maxLength={4}
      />
      <TextField
        label="Đến tập"
        value={to}
        editable={!disabled}
        keyboardType="number-pad"
        onChangeText={setTo}
        maxLength={4}
      />
      <Button
        secondary
        title="Thêm dãy tập"
        disabled={disabled}
        onPress={() => {
          try {
            onChange(appendBundleRange(value, from, to));
            setRangeError("");
          } catch (cause) {
            setRangeError(
              cause instanceof Error
                ? cause.message
                : "Chưa thêm được dãy tập.",
            );
          }
        }}
      />
      {rangeError ? <Notice tone="error">{rangeError}</Notice> : null}
      <AppText kind="bold">Danh sách {value.items.length} cuốn sẽ giao</AppText>
      {value.items.map((item, index) => (
        <View key={index} style={{ gap: space.sm }}>
          <TextField
            label={`Cuốn/tập ${index + 1}`}
            required
            value={item.label}
            maxLength={200}
            editable={!disabled}
            onChangeText={(label) => change(index, { label })}
          />
          <AppText>Tình trạng cuốn {index + 1}</AppText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {Object.entries(conditions).map(([condition, label]) => (
              <Chip
                key={condition}
                title={label}
                selected={item.condition === condition}
                disabled={disabled}
                onPress={() =>
                  change(index, {
                    condition: condition as typeof item.condition,
                  })
                }
              />
            ))}
          </View>
          <TextField
            label={`Ghi chú cuốn ${index + 1}`}
            value={item.notes}
            multiline
            maxLength={500}
            editable={!disabled}
            onChangeText={(notes) => change(index, { notes })}
          />
          <Button
            secondary
            title={`Bỏ cuốn ${index + 1} khỏi bộ`}
            disabled={disabled || value.items.length <= 2}
            onPress={() =>
              onChange({
                ...value,
                items: value.items.filter((_, i) => i !== index),
              })
            }
          />
        </View>
      ))}
      <Button
        secondary
        title="Thêm cuốn khác"
        disabled={disabled || value.items.length >= 50}
        onPress={() =>
          onChange({
            ...value,
            items: [
              ...value.items,
              { label: "", condition: "Good", notes: "" },
            ],
          })
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <AppText>
        Chọn một cuốn trong bộ làm đầu sách đại diện ở bên dưới để phân loại.
        Danh sách này xác định chính xác người mua nhận được gì.
      </AppText>
    </View>
  );
}
