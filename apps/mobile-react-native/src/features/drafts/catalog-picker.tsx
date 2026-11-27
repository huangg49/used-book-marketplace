import { PhotoAutofillPanel } from "./photo-autofill-panel";
import type { Media } from "./contracts";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
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
  Button,
  Icon,
  Notice,
  SearchField,
  StatePanel,
  TextField,
  colors,
  space,
  presentError,
  stitchTokens,
} from "../../core/ui";
import { receipt } from "./contracts";
import {
  categories,
  categoryFor,
  facetsFor,
  compatibleAttributes,
  supportsSeries,
  languageOptions,
  classificationErrors,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
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

export function catalogBookQueryOptions(
  client: ReturnType<typeof useSession>["client"],
  id: string | null,
) {
  return {
    queryKey: ["listing-book", id] as const,
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
    staleTime: 60_000,
  };
}

export function useCatalogBook(id: string | null) {
  const { client } = useSession();
  return useQuery(catalogBookQueryOptions(client, id));
}

export function BookIdentity({
  id,
  onEdit,
  compact,
}: {
  id: string | null;
  onEdit?: () => void;
  compact?: boolean;
}) {
  const read = useCatalogBook(id);
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
          <AppText
            kind="small"
            color={stitchTokens.roseBrown}
            style={{ fontSize: 10 }}
          >
            Chưa chọn thư mục sách
          </AppText>
        </View>
      );
    }
    return null;
  }
  if (read.isPending) return <AppText kind="small">Đang tải tên sách…</AppText>;
  if (!read.data)
    return (
      <View style={{ gap: space.sm }}>
        <Notice tone="warning">Chưa tải được thông tin đầu sách.</Notice>
        <Button
          wine
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
          width: 48,
          height: 64,
          borderRadius: 8,
          backgroundColor: stitchTokens.parchment,
          borderWidth: 1,
          borderColor: stitchTokens.peachBorder,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="book" size={22} color={stitchTokens.wine} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
              ĐÃ KHỚP THƯ MỤC
            </AppText>
          </View>
          <AppText
            kind="small"
            color={stitchTokens.subtleGray}
            style={{ fontSize: 10 }}
          >
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đổi đầu sách khác"
          onPress={onEdit}
          style={({ pressed }) => ({
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: stitchTokens.roseParchment,
            borderWidth: 1,
            borderColor: stitchTokens.peachBorder,
            opacity: pressed ? 0.72 : 1,
            flexShrink: 0,
          })}
        >
          <AppText kind="bold" style={{ fontSize: 11.5, color: stitchTokens.wine }}>
            Đổi sách
          </AppText>
        </Pressable>
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
  assistPhotos,
}: {
  assistPhotos?: { listingId: string; photos: Media[]; add: () => void };
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { client } = useSession(),
    cache = useQueryClient();
  const [entryMode, setEntryMode] = useState<"catalog" | "manual">("catalog");
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [edit, setEdit] = useState<OwnBook | null>(null),
    [form, setForm] = useState(blank),
    [classification, setClassification] = useState<{
      categoryId: string;
      attributes: Attributes;
      series: string;
    }>({
      categoryId: "",
      attributes: {},
      series: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ key: string; body: string; path: string } | null>(
    null,
  );
  const busyRef = useRef(false);
  const [retryPending, setRetryPending] = useState(false);
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
        (!classification.categoryId && !form.category.trim()) ||
        !form.language.trim()
      ) {
        setError(
          "Điền tên sách, tác giả, chọn danh mục và ngôn ngữ trước khi gửi.",
        );
        return;
      }
      if (classification.categoryId) {
        const classErrors = classificationErrors(
          classification.categoryId,
          classification.attributes,
        );
        if (classErrors.length > 0) {
          setError("Chọn đầy đủ các thuộc tính bắt buộc của danh mục.");
          return;
        }
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
      const selectedCat = categoryFor(classification.categoryId);
      const data: components["schemas"]["CatalogMetadata"] = {
        title: form.title.trim(),
        authors: form.authors
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean),
        publisher: form.publisher.trim() || null,
        publicationYear: year,
        language: form.language.trim() || "vi",
        edition: form.edition.trim() || null,
        category: (selectedCat?.label ?? form.category.trim()) || "Khác",
        ...(classification.categoryId
          ? {
              categoryId:
                classification.categoryId as components["schemas"]["CatalogMetadata"]["categoryId"],
              attributes: classification.attributes,
              series: classification.series?.trim() || null,
            }
          : classificationForResubmit(edit?.currentRevision.metadata)),
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
      {!selected && assistPhotos ? (
        <PhotoAutofillPanel
          listingId={assistPhotos.listingId}
          photos={assistPhotos.photos}
          disabled={disabled || busy || retryPending}
          onAddPhoto={assistPhotos.add}
          currentValue={(field) => form[field]}
          onSelectBook={(id) => {
            onSelect(id);
            onDirtyChange(false);
          }}
          onUseField={(field, values) => {
            const value = values[field];
            if (value == null) return;
            setEntryMode("manual");
            onDirtyChange(true);
            setForm((prev) => ({
              ...prev,
              [field]: Array.isArray(value) ? value.join("; ") : String(value),
            }));
          }}
        />
      ) : null}
      {!disabled ? (
        <>
          {/* Sub-tabs: [ 📖 Tìm sách có sẵn ]   [ ✏️ Tự nhập thông tin ] */}
          <View style={styles.entryChoiceRow}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: entryMode === "catalog" }}
              onPress={() => setEntryMode("catalog")}
              style={({ pressed }) => [
                styles.entryChoiceTab,
                entryMode === "catalog" && styles.entryChoiceTabActive,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Icon
                name="book"
                size={16}
                color={
                  entryMode === "catalog"
                    ? stitchTokens.wine
                    : stitchTokens.warmUmber
                }
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
              accessibilityRole="tab"
              accessibilityState={{ selected: entryMode === "manual" }}
              onPress={() => setEntryMode("manual")}
              style={({ pressed }) => [
                styles.entryChoiceTab,
                entryMode === "manual" && styles.entryChoiceTabActive,
                pressed && { opacity: 0.78 },
              ]}
            >
              <Icon
                name="pen"
                size={16}
                color={
                  entryMode === "manual"
                    ? stitchTokens.wine
                    : stitchTokens.warmUmber
                }
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
              <AppText
                kind="bold"
                style={{ fontSize: 15, color: stitchTokens.darkWood }}
              >
                Tìm cuốn sách trong thư viện
              </AppText>

              {/* Clean native search field */}
              <SearchField
                label="Tìm cuốn sách trong thư viện"
                placeholder="Nhập tên, tác giả hoặc ISBN..."
                value={search}
                onChangeText={setSearch}
              />

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
                      <AppText
                        kind="small"
                        color={stitchTokens.espresso}
                        style={{ fontSize: 13 }}
                      >
                        Chưa tìm thấy. Bạn có thể chọn Tự nhập thông tin.
                      </AppText>
                      <AppText
                        kind="small"
                        color={stitchTokens.slateWarm}
                        style={{ fontSize: 12 }}
                      >
                        Chọn đúng đầu sách để điền sẵn tên, tác giả và phân
                        loại.
                      </AppText>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setEntryMode("manual")}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 4,
                          opacity: pressed ? 0.72 : 1,
                        })}
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
                <AppText
                  kind="small"
                  color={stitchTokens.subtleGray}
                  style={{ fontSize: 12, lineHeight: 18 }}
                >
                  Gõ ít nhất 2 ký tự để tìm đầu sách có sẵn, hoặc chuyển sang
                  mục Tự nhập thông tin.
                </AppText>
              )}
            </View>
          ) : (
            /* Mode 2: Tự nhập thông tin */
            <View style={{ gap: space.md }}>
              <AppText
                kind="bold"
                style={{ fontSize: 15, color: stitchTokens.darkWood }}
              >
                Tự nhập thông tin sách
              </AppText>
              <AppText color={stitchTokens.warmUmber} style={{ fontSize: 13 }}>
                Ghi tên sách và tác giả đúng như trên bìa. Thông tin sẽ được
                dùng để gán cho ấn bản của bạn.
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

              {/* Category Picker */}
              <View style={{ gap: space.xs }}>
                <AppText
                  kind="bold"
                  color={stitchTokens.wineDark}
                  style={{ fontSize: 13 }}
                >
                  Danh mục sách *
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  {categories.map((cat) => {
                    const isSelected = classification.categoryId === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          onDirtyChange(true);
                          const newAttrs = compatibleAttributes(
                            cat.id,
                            classification.attributes,
                            "metadata",
                          );
                          setClassification((c) => ({
                            ...c,
                            categoryId: cat.id,
                            attributes: newAttrs,
                            series: supportsSeries(cat.id) ? c.series : "",
                          }));
                          setForm((f) => ({ ...f, category: cat.label }));
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.parchment,
                          borderWidth: 1,
                          borderColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.peachBorder,
                        }}
                      >
                        <AppText
                          kind="bold"
                          color={
                            isSelected
                              ? stitchTokens.white
                              : stitchTokens.darkWood
                          }
                          style={{ fontSize: 12 }}
                        >
                          {cat.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Series field if supported */}
              {supportsSeries(classification.categoryId) ? (
                <TextField
                  label="Bộ truyện / Series (nếu có)"
                  value={classification.series}
                  placeholder="Ví dụ: Harry Potter, Conan..."
                  onChangeText={(v) => {
                    onDirtyChange(true);
                    setClassification((c) => ({ ...c, series: v }));
                  }}
                  maxLength={120}
                />
              ) : null}

              {/* Dynamic Facets / Attributes for selected category */}
              {classification.categoryId ? (
                <View style={{ gap: space.sm }}>
                  {facetsFor(
                    classification.categoryId,
                    classification.attributes,
                    "metadata",
                  ).map((facet) => {
                    const selectedValues =
                      classification.attributes[facet.id] ?? [];
                    return (
                      <View key={facet.id} style={{ gap: space.xs }}>
                        <AppText
                          kind="bold"
                          color={stitchTokens.wineDark}
                          style={{ fontSize: 12 }}
                        >
                          {facet.label}
                        </AppText>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          {facet.options.map((opt) => {
                            const isChosen = selectedValues.includes(opt.id);
                            return (
                              <Pressable
                                key={opt.id}
                                onPress={() => {
                                  onDirtyChange(true);
                                  const nextAttrs = {
                                    ...classification.attributes,
                                    [facet.id]: isChosen
                                      ? selectedValues.filter(
                                          (v) => v !== opt.id,
                                        )
                                      : [...selectedValues, opt.id],
                                  };
                                  const sanitized = compatibleAttributes(
                                    classification.categoryId,
                                    nextAttrs,
                                    "metadata",
                                  );
                                  setClassification((c) => ({
                                    ...c,
                                    attributes: sanitized,
                                  }));
                                }}
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 14,
                                  backgroundColor: isChosen
                                    ? stitchTokens.roseWarmSurface
                                    : stitchTokens.warmIvory,
                                  borderWidth: 1,
                                  borderColor: isChosen
                                    ? stitchTokens.wine
                                    : stitchTokens.borderWarm,
                                }}
                              >
                                <AppText
                                  kind="small"
                                  color={
                                    isChosen
                                      ? stitchTokens.wine
                                      : stitchTokens.subtleGray
                                  }
                                  style={{
                                    fontSize: 11,
                                    fontWeight: isChosen ? "700" : "500",
                                  }}
                                >
                                  {opt.label}
                                </AppText>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Language Picker */}
              <View style={{ gap: space.xs }}>
                <AppText
                  kind="bold"
                  color={stitchTokens.wineDark}
                  style={{ fontSize: 13 }}
                >
                  Ngôn ngữ sách *
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  {languageOptions.map((lang) => {
                    const isSelected = form.language === lang.id;
                    return (
                      <Pressable
                        key={lang.id}
                        onPress={() => {
                          onDirtyChange(true);
                          setForm((f) => ({ ...f, language: lang.id }));
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.parchment,
                          borderWidth: 1,
                          borderColor: isSelected
                            ? stitchTokens.wine
                            : stitchTokens.peachBorder,
                        }}
                      >
                        <AppText
                          kind="small"
                          color={
                            isSelected
                              ? stitchTokens.white
                              : stitchTokens.darkWood
                          }
                          style={{
                            fontSize: 11,
                            fontWeight: isSelected ? "700" : "500",
                          }}
                        >
                          {lang.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

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
    backgroundColor: stitchTokens.parchment,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    padding: 4,
    gap: 4,
  },
  entryChoiceTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  entryChoiceTabActive: {
    backgroundColor: stitchTokens.whiteSurface,
    borderWidth: 1,
    borderColor: stitchTokens.cardBorder,
  },
  entryChoiceText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: stitchTokens.warmUmber,
    includeFontPadding: false,
  },
  entryChoiceTextActive: {
    color: stitchTokens.wineDark,
    fontWeight: "800",
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
