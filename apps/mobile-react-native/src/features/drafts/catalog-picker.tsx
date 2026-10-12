import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
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
  Notice,
  Sheet,
  StatePanel,
  TextField,
  colors,
  space,
  presentError,
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
const requests = z.object({
  items: z.array(ownBook),
  nextCursor: z.string().nullable(),
});
type OwnBook = z.infer<typeof ownBook>;
export function BookIdentity({ id }: { id: string | null }) {
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
  if (!id) return <AppText kind="heading">Chưa chọn đầu sách</AppText>;
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
  return (
    <View style={{ gap: space.sm }}>
      <AppText kind="heading" accessibilityRole="header">
        {read.data.title}
      </AppText>
      <AppText kind="small">{read.data.authors.join(" · ")}</AppText>
      <AppText kind="small">
        {[
          read.data.publisher,
          read.data.publicationYear,
          read.data.edition,
          read.data.isbn ? `ISBN ${read.data.isbn}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || read.data.category}
      </AppText>
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
  const [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<OwnBook | null>(null),
    [form, setForm] = useState(blank),
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
    enabled: !disabled,
  });
  const mine = useInfiniteQuery({
    queryKey: ["catalog-mine"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.request(
        `/me/catalog-requests?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        requests,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: !disabled,
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
      setOpen(false);
      setForm(blank);
      setEdit(null);
      onDirtyChange(false);
      await cache.invalidateQueries({ queryKey: ["catalog-mine"] });
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
    <View style={{ gap: space.lg }}>
      <BookIdentity id={selected} />
      {!disabled ? (
        <>
          <AppText>
            Chọn đúng đầu sách và ấn bản. Tình trạng cuốn sách của bạn sẽ được
            mô tả ở bước sau.
          </AppText>
          <TextField
            label="Tìm tên sách, tác giả hoặc ISBN"
            value={search}
            onChangeText={setSearch}
            maxLength={200}
          />
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
          {found.data?.pages[0].items.length === 0 ? (
            <AppText kind="small">
              Chưa tìm thấy đầu sách phù hợp. Bạn có thể gửi thông tin ở bên
              dưới.
            </AppText>
          ) : null}
          {found.data?.pages
            .flatMap((p) => p.items)
            .map((b) => (
              <View
                key={b.id}
                style={{
                  gap: space.sm,
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderColor: colors.rule,
                }}
              >
                <AppText kind="heading">{b.title}</AppText>
                <AppText kind="small">{b.authors.join(" · ")}</AppText>
                <AppText kind="small">
                  {[b.publisher, b.publicationYear, b.edition, b.isbn]
                    .filter(Boolean)
                    .join(" · ") || b.category}
                </AppText>
                <Button
                  secondary
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
          <AppText kind="heading">Đầu sách bạn đã đề nghị</AppText>
          {mine.isPending ? (
            <StatePanel loading title="Đang tải đề nghị của bạn" />
          ) : null}
          {mine.error ? (
            <StatePanel
              title="Chưa tải được các đề nghị"
              action={{ label: "Thử lại", onPress: () => void mine.refetch() }}
            />
          ) : null}
          {mine.data?.pages[0].items.length === 0 ? (
            <AppText kind="small">Bạn chưa đề nghị đầu sách mới.</AppText>
          ) : null}
          {mine.data?.pages
            .flatMap((p) => p.items)
            .map((b) => (
              <View
                key={b.id}
                style={{
                  gap: space.sm,
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderColor: colors.rule,
                }}
              >
                <AppText kind="bold">
                  {b.currentRevision.metadata.title}
                </AppText>
                <AppText kind="small">
                  {b.status === "Pending"
                    ? "Chờ xác nhận thông tin đầu sách"
                    : b.status === "Rejected"
                      ? "Thông tin cần chỉnh sửa"
                      : "Đã có trong danh mục"}
                </AppText>
                {b.status === "Rejected" ? (
                  <>
                    <Notice tone="warning">
                      {b.decisions[0]?.reason ||
                        "Hãy kiểm tra lại thông tin ấn bản."}
                    </Notice>
                    <Button
                      secondary
                      title="Sửa thông tin đầu sách"
                      onPress={() => {
                        const m = b.currentRevision.metadata;
                        if (attempt.current) {
                          setOpen(true);
                          return;
                        }
                        setEdit(b);
                        onDirtyChange(true);
                        setForm({
                          ...m,
                          authors: m.authors.join("; "),
                          publisher: m.publisher ?? "",
                          publicationYear: m.publicationYear?.toString() ?? "",
                          edition: m.edition ?? "",
                          isbn: m.isbn ?? "",
                        });
                        setError("");
                        setOpen(true);
                      }}
                    />
                  </>
                ) : (
                  <Button
                    secondary
                    title={selected === b.id ? "Đã chọn" : "Dùng đầu sách này"}
                    disabled={selected === b.id}
                    onPress={() => onSelect(b.id)}
                  />
                )}
              </View>
            ))}
          {mine.hasNextPage ? (
            <Button
              secondary
              title="Xem thêm đề nghị"
              busy={mine.isFetchingNextPage}
              onPress={() => void mine.fetchNextPage()}
            />
          ) : null}
          <Button
            secondary
            title="Chưa có sách? Gửi thông tin đầu sách"
            onPress={() => {
              if (!attempt.current) setEdit(null);
              setError("");
              setOpen(true);
            }}
          />
        </>
      ) : null}
      <Sheet
        visible={open}
        title={edit ? "Sửa thông tin đầu sách" : "Đề nghị đầu sách mới"}
        onClose={() => setOpen(false)}
        dismissible={!busy}
      >
        <View style={{ gap: space.lg }}>
          <AppText>
            Chép thông tin trên trang tên sách và trang bản quyền. Đề nghị sẽ
            được kiểm tra trước khi bài đăng có thể được duyệt.
          </AppText>
          {Object.entries({
            title: "Tên sách",
            authors: "Tác giả (ngăn cách bằng dấu ;)",
            publisher: "Nhà xuất bản (nếu có)",
            publicationYear: "Năm xuất bản (nếu có)",
            language: "Mã ngôn ngữ, ví dụ vi hoặc en",
            edition: "Ấn bản (nếu có)",
            category: "Thể loại",
            isbn: "ISBN (nếu có)",
          }).map(([k, label]) => (
            <TextField
              key={k}
              label={label}
              value={form[k as keyof typeof blank]}
              editable={
                !busy &&
                !retryPending &&
                !(k === "category" && edit?.currentRevision.metadata.categoryId)
              }
              maxLength={
                k === "title"
                  ? 300
                  : k === "authors"
                    ? 2010
                    : k === "category"
                      ? 80
                      : k === "publicationYear"
                        ? 4
                        : k === "language"
                          ? 35
                          : 200
              }
              keyboardType={k === "publicationYear" ? "number-pad" : "default"}
              onChangeText={(v) => {
                onDirtyChange(true);
                setForm((f) => ({ ...f, [k]: v }));
              }}
            />
          ))}
          {error ? (
            <Notice tone="error">
              {error}
              {retryPending ? " Thử lại để kiểm tra đúng đề nghị vừa gửi." : ""}
            </Notice>
          ) : null}
          <Button
            title={
              retryPending
                ? "Thử lại đề nghị vừa gửi"
                : "Gửi thông tin đầu sách"
            }
            busy={busy}
            onPress={() => void send()}
          />
        </View>
      </Sheet>
    </View>
  );
}
