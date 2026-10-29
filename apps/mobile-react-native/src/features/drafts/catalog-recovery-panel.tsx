import { useEffect, useEffectEvent, useRef, useState } from "react";
import { View } from "react-native";
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
} from "../../core/ui";

export function CatalogRecoveryPanel({
  listingId,
  suggestion,
  initialHints,
  compact = false,
  disabled,
  onSelectBook,
}: {
  listingId: string;
  suggestion: AutofillSuggestion | null;
  initialHints?: AutofillSuggestion["fields"];
  compact?: boolean;
  disabled: boolean;
  onSelectBook: (id: string) => void;
}) {
  const { client } = useSession();
  const [showSearch, setShowSearch] = useState(!compact);
  const [fields, setFields] = useState(() =>
    initialCatalogFields(initialHints ?? suggestion?.fields),
  );
  const [answer, setAnswer] = useState({
    items: [] as CatalogMatch[],
    truncated: false,
    signature: JSON.stringify(fields),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<CatalogMatch | null>(null),
    [searched, setSearched] = useState(false);
  const signature = JSON.stringify(fields),
    current = useRef(signature),
    active = useRef(true),
    sequence = useRef(0),
    busyRef = useRef(false);
  current.current = signature;
  // The parent keys by suggestion ID; revalidate cached matches through the current catalog.
  const searchInitial = useEffectEvent(() => {
    if (
      (suggestion || initialHints) &&
      (fields.title.trim() || fields.isbn.trim())
    )
      void search();
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
  async function search() {
    if (disabled || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const at = signature,
      run = ++sequence.current;
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
      if (active.current && sequence.current === run)
        setError(
          "Chưa tìm được danh mục. Kiểm tra tên/ISBN rồi thử lại; nội dung đã nhập vẫn được giữ.",
        );
    } finally {
      if (active.current && sequence.current === run) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  const chooseLocked = disabled || busy || stale || !!error;
  return (
    <View
      style={{
        gap: space.sm,
        paddingVertical: space.md,
        borderTopWidth: 1,
        borderColor: colors.rule,
      }}
    >
      <AppText kind="bold">Chọn đúng đầu sách</AppText>
      <AppText kind="small">
        {compact
          ? "Đối chiếu tác giả, tập và ấn bản trước khi chọn."
          : "Sửa chữ bị đọc sai rồi tìm trong danh mục. Tìm lại không gọi AI và không thay thông tin bài đăng."}
      </AppText>
      {compact ? (
        <Button
          secondary
          title={showSearch ? "Thu gọn thông tin tìm" : "Sửa thông tin tìm"}
          onPress={() => setShowSearch(!showSearch)}
        />
      ) : null}
      {showSearch ? (
        <View style={{ gap: space.sm }}>
          {(
            [
              ["title", "Tên sách để tìm", 300],
              ["authors", "Tác giả để tìm", 2010],
              ["isbn", "ISBN để tìm", 30],
              ["edition", "Tập hoặc ấn bản để tìm", 200],
            ] as const
          ).map(([key, label, maxLength]) => (
            <TextField
              key={key}
              label={label}
              value={fields[key]}
              maxLength={maxLength}
              editable={!disabled && !busy}
              onChangeText={(value) => {
                setFields((f) => ({ ...f, [key]: value }));
                setSelected(null);
              }}
            />
          ))}
          <AppText kind="small">
            Nhiều tác giả: ngăn cách bằng dấu chấm phẩy (;). Không có ISBN thì
            để trống.
          </AppText>
          <Button
            secondary
            title="Tìm lại trong danh mục"
            busy={busy}
            disabled={disabled || (!fields.title.trim() && !fields.isbn.trim())}
            onPress={() => void search()}
          />
        </View>
      ) : null}
      {busy || stale ? (
        <AppText accessibilityLiveRegion="polite">
          {busy
            ? "Đang đối chiếu danh mục…"
            : "Thông tin tìm đã đổi. Tìm lại trước khi chọn kết quả."}
        </AppText>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {searched && !busy && !stale && !answer.items.length ? (
        <AppText accessibilityLiveRegion="polite">
          Chưa tìm thấy đầu sách phù hợp trong phạm vi đã tìm. Thử sửa tên, bổ
          sung tác giả hoặc ISBN; bạn vẫn có thể nhập tay.
        </AppText>
      ) : null}
      {answer.truncated ? (
        <AppText kind="small">
          Chỉ hiển thị các gợi ý trong phạm vi đã tìm. Thêm tác giả, tập hoặc
          ISBN để tìm cụ thể hơn.
        </AppText>
      ) : null}
      {answer.items.map((match) => (
        <View
          key={match.book.id}
          style={{
            gap: space.xs,
            paddingVertical: space.sm,
            borderTopWidth: 1,
            borderColor: colors.rule,
          }}
        >
          <AppText kind="bold">{match.book.title}</AppText>
          <AppText kind="small">{catalogBookFacts(match.book)}</AppText>
          <AppText kind="small">
            {matchReason[match.matchedBy]}
            {match.pending ? " · Yêu cầu của bạn đang chờ duyệt" : ""}
          </AppText>
          {match.warnings.map((w) => (
            <AppText kind="small" key={w}>
              {matchWarning[w]}
            </AppText>
          ))}
          <Button
            secondary
            title={`Chọn đầu sách: ${match.book.title}`}
            disabled={chooseLocked}
            onPress={() => setSelected(match)}
          />
        </View>
      ))}
      <ConfirmDialog
        visible={!!selected}
        title="Đúng tập và ấn bản của bạn?"
        message={
          selected
            ? `${selected.book.title}. ${catalogBookFacts(selected.book)}. Chọn đầu sách này sẽ dùng thông tin danh mục cho bài đăng; thông tin đang nhập có thể được thay thế.`
            : ""
        }
        confirmLabel="Xác nhận chọn đầu sách"
        onCancel={() => setSelected(null)}
        onConfirm={() => {
          if (selected && !chooseLocked) onSelectBook(selected.book.id);
          setSelected(null);
        }}
      />
    </View>
  );
}
