import { useEffect, useEffectEvent, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  catalogBookFacts,
  catalogHints,
  findCatalogMatches,
  initialCatalogFields,
  matchReason,
  matchWarning,
  type CatalogMatch,
  type AutofillSuggestion,
} from "@used-books/session-client";
import { useSession } from "../../core/session/session-provider";
import {
  AppText,
  Button,
  TextField,
  Notice,
  ConfirmDialog,
  space,
  colors,
  stitchTokens,
} from "../../core/ui";

export function CatalogRecoveryPanel({
  listingId,
  suggestion,
  initialHints,
  reviewed,
  compact = false,
  disabled,
  onSelectBook,
}: {
  listingId: string;
  suggestion?: AutofillSuggestion | null;
  initialHints?: AutofillSuggestion["fields"];
  reviewed?: AutofillSuggestion["fields"] | null;
  compact?: boolean;
  disabled: boolean;
  onSelectBook: (id: string) => void;
}) {
  const { client } = useSession();
  const [showSearch, setShowSearch] = useState(!compact);
  const [manualFields, setManualFields] = useState(() =>
    initialCatalogFields(initialHints ?? suggestion?.fields),
  );
  const fields = reviewed ? initialCatalogFields(reviewed) : manualFields;

  const [answer, setAnswer] = useState({
    items: [] as CatalogMatch[],
    truncated: false,
    signature: JSON.stringify(fields),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CatalogMatch | null>(null);
  const [searched, setSearched] = useState(false);

  const signature = JSON.stringify(fields);
  const current = useRef(signature);
  const active = useRef(true);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  current.current = signature;

  const searchInitial = useEffectEvent(() => {
    if (
      (reviewed || suggestion || initialHints) &&
      (fields.title.trim() || fields.isbn.trim())
    ) {
      void search();
    }
  });

  useEffect(() => {
    active.current = true;
    busyRef.current = false;
    searchInitial();
    return () => {
      active.current = false;
    };
  }, []);

  const stale = signature !== answer.signature;

  function edit(key: keyof typeof manualFields, value: string) {
    setManualFields((prev) => ({ ...prev, [key]: value }));
    setSelected(null);
  }

  async function search() {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const at = signature;
    const run = ++sequence.current;
    try {
      const result = await findCatalogMatches(
        client,
        listingId,
        catalogHints(fields),
      );
      if (
        active.current &&
        sequence.current === run &&
        current.current === at
      ) {
        setAnswer({ ...result, signature: at });
        setSearched(true);
      }
    } catch {
      if (active.current && sequence.current === run && current.current === at) {
        setError(
          "Chưa tìm được danh mục. Kiểm tra tên/ISBN rồi thử lại; nội dung đã nhập vẫn được giữ.",
        );
      }
    } finally {
      if (active.current && sequence.current === run) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const currentAnswer = !stale && !error;
  const hasSearch = !!(fields.title.trim() || fields.isbn.trim());

  let statusText = "";
  if (busy) {
    statusText = "Đang đối chiếu danh mục…";
  } else if (stale) {
    statusText = hasSearch
      ? "Thông tin tìm đã đổi. Bấm tìm lại để cập nhật kết quả."
      : "Nhập tên hoặc ISBN để tìm.";
  } else if (searched && !error) {
    statusText = answer.items.length
      ? `Tìm thấy ${answer.items.length} đầu sách để đối chiếu.`
      : "Chưa tìm thấy đầu sách phù hợp. Bạn vẫn có thể dùng thông tin từ ảnh hoặc tự nhập.";
  }

  return (
    <View style={styles.card}>
      <View style={{ gap: 4 }}>
        <AppText kind="bold" color={stitchTokens.wineDark} style={{ fontSize: 16 }}>
          Đối chiếu với danh mục
        </AppText>
        <AppText kind="small" color={stitchTokens.subtleGray}>
          Chọn đúng đầu sách trong danh mục giúp sách của bạn dễ tìm hơn và có giá gợi ý chuẩn xác.
        </AppText>
      </View>

      {statusText ? (
        <AppText kind="small" color={stale ? stitchTokens.wine : stitchTokens.deepCocoa}>
          {statusText}
        </AppText>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Button
          secondary
          title={showSearch ? "Thu gọn bộ tìm danh mục" : "Chỉnh sửa thông tin đối chiếu"}
          onPress={() => setShowSearch((v) => !v)}
        />
        {showSearch && (
          <View style={styles.searchBox}>
            <TextField
              label="Tên sách"
              value={fields.title}
              editable={!disabled && !busy}
              onChangeText={(text) => edit("title", text)}
            />
            <TextField
              label="Tác giả"
              value={fields.authors}
              editable={!disabled && !busy}
              onChangeText={(text) => edit("authors", text)}
            />
            <TextField
              label="Mã ISBN"
              value={fields.isbn}
              editable={!disabled && !busy}
              onChangeText={(text) => edit("isbn", text)}
            />
            <TextField
              label="Lần xuất bản / Tập"
              value={fields.edition}
              editable={!disabled && !busy}
              onChangeText={(text) => edit("edition", text)}
            />
            <Button
              wine
              title={busy ? "Đang tìm đầu sách…" : "Tìm lại trong danh mục"}
              disabled={disabled || busy || !hasSearch}
              busy={busy}
              onPress={() => void search()}
            />
          </View>
        )}
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {currentAnswer && answer.items.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <AppText kind="label">Các đầu sách tìm thấy ({answer.items.length})</AppText>
          {answer.items.map((match) => {
            const warning = match.warnings.map((w) => matchWarning[w]).filter(Boolean).join(" · ");
            const reason = matchReason[match.matchedBy];
            const facts = catalogBookFacts(match.book);
            return (
              <View key={match.book.id} style={styles.matchItem}>
                <View style={{ gap: 2, flex: 1 }}>
                  <AppText kind="bold" color={stitchTokens.wineDark}>
                    {match.book.title}
                  </AppText>
                  <AppText kind="small" color={stitchTokens.subtleGray}>
                    {match.book.authors.join(", ")}
                  </AppText>
                  {facts ? (
                    <AppText kind="small" color={stitchTokens.deepCocoa}>
                      {facts}
                    </AppText>
                  ) : null}
                  {reason ? (
                    <AppText kind="small" color={stitchTokens.likeNewGreen}>
                      ✓ {reason}
                    </AppText>
                  ) : null}
                  {warning ? (
                    <AppText kind="small" color={colors.warning}>
                      ! {warning}
                    </AppText>
                  ) : null}
                </View>
                <Button
                  secondary
                  title="Chọn sách này"
                  disabled={disabled || busy}
                  onPress={() => setSelected(match)}
                />
              </View>
            );
          })}
        </View>
      ) : null}

      <ConfirmDialog
        visible={!!selected}
        title="Chọn đầu sách này?"
        message={
          selected
            ? `Áp dụng thông tin từ "${selected.book.title}" cho bài đăng của bạn?`
            : ""
        }
        confirmLabel="Xác nhận chọn"
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          if (selected) onSelectBook(selected.book.id);
          setSelected(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    padding: space.md,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
  searchBox: {
    backgroundColor: stitchTokens.white,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.xs,
  },
  matchItem: {
    backgroundColor: stitchTokens.white,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
    gap: space.sm,
  },
});
