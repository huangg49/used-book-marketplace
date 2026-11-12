import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
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
  ConfirmDialog,
  Icon,
  Notice,
  TextField,
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
  const [expanded, setExpanded] = useState(false);
  const isExpanded = expanded || busy;

  const stale = !!result && result.signature !== signature;
  const locked = disabled || busy || stale;

  const reviewed = result ? reviewFields(result.value.fields, edits) : null;

  async function read(forceAi = false) {
    if (disabled || busyRef.current || !ids.length) return;
    busyRef.current = true;
    setBusy(true);
    setExpanded(true);
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
      {/* 3D Header Section (Collapsible Dropdown Toggle) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isExpanded
            ? "Thu gọn công cụ điền nhanh từ ảnh sách"
            : "Mở công cụ điền nhanh từ ảnh sách bằng AI"
        }
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [
          styles.headerPressable,
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 8 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: stitchTokens.whiteAlpha14,
                borderWidth: 1,
                borderColor: stitchTokens.whiteAlpha25,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="bolt" size={18} color={stitchTokens.goldAccent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <AppText
                  kind="bold"
                  color={stitchTokens.whiteSurface}
                  style={{ fontSize: 15, lineHeight: 20 }}
                >
                  Điền nhanh từ ảnh sách
                </AppText>
                <View
                  style={{
                    backgroundColor: stitchTokens.goldAccent,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: stitchTokens.goldBorder,
                  }}
                >
                  <AppText
                    kind="small"
                    color={stitchTokens.wineDark}
                    style={{ fontSize: 10, fontWeight: "800" }}
                  >
                    ✨ TRỢ LÝ AI
                  </AppText>
                </View>
              </View>
              {!isExpanded ? (
                <AppText
                  kind="small"
                  color={stitchTokens.whiteAlpha85}
                  numberOfLines={1}
                  style={{ fontSize: 11, lineHeight: 15 }}
                >
                  {ready.length > 0
                    ? `${ready.length} ảnh sẵn sàng · Chạm để AI quét bìa, tác giả`
                    : "Chụp bìa, gáy để AI tự điền tên, tác giả, NXB…"}
                </AppText>
              ) : null}
            </View>
          </View>

          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: stitchTokens.whiteAlpha14,
              borderWidth: 1,
              borderColor: stitchTokens.whiteAlpha25,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name={isExpanded ? "chevronUp" : "chevronDown"}
              size={16}
              color={stitchTokens.goldAccent}
            />
          </View>
        </View>
      </Pressable>

      {isExpanded ? (
        <View style={styles.expandedContent}>
          <AppText
            kind="small"
            color={stitchTokens.deepCocoa}
            style={{ fontSize: 12, lineHeight: 17 }}
          >
            Chụp bìa, gáy hoặc trang bản quyền — AI tự động nhận diện tên sách, tác giả và NXB.
          </AppText>

          {busy ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: stitchTokens.warmIvory,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: stitchTokens.goldAccent,
              }}
            >
              <Icon name="sync" size={14} color={stitchTokens.wineDark} />
              <AppText
                accessibilityLiveRegion="polite"
                kind="small"
                color={stitchTokens.wineDark}
                style={{ fontWeight: "700", fontSize: 11 }}
              >
                {readPhase || "Đang nhận diện thông tin qua AI…"}
              </AppText>
            </View>
          ) : null}

          {barcode ? (
            <View style={styles.barcodeBox}>
              <AppText kind="bold" color={stitchTokens.wineDark}>
                Đối chiếu từ mã vạch ISBN
              </AppText>
              <AppText kind="small" color={stitchTokens.subtleGray}>
                Thông tin đầu sách được lấy từ danh mục. Lượt đối chiếu này không gọi AI.
              </AppText>
              {barcode.signature !== signature ? (
                <Notice tone="warning">Ảnh đã đổi. Đọc lại trước khi chọn kết quả ISBN.</Notice>
              ) : null}
              {barcode.value.status === "Ambiguous" ? (
                <>
                  <AppText kind="small" color={stitchTokens.wineDark}>
                    Có nhiều ISBN trên các ảnh. Chọn mã thuộc cuốn sách đang đăng.
                  </AppText>
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
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <AppText kind="label" color={stitchTokens.wineDark}>
                  Ảnh chọn đọc ({ids.length}/3)
                </AppText>
                <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 10 }}>
                  Tối đa 3 ảnh
                </AppText>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {ready.map((p, i) => {
                  const isSelected = ids.includes(p.id);
                  const canSelect = isSelected || ids.length < 3;
                  return (
                    <Pressable
                      key={p.id}
                      disabled={disabled || busy || (!canSelect && !isSelected)}
                      onPress={() =>
                        setPicked(isSelected ? ids.filter((id) => id !== p.id) : [...ids, p.id])
                      }
                      style={({ pressed }) => [
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderBottomWidth: isSelected ? 2.5 : 1,
                          backgroundColor: isSelected ? stitchTokens.warmIvory : stitchTokens.whiteSurface,
                          borderColor: isSelected ? stitchTokens.wineDark : stitchTokens.sandBorder,
                          borderBottomColor: isSelected ? stitchTokens.wine : stitchTokens.sandBorder,
                        },
                        pressed && { opacity: 0.8 },
                        !canSelect && !isSelected && { opacity: 0.4 },
                      ]}
                    >
                      <Icon
                        name={isSelected ? "check" : "camera"}
                        size={14}
                        color={isSelected ? stitchTokens.wine : stitchTokens.subtleGray}
                      />
                      <AppText
                        kind="small"
                        color={isSelected ? stitchTokens.wineDark : stitchTokens.subtleGray}
                        style={{ fontSize: 11, fontWeight: isSelected ? "700" : "500" }}
                      >
                        {`Ảnh ${i + 1}${i === 0 ? " (bìa)" : ""}`}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 10,
                backgroundColor: stitchTokens.whiteSurface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: stitchTokens.peachBorder,
              }}
            >
              <Icon name="camera" size={18} color={stitchTokens.roseBrown} />
              <AppText kind="small" color={stitchTokens.roseBrown} style={{ flex: 1, fontSize: 11, lineHeight: 16 }}>
                {photos.some((p) => p.status === "Processing" || p.status === "Pending")
                  ? "Ảnh đang được xử lý. Chờ ảnh sẵn sàng rồi bấm đọc."
                  : "Chưa có ảnh sẵn sàng. Vui lòng tải ảnh bản sách để AI đọc thông tin."}
              </AppText>
            </View>
          )}

          {/* 3D Action Buttons */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thêm ảnh để đọc"
              disabled={disabled || busy || photos.length >= 8}
              onPress={onAddPhoto}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 9,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderBottomWidth: 2.5,
                  backgroundColor: stitchTokens.whiteSurface,
                  borderColor: stitchTokens.peachBorder,
                  borderBottomColor: stitchTokens.peachBorder,
                },
                pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
                (disabled || busy || photos.length >= 8) && { opacity: 0.5 },
              ]}
            >
              <Icon name="plus" size={14} color={stitchTokens.wineDark} />
              <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 12 }}>
                Thêm ảnh để đọc
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={result ? "Đọc lại thông tin" : "Đọc thông tin từ ảnh"}
              disabled={disabled || !ids.length || busy}
              onPress={() => void read()}
              style={({ pressed }) => {
                const hasPhotos = ids.length > 0 && !disabled && !busy;
                return [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 9,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderBottomWidth: 3,
                    backgroundColor: hasPhotos ? stitchTokens.wine : stitchTokens.canvasMuted,
                    borderColor: hasPhotos ? stitchTokens.wineDark : stitchTokens.borderWarm,
                    borderBottomColor: hasPhotos ? stitchTokens.wineDark : stitchTokens.borderWarm,
                  },
                  pressed && hasPhotos && { opacity: 0.85, transform: [{ translateY: 1 }] },
                ];
              }}
            >
              <Icon
                name={result ? "sync" : "bolt"}
                size={14}
                color={ids.length && !disabled && !busy ? stitchTokens.white : stitchTokens.subtleGray}
              />
              <AppText
                kind="bold"
                color={ids.length && !disabled && !busy ? stitchTokens.white : stitchTokens.subtleGray}
                style={{ fontSize: 12, fontWeight: "700" }}
              >
                {result ? "Đọc lại thông tin" : "Đọc thông tin từ ảnh"}
              </AppText>
            </Pressable>

            {canSkipIsbn ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đọc chữ bằng AI (Bỏ qua tra ISBN)"
                disabled={disabled || busy || !ids.length}
                onPress={() => void read(true)}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderBottomWidth: 2,
                    backgroundColor: stitchTokens.warmIvory,
                    borderColor: stitchTokens.goldAccent,
                    borderBottomColor: stitchTokens.goldAccent,
                  },
                  pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
                  (disabled || busy || !ids.length) && { opacity: 0.5 },
                ]}
              >
                <Icon name="bolt" size={13} color={stitchTokens.goldBronze} />
                <AppText kind="bold" color={stitchTokens.goldBronze} style={{ fontSize: 11 }}>
                  Bỏ qua tra ISBN, đọc AI ngay
                </AppText>
              </Pressable>
            ) : null}
          </View>

          {error ? <Notice tone="error">{error}</Notice> : null}
          {stale ? (
            <Notice>Ảnh để đọc đã thay đổi. Đọc lại để dùng gợi ý cho bộ ảnh hiện tại.</Notice>
          ) : null}

          {/* Result Card: Review and Edit read fields */}
          {result && reviewed ? (
            <View style={styles.resultCard}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ gap: 2, flex: 1 }}>
                  <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 15 }}>
                    Rà soát thông tin đọc được
                  </AppText>
                  {result.value.cached ? (
                    <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 11 }}>
                      Dùng lại kết quả bộ ảnh này. Thêm hoặc thay ảnh để đọc lại.
                    </AppText>
                  ) : null}
                </View>
                <View
                  style={{
                    backgroundColor: stitchTokens.likeNewGreenBg,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: stitchTokens.likeNewGreen,
                  }}
                >
                  <AppText
                    kind="small"
                    color={stitchTokens.likeNewGreen}
                    style={{ fontSize: 9, fontWeight: "700" }}
                  >
                    ĐÃ ĐỌC XONG
                  </AppText>
                </View>
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
                        <AppText kind="label" color={stitchTokens.wineDark} style={{ fontSize: 11 }}>
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
                      <Pressable
                        disabled={locked || hasYearErr}
                        onPress={() => chooseFields([field])}
                        style={({ pressed }) => [
                          {
                            paddingVertical: 9,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderBottomWidth: 2,
                            backgroundColor: isUsed ? stitchTokens.likeNewGreenBg : stitchTokens.whiteSurface,
                            borderColor: isUsed ? stitchTokens.likeNewGreen : stitchTokens.peachBorder,
                            borderBottomColor: isUsed ? stitchTokens.likeNewGreen : stitchTokens.peachBorder,
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: hasYearErr ? 18 : 2,
                          },
                          pressed && { opacity: 0.8 },
                          (locked || hasYearErr) && { opacity: 0.5 },
                        ]}
                      >
                        <AppText
                          kind="bold"
                          color={isUsed ? stitchTokens.likeNewGreen : stitchTokens.wineDark}
                          style={{ fontSize: 11 }}
                        >
                          {isUsed ? "✓ Đã dùng" : "Dùng"}
                        </AppText>
                      </Pressable>
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
                              <AppText kind="label" color={stitchTokens.wineDark} style={{ fontSize: 11 }}>
                                {autofillLabels[field]}
                              </AppText>
                              <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 10 }}>
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
                            <Pressable
                              disabled={locked || !val.trim() || hasYearErr}
                              onPress={() => chooseFields([field])}
                              style={({ pressed }) => [
                                {
                                  paddingVertical: 9,
                                  paddingHorizontal: 12,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderBottomWidth: 2,
                                  backgroundColor: isUsed ? stitchTokens.likeNewGreenBg : stitchTokens.whiteSurface,
                                  borderColor: isUsed ? stitchTokens.likeNewGreen : stitchTokens.peachBorder,
                                  borderBottomColor: isUsed ? stitchTokens.likeNewGreen : stitchTokens.peachBorder,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  marginBottom: hasYearErr ? 18 : 2,
                                },
                                pressed && { opacity: 0.8 },
                                (locked || !val.trim() || hasYearErr) && { opacity: 0.5 },
                              ]}
                            >
                              <AppText
                                kind="bold"
                                color={isUsed ? stitchTokens.likeNewGreen : stitchTokens.wineDark}
                                style={{ fontSize: 11 }}
                              >
                                {isUsed ? "✓ Đã dùng" : "Dùng"}
                              </AppText>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Batch Apply Button */}
              {unapplied.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={locked || yearError(edits.publicationYear)}
                  onPress={() => chooseFields(unapplied)}
                  style={({ pressed }) => [
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderBottomWidth: 3,
                      backgroundColor: stitchTokens.wine,
                      borderColor: stitchTokens.wineDark,
                      borderBottomColor: stitchTokens.wineDark,
                    },
                    pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
                    (locked || yearError(edits.publicationYear)) && { opacity: 0.5 },
                  ]}
                >
                  <Icon name="check" size={16} color={stitchTokens.white} />
                  <AppText kind="bold" color={stitchTokens.white} style={{ fontSize: 13 }}>
                    {Object.keys(edits).length > 0
                      ? "Dùng tất cả thông tin đã rà soát"
                      : "Dùng tất cả thông tin đọc được"}
                  </AppText>
                </Pressable>
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
        </View>
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
    borderRadius: 18,
    borderWidth: 1.5,
    borderBottomWidth: 3.5,
    borderColor: stitchTokens.wineLight,
    borderBottomColor: stitchTokens.wineDeep,
    backgroundColor: stitchTokens.wineDark,
    shadowColor: stitchTokens.shadowDeepCrimson,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    overflow: "hidden",
  },
  headerPressable: {
    padding: 14,
    gap: 6,
  },
  expandedContent: {
    gap: 12,
    padding: 14,
    backgroundColor: stitchTokens.roseWarmTag,
    borderTopWidth: 1.5,
    borderTopColor: stitchTokens.peachBorder,
  },
  barcodeBox: {
    backgroundColor: stitchTokens.whiteSurface,
    padding: space.md,
    borderRadius: 14,
    borderWidth: 1.5,
    borderBottomWidth: 3,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  resultCard: {
    backgroundColor: stitchTokens.whiteSurface,
    borderRadius: 16,
    padding: space.md,
    borderWidth: 1.5,
    borderBottomWidth: 3.5,
    borderColor: stitchTokens.peachBorder,
    gap: space.md,
    shadowColor: stitchTokens.shadowDeepCrimson,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  missingContainer: {
    backgroundColor: stitchTokens.whiteSurface,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.goldBorder,
    gap: space.sm,
  },
});
