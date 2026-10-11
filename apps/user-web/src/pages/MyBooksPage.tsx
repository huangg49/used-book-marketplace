import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, BookOpen, ArrowUpRight } from "lucide-react";
import { useSession } from "../hooks/useSession";
import {
  getMyListings,
  getMyPhoto,
  getMyBookIdentity,
  type MyListing,
} from "../services/my-listings";
import { conditions } from "../lib/listing-labels";
import { formatVnd } from "../lib/routes";
import styles from "./MyBooksPage.module.css";
import { EmptyOwnerShelf } from "../components/BookJourneyStates";

const moderationLabels = {
  Draft: "Bản nháp",
  PendingReview: "Chờ duyệt",
  Approved: "Đã duyệt",
  Rejected: "Bị từ chối",
};
const visibilityLabels = {
  Visible: "Hiển thị",
  Hidden: "Đang ẩn",
  Removed: "Đã gỡ",
};
const tradeLabels = {
  Available: "Sẵn sàng",
  Reserved: "Đang giữ",
  Sold: "Đã bán",
  Exchanged: "Đã đổi",
};
const filters = [
  { value: "", label: "Tất cả" },
  ...Object.entries(moderationLabels).map(([value, label]) => ({
    value,
    label,
  })),
];

function OwnerPhoto({ item, title }: { item: MyListing; title: string }) {
  const mediaId = item.currentRevision.content.mediaIds?.[0];
  const [failedUrl, setFailedUrl] = useState<string>();
  const query = useQuery({
    queryKey: ["my-photo", item.id, item.currentRevision.id, mediaId],
    queryFn: () => getMyPhoto(item.id, mediaId!),
    enabled: !!mediaId,
  });
  const url = query.data?.url;
  const failed = query.isError || (!!url && url === failedUrl);
  return (
    <div className={styles.cover}>
      {url && !failed ? (
        <img
          src={url}
          alt={`Ảnh bản sách ${title}`}
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <div className={styles.photoState}>
          <BookOpen size={24} aria-hidden="true" />
          <span>
            {failed
              ? "Chưa tải được ảnh"
              : mediaId
                ? "Đang tải ảnh…"
                : "Chưa có ảnh"}
          </span>
          {failed && (
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => {
                setFailedUrl(undefined);
                void query.refetch();
              }}
            >
              Tải lại ảnh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ShelfRow({ item }: { item: MyListing }) {
  const content = item.currentRevision.content;
  const bookId = content.bookId || item.currentRevision.bookId;
  const identity = useQuery({
    queryKey: ["my-book-identity", bookId, item.catalogStatus],
    queryFn: () => getMyBookIdentity(bookId!, item.catalogStatus),
    enabled: !!bookId,
  });
  const title =
    identity.data?.title ||
    content.title ||
    (identity.isLoading ? "Đang tải tên sách…" : "Chưa có thông tin tên sách");
  const author = identity.data?.authors.join(", ") || content.author;
  const publicVisible =
    item.state.moderation === "Approved" && item.state.visibility === "Visible";
  const updated =
    item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt))
      ? new Intl.DateTimeFormat("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(item.updatedAt))
      : undefined;
  return (
    <li className={styles.row}>
      <OwnerPhoto item={item} title={title} />
      <div className={styles.bookInfo}>
        <p className={styles.status}>
          <strong>{moderationLabels[item.state.moderation]}</strong>
          <span>
            {item.state.visibility === "Visible" &&
            item.state.moderation !== "Approved"
              ? "Chưa công khai"
              : visibilityLabels[item.state.visibility]}
          </span>
          <span>{tradeLabels[item.state.trade]}</span>
        </p>
        <h3>
          {publicVisible ? (
            <Link to={`/books/${item.id}`}>{title}</Link>
          ) : (
            title
          )}
        </h3>
        {author && <p className={styles.author}>{author}</p>}
        {identity.isError && (
          <p className={styles.identityError}>
            Chưa tải được thông tin sách.{" "}
            <button
              type="button"
              disabled={identity.isFetching}
              onClick={() => void identity.refetch()}
            >
              Thử lại
            </button>
          </p>
        )}
        <p className={styles.condition}>
          {content.condition
            ? conditions[content.condition]
            : "Chưa khai báo tình trạng"}{" "}
          ·{" "}
          {content.mode === "Sale"
            ? "Bán"
            : content.mode === "Exchange"
              ? "Đổi"
              : content.mode === "Both"
                ? "Bán hoặc đổi"
                : "Chưa chọn hình thức"}
        </p>
        {item.state.moderation === "Rejected" &&
          item.latestDecision?.reason && (
            <p className={styles.reason}>
              Lý do từ chối: {item.latestDecision.reason}
            </p>
          )}
        {item.state.visibility === "Removed" && item.removalReason && (
          <p className={styles.reason}>Lý do gỡ: {item.removalReason}</p>
        )}
        {item.state.moderation === "PendingReview" && (
          <p className={styles.note}>
            Bài đang chờ duyệt, chưa hiển thị công khai.
          </p>
        )}
        {updated && <p className={styles.updated}>Cập nhật {updated}</p>}
      </div>
      <div className={styles.prices}>
        {content.salePrice != null && (
          <p>
            <span>Giá bán</span>
            <strong>{formatVnd(content.salePrice)}</strong>
          </p>
        )}
        {content.exchangeValue != null && (
          <p>
            <span>Giá trị đổi</span>
            <strong>{formatVnd(content.exchangeValue)}</strong>
          </p>
        )}
        {publicVisible && (
          <Link
            className={styles.detail}
            to={`/books/${item.id}`}
            aria-label={`Xem bài đăng ${title}`}
          >
            Xem bài đăng <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </li>
  );
}

export function MyBooksPage() {
  const auth = useSession();
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get("moderation") || "";
  const filter = filters.some((f) => f.value === rawFilter) ? rawFilter : "";
  const cursor = params.get("cursor") || undefined;
  const query = useQuery({
    queryKey: [
      "my-listings",
      auth.status === "authenticated" ? auth.user.id : undefined,
      filter,
      cursor,
    ],
    queryFn: () => getMyListings(filter || undefined, cursor),
    enabled: auth.status === "authenticated",
  });
  function selectFilter(value: string) {
    const next = new URLSearchParams();
    if (value) next.set("moderation", value);
    setParams(next);
  }
  function page(nextCursor?: string) {
    const next = new URLSearchParams(params);
    if (nextCursor) next.set("cursor", nextCursor);
    else next.delete("cursor");
    setParams(next);
  }
  return (
    <div className={styles.root}>
      <header className={styles.heading}>
        <div>
          <h1>Kệ sách của tôi</h1>
          <p>
            Theo dõi từng bản sách, từ lúc gửi duyệt đến khi có người đọc tiếp.
          </p>
        </div>
        <Link className={styles.post} to="/sell">
          <Plus size={18} aria-hidden="true" />
          Đăng sách
        </Link>
      </header>
      <section className={styles.shelf} aria-label="Bài đăng của tôi">
        <div
          className={styles.filters}
          role="group"
          aria-label="Lọc theo trạng thái duyệt"
        >
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => selectFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {query.isLoading ? (
          <p className={styles.state} role="status">
            Đang tải kệ sách…
          </p>
        ) : query.isError ? (
          <div className={styles.state} role="alert">
            <h2>Chưa tải được kệ sách</h2>
            <p>
              Kiểm tra kết nối rồi thử lại. Các bài đăng của bạn vẫn được giữ
              trên máy chủ.
            </p>
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? "Đang thử lại…" : "Thử lại"}
            </button>
          </div>
        ) : query.data?.items.length ? (
          <>
            <p className={styles.count}>
              {query.data.items.length} bài đăng trên trang này
            </p>
            <ul className={styles.list}>
              {query.data.items.map((item) => (
                <ShelfRow key={item.id} item={item} />
              ))}
            </ul>
          </>
        ) : (
          <EmptyOwnerShelf cursor={cursor} filter={filter} onClear={() => selectFilter("")} />
        )}
        {(cursor || query.data?.nextCursor) && (
          <nav className={styles.pagination} aria-label="Trang kệ sách">
            {cursor && (
              <button type="button" onClick={() => page()}>
                Về trang đầu
              </button>
            )}
            {query.data?.nextCursor && (
              <button
                type="button"
                onClick={() => page(query.data!.nextCursor!)}
              >
                Trang tiếp theo
              </button>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
