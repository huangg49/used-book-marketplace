import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BookCard } from "../components/BookCard";
import { getPublicListings } from "../services/public-listings";
const conditionLabels = {
  LikeNew: "Gần như mới",
  Good: "Còn tốt",
  Fair: "Đã dùng nhiều",
  Worn: "Cũ nhiều",
};
export function BookSearchPage() {
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams();
  for (const key of [
    "q",
    "mode",
    "condition",
    "sort",
    "minSalePrice",
    "maxSalePrice",
    "cursor",
  ]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  query.set("limit", "12");
  const result = useQuery({
    queryKey: ["public-listings", query.toString()],
    queryFn: () => getPublicListings(query),
    retry: false,
    staleTime: 0,
  });
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return (
    <main className="w-full bg-surface text-on-surface px-5 lg:px-12 py-8">
      <header className="mb-8 border-b border-outline-variant pb-6">
        <h1 className="font-serif text-3xl text-primary">Khám phá kệ sách</h1>
        <p>Tìm một bản sách theo tên, tác giả hoặc ISBN.</p>
      </header>
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        <aside
          className="w-full lg:w-64 shrink-0 flex flex-col gap-6"
          aria-label="Lọc sách"
        >
          <label className="flex flex-col gap-2">
            Tìm sách
            <input
              value={params.get("q") ?? ""}
              onChange={(event) => update("q", event.target.value)}
              placeholder="Tên, tác giả, ISBN"
            />
          </label>
          <fieldset>
            <legend>Hình thức</legend>
            {[
              ["", "Tất cả"],
              ["Sale", "Bán"],
              ["Exchange", "Trao đổi"],
              ["Both", "Bán hoặc đổi"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 py-1">
                <input
                  type="radio"
                  name="mode"
                  checked={(params.get("mode") ?? "") === value}
                  onChange={() => update("mode", value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Tình trạng</legend>
            {Object.entries(conditionLabels).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={params.get("condition") === value}
                  onChange={() =>
                    update(
                      "condition",
                      params.get("condition") === value ? "" : value,
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        </aside>
        <section className="flex-1 min-w-0 w-full" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <p>
              {result.data
                ? `${result.data.items.length} cuốn trên trang này`
                : "Đang tìm sách"}
            </p>
            <label>
              Sắp xếp{" "}
              <select
                value={params.get("sort") ?? "newest"}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="newest">Mới nhất</option>
                <option value="salePriceAsc">Giá thấp đến cao</option>
                <option value="salePriceDesc">Giá cao đến thấp</option>
              </select>
            </label>
          </div>
          {result.isPending && <p>Đang tải kệ sách…</p>}
          {result.isError && (
            <div role="alert">
              <p>Không tải được kệ sách. Vui lòng kiểm tra API rồi thử lại.</p>
              <button type="button" onClick={() => void result.refetch()}>
                Thử lại
              </button>
            </div>
          )}
          {result.data?.items.length === 0 && (
            <p>Chưa có cuốn sách nào phù hợp.</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {result.data?.items.map((book, index) => (
              <BookCard key={book.id} book={book} index={index} />
            ))}
          </div>
          {result.data?.nextCursor && (
            <button
              type="button"
              className="mt-6 px-5 py-3 border border-outline-variant rounded"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("cursor", result.data!.nextCursor!);
                setParams(next);
              }}
            >
              Trang tiếp theo
            </button>
          )}
          {params.has("cursor") && (
            <button
              type="button"
              className="mt-6 px-5 py-3"
              onClick={() => update("cursor", "")}
            >
              Về trang đầu
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
