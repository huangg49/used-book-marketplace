import { View } from "react-native";
import { AppText, Button, Notice, TextField, space } from "../../core/ui";
import type { Form, Errors } from "./listing-form";
import { conditionOptions } from "./book-condition";
// Lets the editor scroll a validation error's field into view.
export type Anchor = (field: keyof Errors) => (node: View | null) => void;
const noAnchor: Anchor = () => () => {};
// Registry of mounted field wrappers; ref callbacks fill it after render.
export function createAnchors() {
  const nodes = new Map<keyof Errors, View>();
  const anchor: Anchor = (field) => (node) => {
    if (node) nodes.set(field, node);
    else nodes.delete(field);
  };
  return { anchor, get: (field: keyof Errors) => nodes.get(field) };
}
export function Choice<T extends string | boolean>({
  title,
  value,
  options,
  onChange,
  disabled,
  error,
}: {
  title: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
  error?: string;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="bold">{title}</AppText>
      {options.map((o) => (
        <Button
          key={String(o.value)}
          secondary={value !== o.value}
          selected={value === o.value}
          title={`${value === o.value ? "Đã chọn: " : ""}${o.label}`}
          disabled={disabled}
          onPress={() => onChange(o.value)}
        />
      ))}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}
export function ConditionFields({
  form,
  onChange,
  disabled,
  errors,
  anchor = noAnchor,
}: {
  form: Form;
  onChange: (next: Form) => void;
  disabled: boolean;
  errors: Errors;
  anchor?: Anchor;
}) {
  return (
    <View style={{ gap: space.xl }}>
      <View ref={anchor("condition")}>
        <Choice
          title="Tình trạng tổng thể"
          value={form.condition}
          options={conditionOptions}
          disabled={disabled}
          error={errors.condition}
          onChange={(condition) => onChange({ ...form, condition })}
        />
      </View>
      {(
        [
          {
            key: "pages",
            label: "Ruột sách và trang thiếu",
            hint: "Đủ trang hay thiếu trang nào? Có ố, rách hoặc bong trang không?",
          },
          {
            key: "coverNote",
            label: "Bìa và gáy sách",
            hint: "Mô tả góc sờn, nếp gấp hoặc phần bong gáy.",
          },
          {
            key: "notes",
            label: "Ghi chú và đánh dấu",
            hint: "Có viết, tô hoặc gạch chân không? Nếu không, ghi ‘Không có’.",
          },
          {
            key: "accessories",
            label: "Phụ kiện đi kèm",
            hint: "Ví dụ: áo bìa, bản đồ, thẻ. Nếu không, ghi ‘Không có’.",
          },
          {
            key: "description",
            label: "Vài dòng gửi người đọc sau",
            hint: "Từ 30 đến 5.000 ký tự: điều người đọc sau nên biết về cuốn sách này.",
          },
        ] as const
      ).map(({ key, label, hint }) => (
        <View key={key} ref={anchor(key)}>
          <TextField
            label={label}
            hint={hint}
            multiline
            // Validate code points on save/submit; UTF-16 maxLength would silently truncate emoji.
            value={form[key]}
            editable={!disabled}
            error={errors[key]}
            onChangeText={(v) => onChange({ ...form, [key]: v })}
          />
        </View>
      ))}
      <View ref={anchor("readable")}>
        <Choice
          title="Nội dung có còn đọc rõ?"
          value={form.readable}
          options={[
            { value: true, label: "Có, còn đọc rõ" },
            { value: false, label: "Không" },
          ]}
          disabled={disabled}
          error={errors.readable}
          onChange={(readable) => onChange({ ...form, readable })}
        />
      </View>
      <View ref={anchor("hasMissingPages")}>
        <Choice
          title="Sách có thiếu trang?"
          value={form.hasMissingPages}
          options={[
            { value: false, label: "Không thiếu trang" },
            { value: true, label: "Có — tôi đã mô tả trang thiếu ở trên" },
          ]}
          disabled={disabled}
          error={errors.hasMissingPages}
          onChange={(hasMissingPages) => onChange({ ...form, hasMissingPages })}
        />
      </View>
      <View ref={anchor("missingEssentialContent")}>
        <Choice
          title="Có thiếu phần nội dung trọng yếu?"
          value={form.missingEssentialContent}
          options={[
            { value: false, label: "Không thiếu nội dung trọng yếu" },
            { value: true, label: "Có thiếu" },
          ]}
          disabled={disabled}
          error={errors.missingEssentialContent}
          onChange={(missingEssentialContent) =>
            onChange({ ...form, missingEssentialContent })
          }
        />
      </View>
    </View>
  );
}
export function PricingFields({
  form,
  onChange,
  disabled,
  errors,
  anchor = noAnchor,
}: {
  form: Form;
  onChange: (next: Form) => void;
  disabled: boolean;
  errors: Errors;
  anchor?: Anchor;
}) {
  return (
    <View style={{ gap: space.xl }}>
      <AppText>
        Giá bán và giá trị đổi là hai thông tin riêng. Chọn cách bạn muốn chuyền
        cuốn sách này.
      </AppText>
      <View ref={anchor("mode")}>
        <Choice
          title="Bạn muốn bán hay đổi?"
          value={form.mode}
          options={[
            { value: "Sale", label: "Bán sách" },
            { value: "Exchange", label: "Đổi sách" },
            { value: "Both", label: "Bán hoặc đổi" },
          ]}
          disabled={disabled}
          error={errors.mode}
          onChange={(mode) => onChange({ ...form, mode })}
        />
      </View>
      {form.mode === "Sale" || form.mode === "Both" ? (
        <View ref={anchor("salePrice")}>
          <TextField
            label="Giá bán (đồng)"
            hint="Từ 10.000 đến 1.000.000 đồng. Ví dụ: 125000."
            keyboardType="number-pad"
            value={form.salePrice}
            editable={!disabled}
            onChangeText={(salePrice) => onChange({ ...form, salePrice })}
            error={errors.salePrice}
            maxLength={12}
          />
        </View>
      ) : null}
      {form.mode === "Exchange" || form.mode === "Both" ? (
        <View ref={anchor("exchangeValue")}>
          <TextField
            label="Giá trị đổi (đồng)"
            hint="Mức giá trị để đối chiếu khi đổi sách; từ 10.000 đến 1.000.000 đồng."
            keyboardType="number-pad"
            value={form.exchangeValue}
            editable={!disabled}
            onChangeText={(exchangeValue) =>
              onChange({ ...form, exchangeValue })
            }
            error={errors.exchangeValue}
            maxLength={12}
          />
        </View>
      ) : null}
    </View>
  );
}
