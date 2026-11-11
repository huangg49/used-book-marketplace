import { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import * as Crypto from "expo-crypto";
import {
  autofillLabels,
  findIsbnMatches,
  type IsbnMatches,
  autofillSuggestion,
  autofillValue,
  createAssistRequest,
  type AutofillField,
  type AutofillSuggestion,
  ApiError,
  initialCatalogFields,
  catalogHints,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  Checkbox,
  ConfirmDialog,
  Notice,
  TextField,
  colors,
  space,
  stitchTokens,
} from "../../core/ui";
import type { Media } from "./contracts";
import { CatalogRecoveryPanel } from "./catalog-recovery-panel";

type Fields = AutofillSuggestion["fields"];
type Edits = Partial<Record<AutofillField, string>>;

const PHOTO_HINTS: Record<AutofillField, string> = {
  title: "Chụp rõ bìa trước hoặc trang nhan đề.",
  authors: "Chụp trang nhan đề hoặc gáy có tên tác giả. Ngăn cách nhiều tên bằng dấu chấm phẩy.",
  publisher: "Chụp trang bản quyền hoặc trang in ấn.",
  publicationYear: "Chụp dòng ghi năm xuất bản trên trang bản quyền.",
  language: "Chụp trang có nội dung chữ rõ.",
  edition: "Chụp dòng ghi tập hoặc lần xuất bản.",
  isbn: "Chụp mã vạch hoặc dòng ISBN nếu sách có.",
};

const ORDER: AutofillField[] = [
  "title",
  "authors",
  "publisher",
  "publicationYear",
  "language",
  "edition",
  "isbn",
];

function yearError(value: string | undefined): boolean {
  if (!value) return false;
  const maxYear = new Date().getUTCFullYear();
  return !/^\d{4}$/.test(value) || Number(value) < 1400 || Number(value) > maxYear;
}

function reviewFields(fields: Fields, edits: Edits): Fields {
  const search = initialCatalogFields(fields);
  const normalized = catalogHints({
    title: edits.title ?? search.title,
    authors: edits.authors ?? search.authors,
    edition: edits.edition ?? search.edition,
    isbn: edits.isbn ?? search.isbn,
  });
  const year = edits.publicationYear;
  return {
    ...normalized,
    publisher: edits.publisher === undefined ? fields.publisher : edits.publisher.trim() || null,
    publicationYear:
      year === undefined ? fields.publicationYear : year && !yearError(year) ? Number(year) : null,
    language: edits.language === undefined ? fields.language : edits.language || null,
  };
}

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

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [result, setResult] = useState<{
    signature: string;
    value: AutofillSuggestion;
  } | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [error, setError] = useState("");
  const [canSkipIsbn, setCanSkipIsbn] = useState(false);
  const [barcode, setBarcode] = useState<{ signature: string; value: IsbnMatches } | null>(null);
  const [barcodeIsbn, setBarcodeIsbn] = useState("");
  const [readPhase, setReadPhase] = useState("");
  const forcedAiSignature = useRef<string | null>(null);
  const [replace, setReplace] = useState<AutofillField[]>([]);
  const [showMissing, setShowMissing] = useState(false);
  const [used, setUsed] = useState<AutofillField[]>([]);

  const stale = !!result && result.signature !== signature;
  const locked = disabled || busy || stale;

  const reviewed = result ? reviewFields(result.value.fields, edits) : null;

  async function read(forceAi = false) {
    if (disabled || busyRef.current || !ids.length) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setCanSkipIsbn(false);
    const at = signature;
    try {
      if (forceAi) forcedAiSignature.current = at;
      if (!forceAi && forcedAiSignature.current !== at) {
        setReadPhase("Đang tìm mã vạch ISBN trên ảnh…");
        try {
          const found = await findIsbnMatches(client, listingId, ids);
          if (!active.current || latest.current !== at) return;
          if (found.status === "Ambiguous" || (found.status === "Found" && found.catalog?.items.length)) {
            setBarcode({ signature: at, value: found });
            setBarcodeIsbn(found.isbns.length === 1 ? found.isbns[0]! : "");
            setResult(null);
            return;
          }
        } catch (isbnErr) {
          if (
            isbnErr instanceof ApiError &&
            (isbnErr.status === 0 || isbnErr.status === 408 || isbnErr.status === 429 || isbnErr.status >= 500)
          ) {
            setCanSkipIsbn(true);
            setError("Chưa tra được mã vạch. Bạn có thể thử lại hoặc đọc chữ bằng AI.");
            return;
          }
          throw isbnErr;
        }
      }
      setBarcode(null);
      setReadPhase("Đang đọc thông tin bằng AI…");
      const value = await ask(
        `/listings/${listingId}/autofill-suggestions`,
        autofillSuggestion,
        { mediaIds: ids },
      );
      if (active.current && latest.current === at) {
        setResult({ signature: at, value });
        setEdits({});
        setUsed([]);
      }
    } catch {
      if (active.current) {
        setError(
          "Chưa đọc được ảnh. Thông tin đã nhập được giữ; bạn có thể thử lại hoặc tự nhập theo bìa.",
        );
      }
    } finally {
      busyRef.current = false;
      if (active.current) setBusy(false);
    }
  }

  function handleEditField(field: AutofillField, val: string) {
    setEdits((prev) => ({ ...prev, [field]: val }));
    setUsed((prev) => prev.filter((k) => k !== field));
  }

  function applyFields(fieldsToApply: AutofillField[]) {
    if (!reviewed || locked) return;
    for (const f of fieldsToApply) {
      onUseField(f, reviewed);
    }
    setUsed((prev) => [...new Set([...prev, ...fieldsToApply])]);
  }

  function chooseFields(fieldsToApply: AutofillField[]) {
    if (!reviewed || locked) return;
    const currentReviewed = reviewed;
    const changed = fieldsToApply.filter((f) => {
      const cur = currentValue(f).trim();
      const next = (autofillValue(currentReviewed, f) ?? "").trim();
      return cur && cur !== next;
    });
    if (changed.length > 0) {
      setReplace(fieldsToApply);
    } else {
      applyFields(fieldsToApply);
    }
  }

  const readFields = reviewed
    ? ORDER.filter((k) => (autofillValue(reviewed, k) ?? "").trim().length > 0)
    : [];
  const missingFields = ORDER.filter((k) => !readFields.includes(k));
  const unapplied = readFields.filter((k) => !used.includes(k));

  return (
    <View style={styles.container}>
      <AppText kind="heading">Điền nhanh từ ảnh</AppText>
      <AppText color={stitchTokens.deepCocoa}>
        Chọn ảnh bìa, gáy hoặc trang bản quyền. Bạn kiểm tra, sửa trực tiếp từng mục rồi chọn dùng.
      </AppText>

      {busy ? <AppText accessibilityLiveRegion="polite">{readPhase}</AppText> : null}

      {barcode ? (
        <View style={styles.barcodeBox}>
          <AppText kind="bold">Đối chiếu từ mã vạch ISBN</AppText>
          <AppText kind="small">
            Thông tin đầu sách được lấy từ danh mục. Lượt đối chiếu này không gọi AI.
          </AppText>
          {barcode.signature !== signature ? (
            <Notice tone="warning">Ảnh đã đổi. Đọc lại trước khi chọn kết quả ISBN.</Notice>
          ) : null}
          {barcode.value.status === "Ambiguous" ? (
            <>
              <AppText>Có nhiều ISBN trên các ảnh. Chọn mã thuộc cuốn sách đang đăng.</AppText>
              {barcode.value.isbns.map((isbn) => (
                <Button
                  secondary
                  key={isbn}
                  title={`Đối chiếu ISBN ${isbn}`}
                  disabled={disabled || busy || barcode.signature !== signature}
                  onPress={() => setBarcodeIsbn(isbn)}
                />
              ))}
            </>
          ) : null}
          {barcodeIsbn ? (
            <CatalogRecoveryPanel
              key={barcodeIsbn}
              compact
              listingId={listingId}
              initialHints={{
                title: null,
                authors: [],
                isbn: barcodeIsbn,
                publisher: null,
                publicationYear: null,
                language: null,
                edition: null,
              }}
              disabled={disabled || busy || barcode.signature !== signature}
              onSelectBook={onSelectBook}
            />
          ) : null}
          <Button
            secondary
            title="Đọc chữ bằng AI"
            disabled={disabled || busy || barcode.signature !== signature}
            onPress={() => void read(true)}
          />
        </View>
      ) : null}

      {/* Photo Picker Checkboxes */}
      {ready.length ? (
        <View style={{ gap: space.sm }}>
          <AppText kind="label">Ảnh để đọc — tối đa 3</AppText>
          {ready.map((p, i) => (
            <Checkbox
              key={p.id}
              title={`Đọc ảnh ${i + 1}${i === 0 ? " (ảnh bìa)" : ""}`}
              checked={ids.includes(p.id)}
              disabled={disabled || busy || (!ids.includes(p.id) && ids.length >= 3)}
              onPress={() =>
                setPicked(
                  ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id],
                )
              }
            />
          ))}
        </View>
      ) : (
        <AppText kind="small" color={stitchTokens.subtleGray}>
          {photos.some((p) => p.status === "Processing" || p.status === "Pending")
            ? "Ảnh đang được xử lý. Chờ ảnh sẵn sàng rồi bấm đọc."
            : "Chưa có ảnh sẵn sàng. Tải ảnh bản sách để AI đọc thông tin."}
        </AppText>
      )}

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button
          secondary
          title="Thêm ảnh để đọc"
          disabled={disabled || busy || photos.length >= 8}
          onPress={onAddPhoto}
        />
        <Button
          wine
          title={result ? "Đọc lại thông tin" : "Đọc thông tin từ ảnh"}
          disabled={disabled || !ids.length}
          busy={busy}
          onPress={() => void read()}
        />
        {canSkipIsbn ? (
          <Button
            secondary
            title="Đọc chữ bằng AI (Bỏ qua tra ISBN)"
            disabled={disabled || busy || !ids.length}
            onPress={() => void read(true)}
          />
        ) : null}
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {stale ? (
        <Notice>Ảnh để đọc đã thay đổi. Đọc lại để dùng gợi ý cho bộ ảnh hiện tại.</Notice>
      ) : null}

      {/* Result Card: Review and Edit read fields */}
      {result && reviewed ? (
        <View style={styles.resultCard}>
          <View style={{ gap: 2 }}>
            <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
              Rà soát thông tin đọc được từ ảnh
            </AppText>
            {result.value.cached ? (
              <AppText kind="small" color={stitchTokens.subtleGray}>
                Đã dùng lại kết quả của bộ ảnh này. Thêm hoặc thay ảnh để đọc dữ liệu mới.
              </AppText>
            ) : null}
          </View>

          {/* Read fields editor */}
          <View style={{ gap: space.sm }}>
            {readFields.map((field) => {
              const val = autofillValue(reviewed, field) ?? "";
              const isUsed = used.includes(field) || currentValue(field).trim() === val.trim();
              const hasYearErr = field === "publicationYear" && yearError(edits.publicationYear);

              return (
                <View key={field} style={styles.fieldRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText kind="label" color={stitchTokens.wineDark}>
                      {autofillLabels[field]}
                    </AppText>
                    <TextField
                      value={val}
                      editable={!locked}
                      keyboardType={field === "publicationYear" ? "number-pad" : "default"}
                      error={hasYearErr ? "Nhập năm gồm 4 chữ số từ 1400." : undefined}
                      onChangeText={(text) => handleEditField(field, text)}
                    />
                  </View>
                  <Button
                    secondary={!isUsed}
                    title={isUsed ? "✓ Đã dùng" : "Dùng"}
                    disabled={locked || hasYearErr}
                    onPress={() => chooseFields([field])}
                  />
                </View>
              );
            })}
          </View>

          {/* Missing fields collapsible */}
          {missingFields.length > 0 ? (
            <View style={{ gap: space.xs, paddingTop: 4 }}>
              <Button
                secondary
                title={
                  showMissing
                    ? "Thu gọn các mục chưa đọc được"
                    : `Bổ sung ${missingFields.length} mục chưa đọc được`
                }
                onPress={() => setShowMissing((v) => !v)}
              />
              {showMissing ? (
                <View style={styles.missingContainer}>
                  {missingFields.map((field) => {
                    const hint = PHOTO_HINTS[field];
                    const val = edits[field] ?? "";
                    const isUsed = used.includes(field) || (val.trim() && currentValue(field).trim() === val.trim());
                    const hasYearErr = field === "publicationYear" && yearError(edits.publicationYear);

                    return (
                      <View key={field} style={styles.fieldRow}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText kind="label" color={stitchTokens.wineDark}>
                            {autofillLabels[field]}
                          </AppText>
                          <AppText kind="small" color={stitchTokens.subtleGray}>
                            {hint}
                          </AppText>
                          <TextField
                            placeholder="Nhập bổ sung"
                            value={val}
                            editable={!locked}
                            keyboardType={field === "publicationYear" ? "number-pad" : "default"}
                            error={hasYearErr ? "Nhập năm gồm 4 chữ số từ 1400." : undefined}
                            onChangeText={(text) => handleEditField(field, text)}
                          />
                        </View>
                        <Button
                          secondary={!isUsed}
                          title={isUsed ? "✓ Đã dùng" : "Dùng"}
                          disabled={locked || !val.trim() || hasYearErr}
                          onPress={() => chooseFields([field])}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Batch Apply Button */}
          {unapplied.length > 0 ? (
            <Button
              wine
              title={
                Object.keys(edits).length > 0
                  ? "Dùng tất cả thông tin đã rà soát"
                  : "Dùng tất cả thông tin đọc được"
              }
              disabled={locked || yearError(edits.publicationYear)}
              onPress={() => chooseFields(unapplied)}
            />
          ) : null}
        </View>
      ) : null}

      {/* Catalog Recovery Panel with reviewed fields passed down */}
      {result || error ? (
        <CatalogRecoveryPanel
          key={result?.value.id ?? listingId}
          listingId={listingId}
          reviewed={reviewed}
          disabled={locked}
          onSelectBook={onSelectBook}
        />
      ) : null}

      {/* Confirm replace dialog */}
      <ConfirmDialog
        visible={replace.length > 0}
        title="Thay thế thông tin đang nhập?"
        message={`Có ${replace.length} trường thông tin trên biểu mẫu đã có nội dung. Bạn có muốn ghi đè bằng thông tin từ ảnh đã rà soát?`}
        confirmLabel="Ghi đè"
        onCancel={() => setReplace([])}
        onConfirm={() => {
          applyFields(replace);
          setReplace([]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderColor: colors.rule,
  },
  barcodeBox: {
    backgroundColor: stitchTokens.warmIvory,
    padding: space.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  resultCard: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.md,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  missingContainer: {
    backgroundColor: stitchTokens.white,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
});
