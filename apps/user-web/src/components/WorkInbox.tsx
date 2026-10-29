import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ApiError,
  uniqueWorkItems,
  workAttention,
  workItemsPageSchema,
  workLanesFor,
  workTarget,
  type WorkLane,
} from "@used-books/session-client";
import { session } from "../lib/session";
import styles from "./WorkInbox.module.css";

export function WorkInbox({
  ownerId,
  status,
}: {
  ownerId: string;
  status: string;
}) {
  const [selection, setSelection] = useState<WorkLane>("DirectOrders");
  const lanes = workLanesFor(status);
  const lane = lanes.some(([value]) => value === selection)
    ? selection
    : "DirectOrders";
  const result = useInfiniteQuery({
    queryKey: ["work-inbox", ownerId, status, lane],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/work-items?lane=${lane}&limit=5${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
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
  const observed = result.data?.pages[0]?.serverTime;
  return (
    <section aria-labelledby="work-inbox-title" className={styles.inbox}>
      <div className={styles.heading}>
        <h2 id="work-inbox-title">Việc đang chờ</h2>
        <button
          type="button"
          disabled={result.isFetching}
          onClick={() => void result.refetch()}
        >
          {result.isFetching ? "Đang cập nhật…" : "Cập nhật"}
        </button>
      </div>
      <p>
        Chọn nhóm để xem việc của bạn, lý do và hạn xử lý. Mở giao dịch để kiểm
        tra bước được phép thực hiện.
      </p>
      <div
        className={styles.filters}
        role="group"
        aria-label="Nhóm việc đang chờ"
      >
        {lanes.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === lane}
            onClick={() => setSelection(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {result.isPending && <p role="status">Đang tải việc trong nhóm này…</p>}
      {result.error && (
        <div role="alert">
          <p>
            Chưa cập nhật được danh sách.{" "}
            {items.length
              ? "Các mục bên dưới là thông tin lần tải trước."
              : "Chưa thể kết luận bạn có việc cần làm hay không."}
          </p>
          <button
            type="button"
            disabled={result.isFetching}
            onClick={() =>
              void (result.isFetchNextPageError
                ? result.fetchNextPage()
                : result.refetch())
            }
          >
            Thử lại
          </button>
        </div>
      )}
      {result.isSuccess && items.length === 0 && (
        <p role="status">
          Chưa có việc trong nhóm này. Những nhóm khác và đánh giá sau giao dịch
          có nơi theo dõi riêng bên dưới.
        </p>
      )}
      <ul className={styles.rows}>
        {items.map((item) => {
          const path = workTarget(item, "web");
          return (
            <li key={item.id}>
              <div>
                <span className={styles.attention}>
                  {workAttention[item.attention]}
                </span>
                <h3>{item.title}</h3>
                <p>{item.reason}</p>
                {item.dueAt && (
                  <p className={styles.deadline}>
                    Mốc xử lý:{" "}
                    <time dateTime={item.dueAt}>
                      {new Date(item.dueAt).toLocaleString("vi-VN")}
                    </time>
                  </p>
                )}
              </div>
              {path && (
                <Link to={path} aria-label={`Mở ${item.title}`}>
                  Mở chi tiết
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {result.hasNextPage && (
        <button
          type="button"
          disabled={result.isFetching}
          onClick={() => void result.fetchNextPage()}
        >
          {result.isFetchingNextPage
            ? "Đang tải thêm…"
            : "Xem thêm việc trong nhóm"}
        </button>
      )}
      {observed && (
        <p className={styles.updated}>
          Theo trạng thái lúc{" "}
          <time dateTime={observed}>
            {new Date(observed).toLocaleTimeString("vi-VN")}
          </time>
          . Danh sách tự cập nhật khi bạn quay lại; việc đã đóng sẽ được bỏ khỏi
          nhóm.
        </p>
      )}
    </section>
  );
}
