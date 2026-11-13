import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Check, Search } from "lucide-react";
import {
  ApiError,
  supportTargetOptionSchema,
  supportTargetOptionsPageSchema,
  supportRelatedState,
  supportError,
  type SupportDraft,
  type SupportTargetOption,
} from "@used-books/session-client";
import { session } from "../../lib/session";
import { useSession } from "../../hooks/useSession";
import styles from "./support.module.css";

const date = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

function TargetDescription({ option }: { option: SupportTargetOption }) {
  const transaction = ["DirectOrder", "Exchange", "PointOrder"].includes(
    option.target.type,
  );
  const exchange = option.target.type === "Exchange";
  const give = option.booksToGive ?? [];
  const receive = option.booksToReceive ?? [];
  return (
    <span className={styles.targetDescription}>
      <span className={styles.targetIdentity}>
        <strong>
          {exchange && option.partnerName
            ? `Trao đổi với ${option.partnerName}`
            : option.label}
        </strong>
        {transaction && (
          <span className={styles.targetCode}>
            #{option.target.id.slice(0, 8).toUpperCase()}
          </span>
        )}
      </span>
      {exchange && (give.length > 0 || receive.length > 0) ? (
        <span className={styles.bookPair}>
          {give.length > 0 && (
            <span>
              <small>Bạn gửi</small>
              {give.join(" · ")}
            </span>
          )}
          {receive.length > 0 && (
            <span>
              <small>Bạn nhận</small>
              {receive.join(" · ")}
            </span>
          )}
        </span>
      ) : null}
      <span className={styles.targetMeta}>
        {option.state && (
          <span className={styles.targetState}>
            {supportRelatedState(option.state)}
          </span>
        )}
        {!exchange && option.partnerName && (
          <span>Với {option.partnerName}</span>
        )}
        {option.createdAt && (
          <time dateTime={option.createdAt}>
            {date.format(new Date(option.createdAt))}
          </time>
        )}
        {!transaction &&
          option.description !== option.label &&
          option.description && <span>{option.description}</span>}
      </span>
    </span>
  );
}

export function SupportTargetPicker({
  type,
  id,
  active,
  onSelect,
}: {
  type: Exclude<SupportDraft["targetType"], "">;
  id: string;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const auth = useSession(),
    owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const [input, setInput] = useState(""),
    [search, setSearch] = useState(""),
    [view, setView] = useState<"Current" | "History">("Current");
  const previousId = useRef(id),
    changeButton = useRef<HTMLButtonElement>(null),
    searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (id && !previousId.current) changeButton.current?.focus();
    if (!id && previousId.current) searchInput.current?.focus();
    previousId.current = id;
  }, [id]);
  const transactions = ["DirectOrder", "Exchange", "PointOrder"].includes(type);
  const selected = useQuery({
    queryKey: ["support-target", owner, type, id],
    queryFn: () =>
      session.request(
        `/me/support-targets/${type}/${encodeURIComponent(id)}`,
        supportTargetOptionSchema,
      ),
    enabled: !!owner && active && !!id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const options = useInfiniteQuery({
    queryKey: ["support-target-options", owner, type, view, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/support-targets?${new URLSearchParams({ type, view, limit: "6", ...(search ? { q: search } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        supportTargetOptionsPageSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!owner && active && transactions && !id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const inaccessible =
    options.error instanceof ApiError &&
    [401, 403, 404].includes(options.error.status);
  const items = inaccessible
    ? []
    : (options.data?.pages.flatMap((page) => page.items) ?? []);
  const destinations = {
    Listing: { to: "/books", label: "Tìm bài đăng sách" },
    Auction: { to: "/auctions", label: "Xem các phiên đấu giá" },
    Review: { to: "/account", label: "Về tài khoản của tôi" },
    Member: { to: "/books", label: "Tìm bài đăng của thành viên" },
  };
  const destination = destinations[type as keyof typeof destinations];
  return (
    <section
      className={styles.targetPicker}
      aria-label="Chọn nội dung liên quan"
    >
      {id ? (
        <div className={styles.selectedTarget}>
          <span className={styles.attached}>
            <Check size={16} aria-hidden="true" /> Đã gắn kèm yêu cầu
          </span>
          {selected.isFetching ? (
            <span role="status">Đang tải thông tin đã chọn…</span>
          ) : null}
          {selected.isSuccess && !selected.isError ? (
            <TargetDescription option={selected.data} />
          ) : null}
          {selected.isError ? (
            <p role="alert">
              Không tải được nội dung đã chọn. {supportError(selected.error)}{" "}
              <button type="button" onClick={() => void selected.refetch()}>
                Tải lại thông tin
              </button>
            </p>
          ) : null}
          <button
            ref={changeButton}
            type="button"
            className={styles.changeTarget}
            onClick={() => onSelect("")}
          >
            {transactions && <ArrowLeftRight size={16} aria-hidden="true" />}
            {transactions ? "Chọn giao dịch khác" : "Bỏ chọn"}
          </button>
        </div>
      ) : null}
      {transactions && !id ? (
        <>
          <div
            className={styles.targetViews}
            role="group"
            aria-label="Phạm vi giao dịch"
          >
            <button
              type="button"
              aria-pressed={view === "Current"}
              onClick={() => setView("Current")}
            >
              Đang diễn ra
            </button>
            <button
              type="button"
              aria-pressed={view === "History"}
              onClick={() => setView("History")}
            >
              Lịch sử
            </button>
          </div>
          <div className={styles.targetSearch}>
            <label htmlFor="support-target-search">
              Tìm theo tên sách, người giao dịch hoặc mã
            </label>
            <input
              id="support-target-search"
              ref={searchInput}
              type="search"
              placeholder="Tên sách, đối tác hoặc #mã"
              maxLength={120}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!e.target.value.trim()) setSearch("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSearch(input.trim());
                }
              }}
            />
            <button type="button" onClick={() => setSearch(input.trim())}>
              <Search size={16} aria-hidden="true" /> Tìm giao dịch
            </button>
          </div>
          {options.isPending && active ? (
            <p role="status">Đang tải giao dịch của bạn…</p>
          ) : null}
          {options.isError ? (
            <p role="alert">
              {supportError(options.error)}{" "}
              <button
                type="button"
                disabled={options.isFetching}
                onClick={() =>
                  void (options.isFetchNextPageError && !inaccessible
                    ? options.fetchNextPage({ cancelRefetch: false })
                    : options.refetch())
                }
              >
                Tải lại giao dịch
              </button>
            </p>
          ) : null}
          {!inaccessible ? (
            <div
              className={styles.targetOptions}
              role="radiogroup"
              aria-label="Giao dịch của bạn"
            >
              {items.map((option) => (
                <label
                  key={option.target.id}
                  className={styles.targetOption}
                  data-selected={id === option.target.id}
                >
                  <input
                    type="radio"
                    name="support-target"
                    checked={id === option.target.id}
                    onChange={() => onSelect(option.target.id)}
                  />
                  <span>
                    <TargetDescription option={option} />
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {options.isSuccess && !items.length && options.hasNextPage ? (
            <p role="status">
              Chưa thấy giao dịch trong dữ liệu đã tải. Bấm “Xem thêm giao dịch”
              để kiểm tra những trang còn lại.
            </p>
          ) : null}
          {options.isSuccess && !items.length && !options.hasNextPage ? (
            <p role="status">
              {search
                ? "Không có giao dịch khớp tìm kiếm trong mục này."
                : view === "Current"
                  ? "Bạn chưa có giao dịch đang diễn ra. Mở Lịch sử để tìm giao dịch đã đóng."
                  : "Bạn chưa có giao dịch đã đóng thuộc loại này."}
            </p>
          ) : null}
          {options.hasNextPage && !inaccessible ? (
            <button
              type="button"
              disabled={options.isFetching}
              onClick={() =>
                void options.fetchNextPage({ cancelRefetch: false })
              }
            >
              {options.isFetchingNextPage ? "Đang tải…" : "Xem thêm giao dịch"}
            </button>
          ) : null}
        </>
      ) : !id && destination ? (
        <div className={styles.notice}>
          <p>
            Mở{" "}
            {type === "Review"
              ? "đánh giá trên hồ sơ thành viên"
              : type === "Member"
                ? "hồ sơ thành viên từ bài đăng hoặc giao dịch"
                : "nội dung bạn muốn phản ánh"}
            , rồi chọn <strong>Báo cáo nội dung</strong>. Hệ thống sẽ gắn kèm
            nội dung đó và giữ phần bạn đang viết khi quay lại trang này.
          </p>
          <Link to={destination.to}>{destination.label} →</Link>
        </div>
      ) : null}
    </section>
  );
}
