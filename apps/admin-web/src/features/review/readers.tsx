import { dateText, money } from "../../core/format";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { session } from "../../core/session";
import { Button, CursorPagination, ErrorNotice, Notice } from "../../core/ui";
import {
  book,
  catalog,
  labels,
  mediaRead,
  pageOf,
  revision,
  type Metadata,
  type Revision,
} from "./contracts";

export function MetadataView({ value }: { value: Metadata }) {
  return (
    <dl className="facts">
      <div>
        <dt>Tác giả</dt>
        <dd>{value.authors.join(" · ")}</dd>
      </div>
      <div>
        <dt>Nhà xuất bản · Năm</dt>
        <dd>
          {value.publisher || "Chưa cung cấp"} ·{" "}
          {value.publicationYear || "Chưa cung cấp"}
        </dd>
      </div>
      <div>
        <dt>Thể loại · Ngôn ngữ</dt>
        <dd>
          {value.category} · {value.language}
        </dd>
      </div>
      <div>
        <dt>Ấn bản</dt>
        <dd>{value.edition || "Chưa cung cấp"}</dd>
      </div>
      <div>
        <dt>ISBN</dt>
        <dd>{value.isbn || "Không có ISBN"}</dd>
      </div>
    </dl>
  );
}
export function BookReference({
  id,
  confirmed,
  admin,
  onReady,
}: {
  id: string | null;
  confirmed: boolean;
  admin: boolean;
  onReady: (ready: boolean) => void;
}) {
  const result = useQuery({
    queryKey: ["book-reference", id, confirmed, admin],
    enabled: !!id && (confirmed || admin),
    queryFn: async () =>
      confirmed
        ? session.request(`/catalog/books/${id}`, book)
        : (await session.request(`/operations/catalog-requests/${id}`, catalog))
            .currentRevision.metadata,
  });
  const ready = confirmed && !!result.data && !result.isError;
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  return (
    <section className="section">
      <p className="eyebrow">Đối chiếu đầu sách</p>
      {result.isLoading && <p role="status">Đang tải thông tin đầu sách…</p>}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.data && (
        <>
          <h3>{result.data.title}</h3>
          <MetadataView value={result.data} />
        </>
      )}
      {!confirmed && (
        <Notice tone="warning">
          Đầu sách chưa được xác nhận. Cần Admin xử lý thông tin đầu sách trước
          khi duyệt bài đăng.
        </Notice>
      )}
    </section>
  );
}
export function Photo({
  listingId,
  id,
  index,
  onReady,
}: {
  listingId: string;
  id: string;
  index: number;
  onReady?: (id: string, ready: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  const result = useQuery({
    queryKey: ["review-media", listingId, id],
    queryFn: () =>
      session.request(
        `/operations/listings/${listingId}/media/${id}/read`,
        mediaRead,
      ),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
  const url = result.data?.url;
  const ready = !!url && loaded === url && failed !== url && !result.isError;
  useEffect(() => {
    onReady?.(id, ready);
    return () => onReady?.(id, false);
  }, [id, ready, onReady]);
  useEffect(() => {
    if (!ready) dialog.current?.close();
  }, [ready]);
  return (
    <figure className="photo">
      {result.isLoading && <p role="status">Đang lấy ảnh {index + 1}…</p>}
      {result.error ? (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      ) : (
        url && (
          <>
            {failed !== url && (
              <button
                className="photo-button"
                type="button"
                onClick={() => dialog.current?.showModal()}
                disabled={!ready}
                aria-label={`Xem lớn ảnh ${index + 1}`}
              >
                <img
                  src={url}
                  alt={`Ảnh ${index + 1} do người đăng cung cấp`}
                  referrerPolicy="no-referrer"
                  onLoad={() => setLoaded(url)}
                  onError={() => setFailed(url)}
                />
              </button>
            )}
            {failed === url && (
              <Notice tone="error">
                Ảnh chưa tải được.{" "}
                <Button
                  busy={result.isFetching}
                  onClick={() => {
                    setFailed("");
                    setLoaded("");
                    void result.refetch();
                  }}
                >
                  Tải lại ảnh {index + 1}
                </Button>
              </Notice>
            )}
            <dialog
              ref={dialog}
              className="image-dialog"
              aria-label={`Xem lớn ảnh ${index + 1}`}
            >
              <Button autoFocus onClick={() => dialog.current?.close()}>
                Đóng ảnh {index + 1}
              </Button>
              {ready && (
                <img
                  src={url}
                  alt={`Chi tiết ảnh ${index + 1}`}
                  referrerPolicy="no-referrer"
                />
              )}
            </dialog>
          </>
        )
      )}
      <figcaption>
        Ảnh {String(index + 1).padStart(2, "0")}
        {index === 0 ? " · Ảnh đầu" : ""}
      </figcaption>
    </figure>
  );
}
const yesNo = (value: boolean | null) =>
  value === null ? "Chưa khai báo" : value ? "Có" : "Không";
export function ContentView({
  value,
  listingId,
  onPhotoReady,
}: {
  value: Revision;
  listingId: string;
  onPhotoReady?: (id: string, ready: boolean) => void;
}) {
  const c = value.content;
  return (
    <>
      <section className="section">
        <h3>Lựa chọn giao nhận</h3>
        {value.fulfillmentStatus === "Current" ? (
          <p>
            Giao trực tiếp · TP.HCM · vùng mô phỏng. Địa chỉ riêng không hiển
            thị cho người duyệt.
          </p>
        ) : value.fulfillmentStatus === "NeedsUpdate" ? (
          <Notice tone="warning">
            Nơi gửi đã thay đổi hoặc bị xóa. Chưa thể duyệt bài; yêu cầu người
            đăng cập nhật qua bản sửa.
          </Notice>
        ) : (
          <p>
            Chưa khai báo nơi gửi. Có thể duyệt nội dung; giao dịch chưa mở.
          </p>
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <h3>Ảnh người đăng gửi</h3>
          <span>{c.mediaIds.length} ảnh</span>
        </div>
        <p className="muted">
          Xem rõ từng ảnh để đối chiếu. Ảnh cung cấp không chứng minh sách chính
          hãng hay quyền sở hữu.
        </p>
        <div className="photos">
          {c.mediaIds.map((id, index) => (
            <Photo
              key={id}
              id={id}
              index={index}
              listingId={listingId}
              onReady={onPhotoReady}
            />
          ))}
        </div>
      </section>
      <section className="section">
        <h3>Tình trạng bản sách</h3>
        <dl className="facts">
          <div>
            <dt>Người đăng đánh giá</dt>
            <dd>{labels[c.condition || ""] || "Chưa khai báo"}</dd>
          </div>
          <div>
            <dt>Ruột sách</dt>
            <dd>{c.pages || "Chưa mô tả"}</dd>
          </div>
          <div>
            <dt>Bìa và gáy</dt>
            <dd>{c.coverNote || "Chưa mô tả"}</dd>
          </div>
          <div>
            <dt>Ghi chú / đánh dấu</dt>
            <dd>{c.notes || "Chưa mô tả"}</dd>
          </div>
          <div>
            <dt>Phụ kiện</dt>
            <dd>{c.accessories || "Chưa mô tả"}</dd>
          </div>
          <div>
            <dt>Còn đọc được</dt>
            <dd>{yesNo(c.readable)}</dd>
          </div>
          <div>
            <dt>Thiếu trang</dt>
            <dd>{yesNo(c.hasMissingPages)}</dd>
          </div>
          <div>
            <dt>Thiếu nội dung trọng yếu</dt>
            <dd>{yesNo(c.missingEssentialContent)}</dd>
          </div>
        </dl>
        <p className="prose">{c.description}</p>
      </section>
      <section className="section">
        <h3>Giá và cách trao sách</h3>
        <dl className="facts">
          <div>
            <dt>Hình thức</dt>
            <dd>{labels[c.mode || ""] || "Chưa chọn"}</dd>
          </div>
          <div>
            <dt>Giá bán</dt>
            <dd className="price">{money(c.salePrice)}</dd>
          </div>
          <div>
            <dt>Giá trị đổi</dt>
            <dd className="price">{money(c.exchangeValue)}</dd>
          </div>
        </dl>
      </section>
      <p className="muted">
        Người đăng khai báo quyền đăng sách:{" "}
        {dateText(value.ownershipDeclaredAt)}.
      </p>
    </>
  );
}
export function History({
  listingId,
  currentId,
}: {
  listingId: string;
  currentId: string;
}) {
  const result = useInfiniteQuery({
    queryKey: ["revisions", listingId],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/listings/${listingId}/revisions?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        pageOf(revision),
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
  });
  return (
    <section className="section history">
      <h3>Lịch sử đã gửi</h3>
      {result.isLoading && <p role="status">Đang tải lịch sử…</p>}
      {result.error && (
        <ErrorNotice
          error={result.error}
          retry={() => void result.refetch()}
          busy={result.isFetching}
        />
      )}
      {result.data?.pages
        .flatMap((page) => page.items)
        .map((item) => (
          <details key={item.id}>
            <summary>
              Bản gửi {item.number} · {dateText(item.submittedAt)} ·{" "}
              {item.decision
                ? labels[item.decision.decision]
                : "Chưa quyết định"}
              {item.id === currentId ? " · Hiện tại" : ""}
            </summary>
            <p className="prose">
              {item.decision?.reason || "Không có lý do từ chối."}
            </p>
            <HistoryContent item={item} listingId={listingId} />
          </details>
        ))}
      <CursorPagination
        pageCount={result.data?.pages.length ?? 0}
        hasNextPage={result.hasNextPage}
        isFetchingNextPage={result.isFetchingNextPage}
        onNextPage={() => void result.fetchNextPage()}
        nextLabel="Xem thêm lịch sử"
      />
    </section>
  );
}
function HistoryContent({
  item,
  listingId,
}: {
  item: Revision;
  listingId: string;
}) {
  // Explicit expansion avoids issuing signed-image reads for collapsed old revisions.
  const [show, setShow] = useState(false);
  return show ? (
    <>
      <p className="muted">
        Nội dung lưu tại lần gửi này. Mã đầu sách: {item.content.bookId}
      </p>
      <ContentView value={item} listingId={listingId} />
    </>
  ) : (
    <Button onClick={() => setShow(true)}>
      Xem nội dung bản gửi {item.number}
    </Button>
  );
}
