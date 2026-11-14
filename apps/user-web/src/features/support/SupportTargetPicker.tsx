import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowRight, ArrowUpRight, Check, Search } from "lucide-react";
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

function TargetDescription({
  option,
  selected = false,
}: {
  option: SupportTargetOption;
  selected?: boolean;
}) {
  const transaction = ["DirectOrder", "Exchange", "PointOrder"].includes(
    option.target.type,
  );
  const exchange = option.target.type === "Exchange";
  const give = option.booksToGive ?? [];
  const receive = option.booksToReceive ?? [];
  const hasBooks = exchange && (give.length > 0 || receive.length > 0);
  const identity = exchange && option.partnerName
    ? `Trao đổi với ${option.partnerName}`
    : option.label;
  return (
    <span className={styles.targetDescription}>
      {hasBooks ? (
        <span className={styles.bookPair}>
          {give.length > 0 && (
            <span>
              <small>Bạn gửi</small>
              <strong>{give.join(" · ")}</strong>
            </span>
          )}
          {receive.length > 0 && (
            <span>
              <small>Bạn nhận</small>
              <strong>{receive.join(" · ")}</strong>
            </span>
          )}
        </span>
      ) : <strong className={styles.targetName}>{identity}</strong>}
      <span className={styles.targetMeta}>
        {hasBooks && <span>{identity}</span>}
        {transaction && (
          <span className={styles.targetCode}>
            #{option.target.id.slice(0, 8).toUpperCase()}
          </span>
        )}
        {option.state && (
          <span className={styles.targetState}
            data-dispute={["Disputed", "ResolutionPending"].includes(option.state) || undefined}>
            {supportRelatedState(option.state)}
          </span>
        )}
        {!exchange && option.partnerName && (
          <span>Với {option.partnerName}</span>
        )}
        {(!selected || !hasBooks) && option.createdAt && (
          <time dateTime={option.createdAt}>
            {date.format(new Date(option.createdAt))}
          </time>
        )}
        {!transaction &&
          option.description !== option.label &&
          option.description && <span>{option.description}</span>}
      </span>
      {exchange && !hasBooks && selected && (
        <span className={styles.targetMeta}>Phiếu cũ thiếu tên sách. Dùng mã và ngày để đối chiếu.</span>
      )}
    </span>
  );
}

export function SupportTargetPicker({
  type,
  id,
  active,
  onSelect,
  onChanging,
}: {
  type: Exclude<SupportDraft["targetType"], "">;
  id: string;
  active: boolean;
  onSelect: (id: string) => void;
  onChanging: (open: boolean) => void;
}) {
  const auth = useSession(),
    owner = auth.status === "authenticated" ? auth.user.id : undefined;
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"Current" | "History">("Current");
  const [changing, setChanging] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const transactions = ["DirectOrder", "Exchange", "PointOrder"].includes(type);
  const choosing = transactions && (!id || changing);

  useEffect(() => {
    if (!restoreFocus.current) return;
    const control = choosing ? searchInput.current : changeButton.current;
    if (!control) return;
    restoreFocus.current = false;
    control.focus({ preventScroll: true });
    const headerBottom =
      document
        .querySelector("[data-member-header-slot] header")
        ?.getBoundingClientRect().bottom ?? 0;
    const bounds = control.getBoundingClientRect();
    if (bounds.top < headerBottom + 8 || bounds.bottom > window.innerHeight) {
      control.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [choosing, id]);

  function togglePicker(open: boolean) {
    restoreFocus.current = true;
    if (open) {
      setInput("");
      setSearch("");
      setView("Current");
    }
    setChanging(open);
    onChanging(open);
  }
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
    enabled: !!owner && active && choosing,
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
  const detailPath =
    type === "Exchange"
      ? `/exchange/${id}`
      : type === "DirectOrder"
        ? `/orders/${id}`
        : undefined;
  return (
    <section
      className={styles.targetPicker}
      aria-label="Chọn nội dung liên quan"
    >
      {id && !choosing && (
        <div className={styles.selectedTarget}>
          <span className={styles.attached}>
            <Check size={16} aria-hidden="true" />
            <span className={styles.visuallyHidden}>{transactions ? "Giao dịch đã chọn" : "Nội dung đã chọn"}</span>
          </span>
          {selected.isSuccess && (
            <TargetDescription option={selected.data} selected />
          )}
          {selected.isPending && active && (
            <p role="status">Đang tải thông tin giao dịch…</p>
          )}
          {selected.isError && (
            <div className={styles.pickerFeedback} role="alert">
              <p>
                Không tải được nội dung đã chọn. {supportError(selected.error)}
              </p>
              <button type="button" onClick={() => void selected.refetch()}>
                Tải lại thông tin
              </button>
            </div>
          )}
          <div className={styles.ticketActions}>
            {detailPath && selected.isSuccess && (
              <Link to={detailPath}>
                Xem giao dịch <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            )}
            <button
              ref={changeButton}
              type="button"
              className={styles.changeTarget}
              onClick={() => (transactions ? togglePicker(true) : onSelect(""))}
            >
              {transactions && <ArrowLeftRight size={16} aria-hidden="true" />}
              {transactions ? "Đổi giao dịch" : "Bỏ chọn"}
            </button>
          </div>
        </div>
      )}
      {choosing ? (
        <div className={styles.chooseTarget}>
          <div className={styles.pickerHeader}>
            <h2>Chọn giao dịch</h2>
            {id && (
              <button type="button" onClick={() => togglePicker(false)}>
                Giữ giao dịch hiện tại
              </button>
            )}
          </div>
          <div
            className={styles.targetViews}
            role="group"
            aria-label="Phạm vi giao dịch"
          >
            <button
              type="button"
              aria-pressed={view === "Current"}
              data-focus-inverse={view === "Current" || undefined}
              onClick={() => setView("Current")}
            >
              Đang diễn ra
            </button>
            <button
              ref={historyButton}
              type="button"
              aria-pressed={view === "History"}
              data-focus-inverse={view === "History" || undefined}
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
          {!inaccessible && items.length > 0 ? (
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
                    onChange={() => {
                      onSelect(option.target.id);
                      togglePicker(false);
                    }}
                  />
                  <TargetDescription option={option} />
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
            <div className={styles.targetEmpty}>
              <p role="status">
                {search
                  ? "Không có giao dịch khớp tìm kiếm trong mục này."
                  : view === "Current"
                    ? "Bạn chưa có giao dịch đang diễn ra."
                    : "Bạn chưa có giao dịch đã đóng thuộc loại này."}
              </p>
              {!search && view === "Current" && (
                <button type="button" onClick={() => {
                  historyButton.current?.focus();
                  setView("History");
                }}>
                  Xem giao dịch đã đóng <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
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
        </div>
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
