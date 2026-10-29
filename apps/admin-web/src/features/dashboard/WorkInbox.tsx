import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ApiError,
  uniqueWorkItems,
  workItemsPageSchema,
  workTarget,
  type CurrentUser,
} from "@used-books/session-client";
import { canReview, canReviewCatalog, session } from "../../core/session";
import { Button } from "../../core/ui";
import styles from "./WorkInbox.module.css";

export function OperationsWorkInbox({ user }: { user: CurrentUser }) {
  if (!canReview(user)) return null;
  return <Inbox key={user.id} user={user} />;
}
function Inbox({ user }: { user: CurrentUser }) {
  const [selection, setSelection] = useState("ListingReview");
  const lanes = [
    ["ListingReview", "Bài đăng sách"],
    ...(canReviewCatalog(user) ? [["CatalogReview", "Đầu sách"]] : []),
  ];
  const lane = lanes.some(([value]) => value === selection)
    ? selection
    : "ListingReview";
  const result = useInfiniteQuery({
    queryKey: ["operations-work-inbox", user.id, user.roles, lane],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      session.request(
        `/operations/work-items?lane=${lane}&limit=3${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
        workItemsPageSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const inaccessible =
    result.error instanceof ApiError &&
    [401, 403].includes(result.error.status);
  const items = inaccessible
    ? []
    : uniqueWorkItems(result.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <section className={styles.inbox} aria-labelledby="operations-work-title">
      <div className={styles.heading}>
        <h2 id="operations-work-title">Hồ sơ cần bạn xem</h2>
        <Button busy={result.isFetching} onClick={() => void result.refetch()}>
          Cập nhật
        </Button>
      </div>
      <p>
        Việc duyệt bài và đầu sách độc lập, cũ nhất trước. Giao nhận, sự cố và
        đánh giá vẫn nằm ở từng bàn vận hành bên dưới.
      </p>
      <div
        className={styles.filters}
        role="group"
        aria-label="Nhóm hồ sơ cần xem"
      >
        {lanes.map(([value, label]) => (
          <Button
            key={value}
            aria-pressed={lane === value}
            onClick={() => setSelection(value!)}
          >
            {label}
          </Button>
        ))}
      </div>
      {result.isPending && <p role="status">Đang tải hồ sơ…</p>}
      {result.error && (
        <div role="alert">
          <p>
            Chưa cập nhật được hồ sơ.{" "}
            {items.length
              ? "Các mục đang hiển thị thuộc lần tải trước."
              : "Chưa thể kết luận hàng đợi trống."}
          </p>
          <Button
            busy={result.isFetching}
            onClick={() =>
              void (result.isFetchNextPageError
                ? result.fetchNextPage()
                : result.refetch())
            }
          >
            Thử lại
          </Button>
        </div>
      )}
      {result.isSuccess && items.length === 0 && (
        <p role="status">
          Không có hồ sơ độc lập trong nhóm này. Kiểm tra những bàn vận hành
          được phân công để tiếp tục việc khác.
        </p>
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <p>{item.reason}</p>
            </div>
            <Link
              to={workTarget(item, "operations")!}
              aria-label={`Mở ${item.title}`}
            >
              Mở hồ sơ
            </Link>
          </li>
        ))}
      </ul>
      {result.hasNextPage && (
        <Button
          busy={result.isFetching}
          onClick={() => void result.fetchNextPage()}
        >
          Xem thêm hồ sơ
        </Button>
      )}
    </section>
  );
}
