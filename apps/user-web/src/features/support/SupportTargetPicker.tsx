import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
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

function TargetDescription({ option }: { option: SupportTargetOption }) {
  return (
    <>
      <strong>{option.label}</strong>
      <span className={styles.meta}>
        {[
          option.description !== option.label ? option.description : null,
          option.partnerName ? `Với ${option.partnerName}` : null,
          option.createdAt
            ? new Date(option.createdAt).toLocaleString("vi-VN")
            : null,
          option.state ? supportRelatedState(option.state) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </>
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
    [search, setSearch] = useState("");
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
    queryKey: ["support-target-options", owner, type, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      session.request(
        `/me/support-targets?${new URLSearchParams({ type, limit: "10", ...(search ? { q: search } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`,
        supportTargetOptionsPageSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!owner && active && transactions && !id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
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
          <span className={styles.meta}>Đã gắn kèm yêu cầu</span>
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
          <button ref={changeButton} type="button" onClick={() => onSelect("")}>
            {transactions ? "Chọn giao dịch khác" : "Bỏ chọn"}
          </button>
        </div>
      ) : null}
      {transactions && !id ? (
        <>
          <p>
            Chọn giao dịch của bạn theo tên người giao dịch, ngày và trạng thái.
          </p>
          <div className={styles.targetSearch}>
            <label htmlFor="support-target-search">
              {type === "Exchange"
                ? "Tìm theo tên người trao đổi"
                : "Tìm theo tên sách hoặc người giao dịch"}
            </label>
            <input
              id="support-target-search"
              ref={searchInput}
              type="search"
              maxLength={120}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSearch(input.trim());
                }
              }}
            />
            <button type="button" onClick={() => setSearch(input.trim())}>
              Tìm giao dịch
            </button>
          </div>
          {options.isPending && active ? (
            <p role="status">Đang tải giao dịch của bạn…</p>
          ) : null}
          {options.isError ? (
            <p role="alert">
              {supportError(options.error)}{" "}
              <button type="button" onClick={() => void options.refetch()}>
                Tải lại giao dịch
              </button>
            </p>
          ) : null}
          {!options.isError ? (
            <div
              className={styles.targetOptions}
              role="radiogroup"
              aria-label="Giao dịch của bạn"
            >
              {options.data?.pages
                .flatMap((page) => page.items)
                .map((option) => (
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
          {options.isSuccess && !options.data.pages[0].items.length ? (
            <p role="status">
              {search
                ? "Không có giao dịch khớp tìm kiếm. Thử tên khác hoặc xóa từ khóa."
                : "Bạn chưa có giao dịch thuộc loại này. Chọn loại khác hoặc gửi góp ý không gắn giao dịch."}
            </p>
          ) : null}
          {options.hasNextPage ? (
            <button
              type="button"
              disabled={options.isFetchingNextPage}
              onClick={() => void options.fetchNextPage()}
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
