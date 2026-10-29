import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import {
  autofillLabels,
  autofillSuggestion,
  autofillValue,
  createAssistRequest,
  type AutofillField,
  type AutofillSuggestion,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Checkbox,
  ConfirmDialog,
  Notice,
  colors,
  space,
} from "../../core/ui";
import type { Media } from "./contracts";

import { CatalogRecoveryPanel } from "./catalog-recovery-panel";

type Fields = AutofillSuggestion["fields"];
export function PhotoAutofillPanel({
  listingId,
  photos,
  disabled,
  onAddPhoto,
  onUseField,
  onSelectBook,
  currentValue,
}: {
  listingId: string;
  photos: Media[];
  disabled: boolean;
  onAddPhoto: () => void;
  onUseField: (field: AutofillField, fields: Fields) => void;
  onSelectBook: (id: string) => void;
  currentValue: (field: AutofillField) => string;
}) {
  const { client } = useSession();
  const [ask] = useState(() => createAssistRequest(client, Crypto.randomUUID));
  const ready = photos.filter((p) => p.status === "Ready");
  const [picked, setPicked] = useState<string[] | null>(null);
  const ids = (picked ?? ready.slice(0, 3).map((p) => p.id)).filter((id) =>
    ready.some((p) => p.id === id),
  );
  const signature = JSON.stringify([listingId, ids]);
  const latest = useRef(signature);
  useEffect(() => {
    latest.current = signature;
  }, [signature]);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [result, setResult] = useState<{
    signature: string;
    value: AutofillSuggestion;
  } | null>(null);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState<AutofillField | null>(null);
  const [showFields, setShowFields] = useState(false);
  const [used, setUsed] = useState<AutofillField[]>([]);
  const stale = !!result && result.signature !== signature;
  const locked = disabled || busy || stale;
  async function read() {
    if (disabled || busyRef.current || !ids.length) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const at = signature;
    try {
      const value = await ask(
        `/listings/${listingId}/autofill-suggestions`,
        autofillSuggestion,
        { mediaIds: ids },
      );
      if (active.current && latest.current === at) {
        setResult({ signature: at, value });
        setUsed([]);
      }
    } catch {
      if (active.current)
        setError(
          "Chưa đọc được ảnh. Thông tin đã nhập được giữ; bạn có thể thử lại hoặc tự nhập theo bìa.",
        );
    } finally {
      busyRef.current = false;
      if (active.current) setBusy(false);
    }
  }
  function apply(field: AutofillField) {
    if (!result || locked) return;
    onUseField(field, result.value.fields);
    setUsed((prev) => [...new Set([...prev, field])]);
  }
  function choose(field: AutofillField) {
    if (!result || locked) return;
    const next = autofillValue(result.value.fields, field);
    if (currentValue(field).trim() && currentValue(field).trim() !== next)
      setReplace(field);
    else apply(field);
  }
  return (
    <View
      style={{
        gap: space.sm,
        paddingVertical: space.md,
        borderBottomWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <AppText kind="heading">Điền nhanh từ ảnh</AppText>
      <AppText>
        Chọn ảnh bìa, gáy hoặc trang bản quyền. Bạn kiểm tra và chọn từng thông
        tin trước khi dùng.
      </AppText>
      {ready.length ? (
        <View style={{ gap: space.sm }}>
          <AppText kind="label">Ảnh để đọc — tối đa 3</AppText>
          {ready.map((p, i) => (
            <Checkbox
              key={p.id}
              title={`Đọc ảnh ${i + 1}${i === 0 ? " (ảnh bìa)" : ""}`}
              checked={ids.includes(p.id)}
              disabled={
                disabled || busy || (!ids.includes(p.id) && ids.length >= 3)
              }
              onPress={() =>
                setPicked(
                  ids.includes(p.id)
                    ? ids.filter((id) => id !== p.id)
                    : [...ids, p.id],
                )
              }
            />
          ))}
        </View>
      ) : (
        <AppText kind="small">
          {photos.some(
            (p) => p.status === "Processing" || p.status === "Pending",
          )
            ? "Ảnh đang được xử lý. Chờ ảnh sẵn sàng rồi bấm đọc."
            : "Chưa có ảnh sẵn sàng. Ảnh bạn tải ở đây cũng được dùng cho bản sách."}
        </AppText>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button
          secondary
          title="Thêm ảnh để đọc"
          disabled={disabled || busy || photos.length >= 8}
          onPress={onAddPhoto}
        />
        <Button
          title={result ? "Đọc lại thông tin" : "Đọc thông tin từ ảnh"}
          disabled={disabled || !ids.length}
          busy={busy}
          onPress={() => void read()}
        />
      </View>
      {busy ? (
        <AppText accessibilityLiveRegion="polite">
          Đang đọc chữ và đối chiếu danh mục… Bạn vẫn có thể tự nhập thông tin.
        </AppText>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {stale ? (
        <Notice>
          Ảnh để đọc đã thay đổi. Đọc lại để dùng gợi ý cho bộ ảnh hiện tại.
        </Notice>
      ) : null}
      {result || error ? <CatalogRecoveryPanel key={result?.value.id ?? listingId} listingId={listingId} suggestion={result?.value ?? null} disabled={locked} onSelectBook={onSelectBook} /> : null}
      {result ? (
        <View style={{ gap: space.sm }}>
          <AppText kind="bold">Gợi ý từ ảnh — kiểm tra lại</AppText>
          {result.value.cached ? (
            <AppText kind="small">Kết quả đã lưu cho cùng bộ ảnh.</AppText>
          ) : null}
          {result.value.matches.length > 0 ? (
            <Button
              secondary
              title={
                showFields
                  ? "Thu gọn thông tin đọc được"
                  : "Xem và dùng từng thông tin đọc được"
              }
              onPress={() => setShowFields((value) => !value)}
            />
          ) : null}
          {result.value.matches.length === 0 || showFields
            ? (Object.keys(autofillLabels) as AutofillField[]).map((field) => {
                const value = autofillValue(result.value.fields, field);
                return value ? (
                  <View key={field} style={{ gap: space.xs }}>
                    <AppText kind="label">{autofillLabels[field]}</AppText>
                    <AppText>{value}</AppText>
                    <Button
                      secondary
                      title={
                        used.includes(field)
                          ? `Dùng lại ${autofillLabels[field]}`
                          : `Dùng ${autofillLabels[field]}`
                      }
                      disabled={locked}
                      onPress={() => choose(field)}
                    />
                  </View>
                ) : null;
              })
            : null}
          {result.value.missing.map((text) => (
            <AppText key={text} kind="small">
              {text}
            </AppText>
          ))}
          {!result.value.fields.title ? (
            <AppText>
              Chụp rõ bìa trước hoặc thêm trang bản quyền; bạn vẫn có thể tự
              nhập.
            </AppText>
          ) : null}
        </View>
      ) : null}
      <ConfirmDialog
        visible={!!replace}
        title="Thay thông tin đang nhập?"
        message={
          replace
            ? `${autofillLabels[replace]} đã có nội dung. Dùng giá trị gợi ý từ ảnh để thay thế?`
            : ""
        }
        confirmLabel="Dùng gợi ý"
        onCancel={() => setReplace(null)}
        onConfirm={() => {
          if (replace) apply(replace);
          setReplace(null);
        }}
      />
    </View>
  );
}
