import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { useSession } from "../../core/session/session-provider";
import { ApiError } from "../../core/api/session-client";
import {
  AppText,
  AppTextInput,
  Button,
  Icon,
  Notice,
  StatePanel,
  TextField,
  colors,
  space,
  presentError,
  stitchTokens,
} from "../../core/ui";
import { receipt } from "./contracts";
import {
  catalogClassificationFields,
  classificationForResubmit,
} from "./catalog-classification";

const metadata = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  publisher: z.string().nullable(),
  publicationYear: z.number().nullable(),
  language: z.string(),
  edition: z.string().nullable(),
  category: z.string(),
  ...catalogClassificationFields,
  isbn: z.string().nullable(),
});
const book = metadata.extend({ id: z.string().uuid() });
const ownBook = z.object({
  id: z.string().uuid(),
  version: z.number(),
  status: z.enum(["Pending", "Confirmed", "Rejected"]),
  currentRevision: z.object({ metadata }),
  decisions: z.array(z.object({ reason: z.string().nullable() })),
});
const books = z.object({
  items: z.array(book),
  nextCursor: z.string().nullable(),
});
type OwnBook = z.infer<typeof ownBook>;
export function BookIdentity({
  id,
  onEdit,
  compact,
}: {
  id: string | null;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const { client } = useSession();
  const read = useQuery({
    queryKey: ["listing-book", id],
    enabled: !!id,
    queryFn: async () => {
      try {
        return await client.request(`/catalog/books/${id}`, book);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
        const own = await client.request(`/me/catalog-requests/${id}`, ownBook);
        return { id: own.id, ...own.currentRevision.metadata };
      }
    },
  });
  if (!id) {
    if (compact) {
      return (
        <View style={{ gap: 2 }}>
          <AppText
            kind="bold"
            color={stitchTokens.wineDark}
            style={{ fontSize: 13, lineHeight: 17 }}
            numberOfLines={2}
          >
            Chưa chọn đầu sách
          </AppText>
          <AppText kind="small" color={stitchTokens.roseBrown} style={{ fontSize: 10 }}>
            Chưa gán catalog
          </AppText>
        </View>
      );
    }
    return (
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: space.xs,
          borderBottomWidth: 1,
          borderColor: stitchTokens.peachBorder,
        }}
      >
        <AppText
          kind="heading"
          color={stitchTokens.wineDark}
          style={{ textAlign: "center" }}
        >
          Chưa chọn đầu sách
        </AppText>
      </View>
    );
  }
  if (read.isPending) return <AppText kind="small">Đang tải tên sách…</AppText>;
  if (!read.data)
    return (
      <View style={{ gap: space.sm }}>
        <Notice tone="warning">Chưa tải được thông tin đầu sách.</Notice>
        <Button
          secondary
          title="Thử tải lại tên sách"
          busy={read.isFetching}
          onPress={() => void read.refetch()}
        />
      </View>
    );

  if (compact) {
    return (
      <View style={{ gap: 2 }}>
        <AppText
          kind="bold"
          color={stitchTokens.wineDark}
          style={{ fontSize: 13, lineHeight: 17 }}
          numberOfLines={2}
        >
          {read.data.title}
        </AppText>
        <AppText
          kind="small"
          color={stitchTokens.subtleGray}
          style={{ fontSize: 11 }}
          numberOfLines={1}
        >
          {read.data.authors.join(" · ")}
        </AppText>
      </View>
    );
  }

  const metaText =
    [
      read.data.publisher,
      read.data.publicationYear,
      read.data.edition,
      read.data.isbn ? `ISBN ${read.data.isbn}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || read.data.category;

  return (
    <View
      style={{
        padding: 12,
        backgroundColor: stitchTokens.warmIvory,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: stitchTokens.borderWarm,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        shadowColor: stitchTokens.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      <View
        style={{
          width: 50,
          height: 68,
          borderRadius: 6,
          backgroundColor: stitchTokens.parchment,
          borderWidth: 1,
          borderColor: stitchTokens.peachBorder,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText kind="title" color={colors.rustText} style={{ fontSize: 20 }}>
          📖
        </AppText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              backgroundColor: stitchTokens.sageGold,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            <AppText
              kind="small"
              color={colors.rustText}
              style={{ fontSize: 9, fontWeight: "700" }}
            >
              ĐÃ KHỚP CATALOG
            </AppText>
          </View>
          <AppText kind="small" color={stitchTokens.subtleGray} style={{ fontSize: 10 }}>
            {`#BK-${id.slice(0, 6).toUpperCase()}`}
          </AppText>
        </View>
        <AppText
          kind="bold"
          color={stitchTokens.wineDark}
          style={{ fontSize: 15 }}
          numberOfLines={2}
        >
          {read.data.title}
        </AppText>
        <AppText kind="small" color={stitchTokens.subtleGray} numberOfLines={1}>
          {read.data.authors.join(" · ")}
        </AppText>
        <AppText
          kind="small"
          color={stitchTokens.subtleGray}
          style={{ fontSize: 11 }}
          numberOfLines={1}
        >
          {metaText}
        </AppText>
      </View>
      {onEdit ? (
        <Button secondary title="Đổi sách" onPress={onEdit} />
      ) : null}
    </View>
  );
}
const blank = {
  title: "",
  authors: "",
  publisher: "",
  publicationYear: "",
  language: "vi",
  edition: "",
  category: "",
  isbn: "",
};
export function CatalogPicker({
  selected,
  disabled,
  onSelect,
  onDirtyChange,
}: {
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { client } = useSession(),
    cache = useQueryClient();
  const [entryMode, setEntryMode] = useState<"catalog" | "manual">("catalog");
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [isFocused, setIsFocused] = useState(false);
  const [edit, setEdit] = useState<OwnBook | null>(null),
    [form, setForm] = useState(blank),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ key: string; body: string; path: string } | null>(
    null,
  );
  const busyRef = useRef(false);
  const [, setRetryPending] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const found = useInfiniteQuery({
    queryKey: ["catalog-books", term],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        `/catalog/books?limit=10${term ? `&q=${encodeURIComponent(term)}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        books,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: !disabled && term.trim().length >= 2,
  });
  const send = async () => {
    if (busyRef.current) return;
    setError("");
    if (!attempt.current) {
      if (
        !form.title.trim() ||
        !form.authors.trim() ||
        !form.category.trim() ||
        !form.language.trim()
      ) {
        setError("Điền tên sách, tác giả, thể loại và ngôn ngữ trước khi gửi.");
        return;
      }
      const year = form.publicationYear.trim()
        ? Number(form.publicationYear)
        : null;
      if (
        year !== null &&
        (!/^\d{1,4}$/.test(form.publicationYear) || year < 1)
      ) {
        setError("Năm xuất bản cần là số nguyên từ 1 đến 9999, hoặc để trống.");
        return;
      }
      const data: components["schemas"]["CatalogMetadata"] = {
        title: form.title.trim(),
        authors: form.authors
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean),
        publisher: form.publisher.trim() || null,
        publicationYear: year,
        language: form.language.trim(),
        edition: form.edition.trim() || null,
        category: form.category.trim(),
        ...classificationForResubmit(edit?.currentRevision.metadata),
        isbn: form.isbn.trim() || null,
      };
      if (
        data.authors.length > 10 ||
        data.authors.some((a) => [...a].length > 200)
      ) {
        setError("Nhập tối đa 10 tác giả; mỗi tên không quá 200 ký tự.");
        return;
      }
      attempt.current = {
        key: Crypto.randomUUID(),
        body: JSON.stringify({
          metadata: data,
          ...(edit ? { expectedVersion: edit.version } : {}),
        }),
        path: edit
          ? `/catalog/requests/${edit.id}/resubmit`
          : "/catalog/requests",
      };
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await client.request(attempt.current.path, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body: attempt.current.body,
      });
      attempt.current = null;
      onSelect(result.entityId);
      setForm(blank);
      setEdit(null);
      onDirtyChange(false);
      await cache.invalidateQueries({
        queryKey: ["listing-book", result.entityId],
      });
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status))
        attempt.current = null;
      setError(
        e instanceof ApiError && e.status === 422
          ? "Kiểm tra ISBN, mã ngôn ngữ và thông tin ấn bản. Thông tin đã nhập vẫn được giữ."
          : presentError(e).message,
      );
    } finally {
      setRetryPending(!!attempt.current);
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: space.md }}>
      <BookIdentity id={selected} />
      {!disabled ? (
        <>
          {/* Sub-tabs: [ 📖 Tìm sách có sẵn ]   [ ✏️ Tự nhập thông tin ] */}
          <View style={styles.entryChoiceRow}>
            <Pressable
              onPress={() => setEntryMode("catalog")}
              style={[
                styles.entryChoiceTab,
                entryMode === "catalog" && styles.entryChoiceTabActive,
              ]}
            >
              <Icon
                name="book"
                size={16}
                color={entryMode === "catalog" ? stitchTokens.wine : stitchTokens.warmUmber}
              />
              <AppText
                style={[
                  styles.entryChoiceText,
                  entryMode === "catalog" && styles.entryChoiceTextActive,
                ]}
              >
                Tìm sách có sẵn
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => setEntryMode("manual")}
              style={[
                styles.entryChoiceTab,
                entryMode === "manual" && styles.entryChoiceTabActive,
              ]}
            >
              <Icon
                name="pen"
                size={16}
                color={entryMode === "manual" ? stitchTokens.wine : stitchTokens.warmUmber}
              />
              <AppText
                style={[
                  styles.entryChoiceText,
                  entryMode === "manual" && styles.entryChoiceTextActive,
                ]}
              >
                Tự nhập thông tin
              </AppText>
            </Pressable>
          </View>

          {entryMode === "catalog" ? (
            <View style={{ gap: space.md }}>
              <AppText kind="bold" style={{ fontSize: 15, color: stitchTokens.darkWood }}>
                Tìm cuốn sách trong thư viện
              </AppText>

              {/* Big prominent search bar */}
              <View
                style={[
                  styles.searchBar,
                  isFocused && styles.searchBarFocused,
                ]}
              >
                <View style={styles.searchIconContainer}>
                  <Icon
                    name="search"
                    size={22}
                    color={isFocused ? stitchTokens.wine : stitchTokens.warmUmber}
                  />
                </View>
                <AppTextInput
                  placeholder="Nhập tên, tác giả hoặc ISBN..."
                  placeholderTextColor={stitchTokens.softStone}
                  value={search}
                  onChangeText={setSearch}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  style={styles.searchInput}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {search.length > 0 ? (
                  <Pressable
                    onPress={() => setSearch("")}
                    hitSlop={10}
                    style={styles.searchClearBtn}
                  >
                    <Icon name="close" size={14} color={stitchTokens.warmUmber} />
                  </Pressable>
                ) : null}
              </View>

              {term.trim().length >= 2 ? (
                <>
                  {found.isPending ? (
                    <StatePanel loading title="Đang tìm trong danh mục" />
                  ) : null}

                  {found.error ? (
                    <StatePanel
                      title="Chưa tải được danh mục"
                      action={{
                        label: "Thử lại",
                        onPress: () => void found.refetch(),
                        busy: found.isFetching,
                      }}
                    />
                  ) : null}

                  {!found.isPending &&
                  !found.error &&
                  found.data?.pages[0]?.items.length === 0 ? (
                    <View style={{ gap: 4 }}>
                      <AppText kind="small" color={stitchTokens.espresso} style={{ fontSize: 13 }}>
                        Chưa tìm thấy. Bạn có thể chọn Tự nhập thông tin.
                      </AppText>
                      <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontSize: 12 }}>
                        Chọn đúng đầu sách để điền sẵn tên, tác giả và phân loại.
                      </AppText>
                      <Pressable
                        onPress={() => setEntryMode("manual")}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 4,
                        }}
                      >
                        <AppText
                          kind="small"
                          color={stitchTokens.wine}
                          style={{
                            fontWeight: "700",
                            textDecorationLine: "underline",
                          }}
                        >
                          Không thấy sách? Tự nhập theo bìa →
                        </AppText>
                      </Pressable>
                    </View>
                  ) : null}

                  {found.data?.pages
                    .flatMap((p) => p.items)
                    .map((b) => (
                      <View key={b.id} style={styles.bookResultCard}>
                        <AppText kind="heading" color={stitchTokens.wineDark}>
                          {b.title}
                        </AppText>
                        <AppText kind="small" color={stitchTokens.warmUmber}>
                          {b.authors.join(" · ")}
                        </AppText>
                        <AppText kind="small" color={stitchTokens.slateWarm}>
                          {[b.publisher, b.publicationYear, b.edition, b.isbn]
                            .filter(Boolean)
                            .join(" · ") || b.category}
                        </AppText>
                        <Button
                          wine
                          title={
                            selected === b.id
                              ? "Đã chọn đầu sách này"
                              : "Chọn đầu sách này"
                          }
                          disabled={selected === b.id}
                          onPress={() => onSelect(b.id)}
                        />
                      </View>
                    ))}

                  {found.hasNextPage ? (
                    <Button
                      secondary
                      title="Xem thêm đầu sách"
                      busy={found.isFetchingNextPage}
                      onPress={() => void found.fetchNextPage()}
                    />
                  ) : null}
                </>
              ) : (
                <View style={{ gap: 4 }}>
                  <AppText kind="small" color={stitchTokens.slateWarm} style={{ fontSize: 12 }}>
                    Chọn đúng đầu sách để điền sẵn tên, tác giả và phân loại.
                  </AppText>
                  <Pressable
                    onPress={() => setEntryMode("manual")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    <AppText
                      kind="small"
                      color={stitchTokens.wine}
                      style={{
                        fontWeight: "700",
                        textDecorationLine: "underline",
                      }}
                    >
                      Không thấy sách? Tự nhập theo bìa →
                    </AppText>
                  </Pressable>
                </View>
              )}

              <AppText
                style={{
                  textAlign: "right",
                  fontStyle: "italic",
                  color: stitchTokens.wine,
                  fontSize: 13,
                  marginTop: space.xs,
                }}
              >
                Mỗi cuốn sách, một câu chuyện.
              </AppText>
            </View>
          ) : (
            /* Mode 2: Tự nhập thông tin */
            <View style={{ gap: space.md }}>
              <AppText kind="bold" style={{ fontSize: 15, color: stitchTokens.darkWood }}>
                Tự nhập thông tin sách
              </AppText>
              <AppText color={stitchTokens.warmUmber} style={{ fontSize: 13 }}>
                Ghi tên sách và tác giả đúng như trên bìa. Thông tin sẽ được dùng để gán cho ấn bản của bạn.
              </AppText>

              {error ? <Notice tone="error">{error}</Notice> : null}

              <TextField
                label="Tên sách *"
                value={form.title}
                placeholder="Ví dụ: Truyện Kiều"
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, title: v }));
                }}
                maxLength={300}
              />

              <TextField
                label="Tác giả * (ngăn cách bằng dấu ; nếu nhiều tác giả)"
                value={form.authors}
                placeholder="Ví dụ: Nguyễn Du"
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, authors: v }));
                }}
                maxLength={500}
              />

              <TextField
                label="Thể loại / Danh mục *"
                value={form.category}
                placeholder="Ví dụ: Văn học, Kinh tế, Kỹ năng sống..."
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, category: v }));
                }}
                maxLength={80}
              />

              <TextField
                label="Ngôn ngữ"
                value={form.language}
                placeholder="vi"
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, language: v }));
                }}
                maxLength={35}
              />

              <TextField
                label="Nhà xuất bản (nếu có)"
                value={form.publisher}
                placeholder="Ví dụ: NXB Kim Đồng"
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, publisher: v }));
                }}
                maxLength={200}
              />

              <TextField
                label="Năm xuất bản (nếu có)"
                value={form.publicationYear}
                placeholder="Ví dụ: 2021"
                keyboardType="number-pad"
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, publicationYear: v }));
                }}
                maxLength={4}
              />

              <TextField
                label="ISBN (nếu có)"
                value={form.isbn}
                placeholder="Ví dụ: 9786042123456"
                onChangeText={(v) => {
                  onDirtyChange(true);
                  setForm((f) => ({ ...f, isbn: v }));
                }}
                maxLength={30}
              />

              <View style={{ gap: space.sm, marginTop: space.xs }}>
                <Button
                  wine
                  title="Xác nhận & Sử dụng đầu sách này"
                  busy={busy}
                  disabled={busy || !form.title.trim() || !form.authors.trim()}
                  onPress={async () => {
                    await send();
                  }}
                />
                <Button
                  secondary
                  title="← Quay lại tìm sách có sẵn"
                  disabled={busy}
                  onPress={() => setEntryMode("catalog")}
                />
              </View>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  entryChoiceRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: stitchTokens.sandstone,
    gap: 20,
    marginBottom: 4,
  },
  entryChoiceTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  entryChoiceTabActive: {
    borderBottomColor: stitchTokens.wine,
  },
  entryChoiceText: {
    fontSize: 14,
    fontWeight: "600",
    color: stitchTokens.warmUmber,
  },
  entryChoiceTextActive: {
    color: stitchTokens.wine,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: stitchTokens.peachBorder,
    borderRadius: 16,
    backgroundColor: stitchTokens.offWhiteWarm,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    shadowColor: stitchTokens.wine,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  searchBarFocused: {
    borderColor: stitchTokens.wine,
    backgroundColor: stitchTokens.white,
    shadowOpacity: 0.1,
    elevation: 2,
  },
  searchIconContainer: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: stitchTokens.darkWood,
    paddingVertical: 0,
    fontWeight: "500",
  },
  searchClearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: stitchTokens.linenRose,
    alignItems: "center",
    justifyContent: "center",
  },
  bookResultCard: {
    gap: space.sm,
    padding: space.md,
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.peachBorder,
  },
});
